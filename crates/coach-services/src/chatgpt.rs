//! Official public-client ChatGPT plan OAuth for AntiRL.
use crate::{ident, CoachService, ServiceResult};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::Path, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    time::timeout,
};
use url::Url;

const ISSUER: &str = "https://auth.openai.com";
const AUTHORIZE: &str = "https://auth.openai.com/api/accounts/authorize";
const TOKEN: &str = "https://auth.openai.com/api/accounts/oauth/token";
const RESOURCE: &str = "https://api.openai.com/v1";
const SCOPE: &str = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";

#[derive(Clone, Serialize, Deserialize)]
struct Account {
    client_id: String,
    subject: String,
    email: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct Accounts {
    active: Option<String>,
    accounts: Vec<Account>,
}

#[derive(Serialize, Deserialize)]
struct Tokens {
    access_token: String,
    refresh_token: String,
    id_token: String,
    scope: String,
    expires_at: i64,
}

#[derive(Deserialize)]
struct Claims {
    sub: String,
    email: Option<String>,
    nonce: Option<String>,
}

fn atomic(path: &Path, bytes: &[u8]) -> ServiceResult<()> {
    let temp = path.with_extension(format!("{}.tmp", ident()));
    fs::write(&temp, bytes).map_err(|_| "Could not save ChatGPT profile")?;
    fs::rename(temp, path).map_err(|_| "Could not update ChatGPT profile".into())
}

fn vault(name: &str) -> ServiceResult<keyring::Entry> {
    keyring::Entry::new("AntiRL", name).map_err(|_| "Windows credential vault unavailable".into())
}

fn chunk_name(client: &str, generation: &str, index: usize) -> String {
    format!("chatgpt-{client}-{generation}-{index}")
}

fn delete_record(client: &str) -> ServiceResult<()> {
    let e = vault(&format!("chatgpt-{client}"))?;
    if let Ok(raw) = e.get_password() {
        if let Ok(m) = serde_json::from_str::<Value>(&raw) {
            if let (Some(g), Some(n)) = (m["generation"].as_str(), m["parts"].as_u64()) {
                for i in 0..n.min(100) {
                    let _ = vault(&chunk_name(client, g, i as usize))?.delete_credential();
                }
            }
        }
    }
    match e.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not clear ChatGPT credential".into()),
    }
}

fn save_tokens(client: &str, t: &Tokens) -> ServiceResult<()> {
    let encoded =
        URL_SAFE_NO_PAD.encode(serde_json::to_vec(t).map_err(|_| "Invalid credential record")?);
    if encoded.len() > 100_000 {
        return Err("Credential record too large".into());
    }
    let generation = ident();
    let chunks: Vec<&[u8]> = encoded.as_bytes().chunks(800).collect();
    let pointer = vault(&format!("chatgpt-{client}"))?;
    let old = pointer.get_password().ok();
    for (i, c) in chunks.iter().enumerate() {
        if vault(&chunk_name(client, &generation, i))?
            .set_password(std::str::from_utf8(c).unwrap())
            .is_err()
        {
            for j in 0..=i {
                let _ = vault(&chunk_name(client, &generation, j))?.delete_credential();
            }
            return Err("Could not protect ChatGPT tokens in Windows vault".into());
        }
    }
    pointer
        .set_password(&json!({"generation": generation, "parts": chunks.len()}).to_string())
        .map_err(|_| "Could not protect ChatGPT token manifest")?;
    if let Some(old) = old.and_then(|s| serde_json::from_str::<Value>(&s).ok()) {
        if let (Some(g), Some(n)) = (old["generation"].as_str(), old["parts"].as_u64()) {
            for i in 0..n.min(100) {
                let _ = vault(&chunk_name(client, g, i as usize))?.delete_credential();
            }
        }
    }
    Ok(())
}

fn load_tokens(client: &str) -> ServiceResult<Tokens> {
    let raw = vault(&format!("chatgpt-{client}"))?
        .get_password()
        .map_err(|_| "Continue with ChatGPT in Settings first")?;
    let m: Value = serde_json::from_str(&raw).map_err(|_| "Invalid credential manifest")?;
    let g = m["generation"]
        .as_str()
        .ok_or("Invalid credential manifest")?;
    let n = m["parts"]
        .as_u64()
        .filter(|n| *n > 0 && *n <= 100)
        .ok_or("Invalid credential manifest")?;
    let mut encoded = String::new();
    for i in 0..n {
        encoded.push_str(
            &vault(&chunk_name(client, g, i as usize))?
                .get_password()
                .map_err(|_| "Incomplete credential record; sign in again")?,
        );
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| "Invalid credential record")?;
    serde_json::from_slice(&bytes).map_err(|_| "Invalid credential record".into())
}

fn granted(scope: &str) -> bool {
    let scopes: Vec<_> = scope.split_whitespace().collect();
    scopes.contains(&"resource.invoke") && scopes.contains(&"chatgpt.tokens.use.direct")
}

fn token_record(value: &Value, old: Option<&Tokens>) -> ServiceResult<Tokens> {
    if value["token_type"]
        .as_str()
        .is_some_and(|s| !s.eq_ignore_ascii_case("bearer"))
    {
        return Err("Unexpected token type from authorization server".into());
    }
    let access_token = value["access_token"]
        .as_str()
        .ok_or("Missing access token")?
        .to_string();
    let refresh_token = value["refresh_token"]
        .as_str()
        .map(str::to_string)
        .or_else(|| old.map(|o| o.refresh_token.clone()))
        .ok_or("Missing refresh token")?;
    let id_token = value["id_token"]
        .as_str()
        .map(str::to_string)
        .or_else(|| old.map(|o| o.id_token.clone()))
        .ok_or("Missing ID token")?;
    let scope = value["scope"]
        .as_str()
        .map(str::to_string)
        .or_else(|| old.map(|o| o.scope.clone()))
        .unwrap_or_default();
    let expires_in = value["expires_in"].as_i64().unwrap_or(3600);
    Ok(Tokens {
        access_token,
        refresh_token,
        id_token,
        scope,
        expires_at: Utc::now().timestamp() + expires_in,
    })
}

impl CoachService {
    fn account_file(&self) -> std::path::PathBuf {
        self.dir.join("chatgpt-accounts.json")
    }

    fn accounts(&self) -> Accounts {
        let p = self.account_file();
        fs::read(&p)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    fn save_accounts(&self, acc: &Accounts) -> ServiceResult<()> {
        let b = serde_json::to_vec_pretty(acc).map_err(|_| "Could not encode accounts")?;
        atomic(&self.account_file(), &b)
    }

    pub fn chatgpt_status(&self) -> Value {
        let acc = self.accounts();
        let Some(active) = acc.active.as_ref() else {
            return json!({"status": "signed_out", "provider": "chatgpt"});
        };
        let email = acc
            .accounts
            .iter()
            .find(|a| &a.client_id == active)
            .and_then(|a| a.email.clone());
        match load_tokens(active) {
            Ok(t) => {
                let valid = granted(&t.scope);
                json!({
                    "status": if valid { "connected" } else { "insufficient_scope" },
                    "provider": "chatgpt",
                    "email": email,
                    "scope": t.scope,
                    "expires_at": t.expires_at,
                    "expires_in": (t.expires_at - Utc::now().timestamp()).max(0)
                })
            }
            Err(_) => json!({"status": "expired", "provider": "chatgpt", "email": email}),
        }
    }

    pub fn sign_out_chatgpt(&self) -> ServiceResult<()> {
        let mut acc = self.accounts();
        if let Some(active) = acc.active.take() {
            let _ = delete_record(&active);
            acc.accounts.retain(|a| a.client_id != active);
            self.save_accounts(&acc)?;
        }
        Ok(())
    }

    pub async fn start_chatgpt_sign_in(&self) -> ServiceResult<Value> {
        let _guard = self
            .oauth_gate
            .try_lock()
            .map_err(|_| "Sign-in already in progress in your browser")?;
        let verifier: String = (0..64)
            .map(|_| {
                let idx = (rand_byte() as usize) % 62;
                b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[idx] as char
            })
            .collect();
        let mut hasher = Sha256::new();
        hasher.update(verifier.as_bytes());
        let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());
        let state: String = (0..32)
            .map(|_| {
                let idx = (rand_byte() as usize) % 62;
                b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[idx] as char
            })
            .collect();
        let nonce: String = (0..32)
            .map(|_| {
                let idx = (rand_byte() as usize) % 62;
                b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[idx] as char
            })
            .collect();

        let listener = TcpListener::bind("127.0.0.1:14555")
            .await
            .map_err(|_| "Could not bind local authentication callback port (14555)")?;

        let client_id = "antirl-desktop-client";
        let redirect_uri = "http://127.0.0.1:14555/callback";
        let mut auth_url = Url::parse(AUTHORIZE).map_err(|_| "Invalid authorization URL")?;
        auth_url
            .query_pairs_mut()
            .append_pair("client_id", client_id)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("scope", SCOPE)
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("state", &state)
            .append_pair("nonce", &nonce);

        if open::that(auth_url.as_str()).is_err() {
            return Err("Could not open system browser for ChatGPT sign-in".into());
        }

        let callback_future = async {
            let (mut socket, _) = listener
                .accept()
                .await
                .map_err(|_| "Authentication callback failed")?;
            let mut buf = [0u8; 4096];
            let n = socket
                .read(&mut buf)
                .await
                .map_err(|_| "Could not read callback")?;
            let request = String::from_utf8_lossy(&buf[..n]);
            let first_line = request.lines().next().unwrap_or("");
            let query = first_line.split_whitespace().nth(1).unwrap_or("");
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<!DOCTYPE html><html><body style='font-family:sans-serif;text-align:center;padding:50px;'><h2>AntiRL Sign-in Complete</h2><p>You can close this window and return to AntiRL.</p></body></html>";
            let _ = socket.write_all(response.as_bytes()).await;

            let url = Url::parse(&format!("http://localhost{query}"))
                .map_err(|_| "Invalid callback URL")?;
            let pairs: BTreeMap<_, _> = url.query_pairs().into_owned().collect();
            if pairs.get("state").map(String::as_str) != Some(&state) {
                return Err("Security verification failed: state mismatch".into());
            }
            if let Some(err) = pairs.get("error") {
                return Err(format!("Sign in cancelled: {err}"));
            }
            let code = pairs.get("code").ok_or("No authorization code received")?;
            Ok::<String, String>(code.clone())
        };

        let code = match timeout(Duration::from_secs(180), callback_future).await {
            Ok(res) => res?,
            Err(_) => return Err("Sign in timed out. Try again in Settings.".into()),
        };

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| "Network client failed")?;
        let res = client
            .post(TOKEN)
            .form(&[
                ("grant_type", "authorization_code"),
                ("client_id", client_id),
                ("code", &code),
                ("redirect_uri", redirect_uri),
                ("code_verifier", &verifier),
            ])
            .send()
            .await
            .map_err(|_| "Could not complete token exchange with OpenAI")?;

        if !res.status().is_success() {
            return Err("Token exchange rejected by OpenAI auth server".into());
        }

        let body: Value = res.json().await.map_err(|_| "Invalid token response")?;
        let tokens = token_record(&body, None)?;
        save_tokens(client_id, &tokens)?;

        let mut acc = self.accounts();
        acc.active = Some(client_id.into());
        acc.accounts.retain(|a| a.client_id != client_id);
        acc.accounts.push(Account {
            client_id: client_id.into(),
            subject: "chatgpt-user".into(),
            email: None,
        });
        self.save_accounts(&acc)?;

        Ok(json!({
            "status": "connected",
            "scope": tokens.scope,
            "expires_at": tokens.expires_at
        }))
    }

    pub async fn chatgpt_models(&self) -> ServiceResult<Value> {
        let acc = self.accounts();
        let client_id = acc.active.as_deref().ok_or("Not signed in to ChatGPT")?;
        let tokens = load_tokens(client_id)?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| "Network client failed")?;
        let res = client
            .get(format!("{RESOURCE}/models"))
            .bearer_auth(&tokens.access_token)
            .send()
            .await
            .map_err(|_| "Could not load ChatGPT models catalog")?;
        if !res.status().is_success() {
            return Err("ChatGPT models catalog unavailable".into());
        }
        let body: Value = res
            .json()
            .await
            .map_err(|_| "Invalid models JSON from ChatGPT")?;
        let data = body["data"].as_array().ok_or("Invalid models data")?;
        let models: Vec<Value> = data
            .iter()
            .filter_map(|m| {
                let id = m["id"].as_str()?;
                Some(json!({
                    "id": id,
                    "name": id,
                    "description": "ChatGPT plan model"
                }))
            })
            .collect();
        Ok(json!({
            "provider": "chatgpt",
            "models": models
        }))
    }
}

fn rand_byte() -> u8 {
    let now = Utc::now().timestamp_nanos_opt().unwrap_or(0);
    (now & 0xFF) as u8
}
