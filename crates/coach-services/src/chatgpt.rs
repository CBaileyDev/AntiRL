//! Official SIWC integration is opt-in at build time until live verification.
//! Reference: https://developers.openai.com/siwc/token-sharing-open-source/sign-in
use crate::{CoachService, ServiceResult};
use serde_json::{json, Value};
#[cfg(not(feature = "chatgpt-siwc"))]
const UNAVAILABLE: &str = "ChatGPT plan sign-in is disabled in this build pending live verification of the official SIWC integration. Use an explicit API provider or offline coaching.";

#[cfg(feature = "chatgpt-siwc")]
mod integration {
    use super::*;
    use crate::ident;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use chrono::Utc;
    use fs2::FileExt;
    use jsonwebtoken::{jwk::JwkSet, Algorithm, DecodingKey, Validation};
    use serde::{Deserialize, Serialize};
    use sha2::{Digest, Sha256};
    use std::{collections::BTreeMap, fs, path::Path, time::Duration};
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        time::timeout,
    };
    use url::Url;
    const AUTHORIZE: &str = "https://auth.openai.com/api/accounts/authorize";
    const TOKEN: &str = "https://auth.openai.com/api/accounts/oauth/token";
    const RESOURCE: &str = "https://api.openai.com/v1";
    const JWKS: &str = "https://auth.openai.com/.well-known/jwks.json";
    const SCOPE: &str =
        "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
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
        #[serde(default)]
        validated_subject: String,
    }
    #[derive(Serialize, Deserialize)]
    struct Claims {
        sub: String,
        iss: String,
        aud: Value,
        exp: u64,
        iat: u64,
        nonce: Option<String>,
        email: Option<String>,
    }
    fn atomic(path: &Path, bytes: &[u8]) -> ServiceResult<()> {
        let temp = path.with_extension(format!("{}.tmp", ident()));
        fs::write(&temp, bytes).map_err(|_| "Could not save ChatGPT profile")?;
        fs::rename(temp, path).map_err(|_| "Could not update ChatGPT profile".into())
    }

    fn vault(name: &str) -> ServiceResult<keyring::Entry> {
        keyring::Entry::new("AntiRL", name)
            .map_err(|_| "Windows credential vault unavailable".into())
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
        if encoded.len() > 80_000 {
            return Err("Credential record too large".into());
        }
        let generation = ident();
        let chunks: Vec<&[u8]> = encoded.as_bytes().chunks(800).collect();
        let pointer = vault(&format!("chatgpt-{client}"))?;
        let old = pointer.get_password().ok();
        for (i, c) in chunks.iter().enumerate() {
            if let Ok(chunk_str) = std::str::from_utf8(c) {
                if vault(&chunk_name(client, &generation, i))?
                    .set_password(chunk_str)
                    .is_err()
                {
                    for j in 0..=i {
                        let _ = vault(&chunk_name(client, &generation, j)).map(|v| {
                            let _ = v.delete_credential();
                        });
                    }
                    return Err("Could not protect ChatGPT tokens in Windows vault".into());
                }
            } else {
                for j in 0..i {
                    let _ = vault(&chunk_name(client, &generation, j)).map(|v| {
                        let _ = v.delete_credential();
                    });
                }
                return Err("Invalid UTF-8 in vault chunk".into());
            }
        }
        if pointer
            .set_password(&json!({"generation": generation, "parts": chunks.len()}).to_string())
            .is_err()
        {
            for index in 0..chunks.len() {
                if let Ok(entry) = vault(&chunk_name(client, &generation, index)) {
                    let _ = entry.delete_credential();
                }
            }
            return Err("Could not protect ChatGPT token manifest".into());
        }
        if let Some(old) = old.and_then(|s| serde_json::from_str::<Value>(&s).ok()) {
            if let (Some(g), Some(n)) = (old["generation"].as_str(), old["parts"].as_u64()) {
                for i in 0..n.min(100) {
                    let _ = vault(&chunk_name(client, g, i as usize)).map(|v| {
                        let _ = v.delete_credential();
                    });
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

    fn random_value(bytes: usize) -> ServiceResult<String> {
        let mut value = vec![0u8; bytes];
        getrandom::fill(&mut value).map_err(|_| "Secure random source unavailable")?;
        Ok(URL_SAFE_NO_PAD.encode(value))
    }
    fn granted(scope: &str) -> bool {
        let scopes: Vec<_> = scope.split_whitespace().collect();
        scopes.contains(&"resource.invoke") && scopes.contains(&"chatgpt.tokens.use.direct")
    }
    fn token_record(value: &Value, old: Option<&Tokens>) -> ServiceResult<Tokens> {
        if value["token_type"]
            .as_str()
            .is_none_or(|s| !s.eq_ignore_ascii_case("bearer"))
        {
            return Err("Unexpected OAuth token type".into());
        }
        let required = |key: &str| -> ServiceResult<String> {
            value[key]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .ok_or_else(|| format!("Missing {key} in OAuth response"))
        };
        let expires = value["expires_in"]
            .as_i64()
            .filter(|v| *v > 0 && *v <= 86400)
            .ok_or("Invalid OAuth expiry")?;
        Ok(Tokens {
            access_token: required("access_token")?,
            refresh_token: value["refresh_token"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .or_else(|| old.map(|t| t.refresh_token.clone()))
                .ok_or("Missing refresh token")?,
            id_token: value["id_token"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .or_else(|| old.map(|t| t.id_token.clone()))
                .ok_or("Missing ID token")?,
            scope: value["scope"]
                .as_str()
                .map(str::to_string)
                .or_else(|| old.map(|t| t.scope.clone()))
                .unwrap_or_default(),
            expires_at: Utc::now().timestamp() + expires,
            validated_subject: old.map(|t| t.validated_subject.clone()).unwrap_or_default(),
        })
    }
    fn verify_identity(
        token: &str,
        client: &str,
        nonce: Option<&str>,
        expected_subject: Option<&str>,
        jwks: &JwkSet,
    ) -> ServiceResult<Claims> {
        let header = jsonwebtoken::decode_header(token).map_err(|_| "Invalid ID-token header")?;
        if header.alg != Algorithm::RS256 {
            return Err("Unsupported ID-token signature algorithm".into());
        }
        let kid = header.kid.ok_or("Missing ID-token signing key")?;
        let jwk = jwks.find(&kid).ok_or("Unknown ID-token signing key")?;
        let key = DecodingKey::from_jwk(jwk).map_err(|_| "Invalid OpenAI signing key")?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&["https://auth.openai.com"]);
        validation.set_audience(&[client]);
        validation.set_required_spec_claims(&["sub", "exp", "iat", "iss", "aud"]);
        validation.leeway = 5;
        let claims = jsonwebtoken::decode::<Claims>(token, &key, &validation)
            .map_err(|_| "ID-token signature or identity claims rejected")?
            .claims;
        if claims.sub.is_empty() || claims.iat > (Utc::now().timestamp() + 5) as u64 {
            return Err("Invalid ID-token identity or issue time".into());
        }
        if nonce.is_some_and(|n| claims.nonce.as_deref() != Some(n)) {
            return Err("ID-token nonce mismatch".into());
        }
        if expected_subject.is_some_and(|s| s != claims.sub) {
            return Err("ChatGPT account identity changed; sign in again".into());
        }
        Ok(claims)
    }
    fn callback(
        target: &str,
        state: &str,
        returning: Option<&str>,
    ) -> ServiceResult<(String, String)> {
        let url = Url::parse(&format!("http://127.0.0.1{target}"))
            .map_err(|_| "Invalid OAuth callback")?;
        if url.path() != "/auth/callback" {
            return Err("Unexpected OAuth callback path".into());
        }
        let mut pairs = BTreeMap::new();
        for (key, value) in url.query_pairs() {
            if pairs.insert(key.to_string(), value.to_string()).is_some() {
                return Err("Duplicate OAuth callback parameter".into());
            }
        }
        if pairs.get("state").map(String::as_str) != Some(state) {
            return Err("OAuth state mismatch".into());
        }
        if pairs.contains_key("error") {
            return Err("ChatGPT authorization declined".into());
        }
        let issued = pairs
            .get("client_id")
            .map(String::as_str)
            .or(returning)
            .filter(|id| id.starts_with("oaiapp_"))
            .ok_or("Registration did not issue a client ID")?;
        if returning.is_some_and(|id| id != issued) {
            return Err("OAuth registration changed unexpectedly".into());
        }
        let code = pairs
            .get("code")
            .filter(|s| !s.is_empty())
            .ok_or("Missing OAuth code")?;
        Ok((code.clone(), issued.to_string()))
    }

    async fn receive_callback(
        listener: TcpListener,
        state: &str,
        returning: Option<&str>,
    ) -> ServiceResult<(String, String)> {
        loop {
            let (mut socket, _) = listener
                .accept()
                .await
                .map_err(|_| "Authentication callback failed")?;
            let request = timeout(Duration::from_secs(5), async {
                let mut request = Vec::new();
                let mut chunk = [0u8; 1024];
                loop {
                    let count = socket
                        .read(&mut chunk)
                        .await
                        .map_err(|_| "Callback read failed")?;
                    if count == 0 {
                        return Err("Incomplete authentication callback".to_string());
                    }
                    request.extend_from_slice(&chunk[..count]);
                    if request.len() > 8192 {
                        return Err("Authentication callback exceeded size limit".into());
                    }
                    if request.windows(4).any(|window| window == b"\r\n\r\n") {
                        break;
                    }
                }
                String::from_utf8(request).map_err(|_| "Invalid callback encoding".to_string())
            })
            .await
            .map_err(|_| "Callback read timed out")??;
            let mut parts = request.lines().next().unwrap_or("").split_whitespace();
            let method = parts.next();
            let target = parts.next().unwrap_or("");
            if method != Some("GET") || !target.starts_with("/auth/callback?") {
                let _ = socket
                    .write_all(
                        b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    )
                    .await;
                continue;
            }
            let result = callback(target, state, returning);
            let body = if result.is_ok() {
                "Authorization received. Return to AntiRL for identity verification."
            } else {
                "Authorization rejected. Return to AntiRL."
            };
            let reply=format!("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
            let _ = socket.write_all(reply.as_bytes()).await;
            return result;
        }
    }
    fn client() -> ServiceResult<reqwest::Client> {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "OAuth network client unavailable".into())
    }
    async fn signing_keys(token: &str) -> ServiceResult<JwkSet> {
        static CACHE: std::sync::OnceLock<
            tokio::sync::Mutex<Option<(std::time::Instant, JwkSet)>>,
        > = std::sync::OnceLock::new();
        let header = jsonwebtoken::decode_header(token).map_err(|_| "Invalid ID-token header")?;
        let kid = header.kid.ok_or("Missing ID-token signing key")?;
        let mut cache = CACHE
            .get_or_init(|| tokio::sync::Mutex::new(None))
            .lock()
            .await;
        if let Some((saved, keys)) = cache.as_ref() {
            if saved.elapsed() < Duration::from_secs(300) && keys.find(&kid).is_some() {
                return Ok(keys.clone());
            }
        }
        let response = client()?
            .get(JWKS)
            .send()
            .await
            .map_err(|_| "Could not obtain OpenAI signing keys")?;
        if !response.status().is_success() {
            return Err("OpenAI signing keys unavailable".into());
        }
        let keys: JwkSet = response
            .json()
            .await
            .map_err(|_| "Invalid OpenAI signing keys")?;
        *cache = Some((std::time::Instant::now(), keys.clone()));
        Ok(keys)
    }
    async fn refresh_exchange(
        http: &reqwest::Client,
        endpoint: &str,
        active: &str,
        old: &Tokens,
    ) -> ServiceResult<Value> {
        let response = http
            .post(endpoint)
            .form(&[
                ("grant_type", "refresh_token"),
                ("client_id", active),
                ("refresh_token", old.refresh_token.as_str()),
                ("resource", RESOURCE),
            ])
            .send()
            .await
            .map_err(|_| "ChatGPT session refresh failed; retry or sign in again")?;
        if !response.status().is_success() {
            return Err("ChatGPT session expired; sign in again".into());
        }
        response
            .json()
            .await
            .map_err(|_| "Invalid ChatGPT refresh response".into())
    }
    impl CoachService {
        fn oauth_process_lock(&self) -> ServiceResult<std::fs::File> {
            let file = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .open(self.dir.join("chatgpt-session.lock"))
                .map_err(|_| "Could not protect ChatGPT session rotation")?;
            file.try_lock_exclusive()
                .map_err(|_| "ChatGPT session is being updated by another AntiRL process")?;
            Ok(file)
        }
        fn accounts(&self) -> Accounts {
            fs::read(self.dir.join("chatgpt-accounts.json"))
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
                .unwrap_or_default()
        }
        fn save_accounts(&self, accounts: &Accounts) -> ServiceResult<()> {
            atomic(
                &self.dir.join("chatgpt-accounts.json"),
                &serde_json::to_vec_pretty(accounts)
                    .map_err(|_| "Could not encode ChatGPT accounts")?,
            )
        }
        fn host_id(&self) -> ServiceResult<String> {
            let path = self.dir.join("chatgpt-host-id.txt");
            if let Ok(id) = fs::read_to_string(&path) {
                if uuid::Uuid::parse_str(id.trim().trim_start_matches("urn:uuid:")).is_ok() {
                    return Ok(id.trim().to_string());
                }
            }
            let id = format!("urn:uuid:{}", ident());
            atomic(&path, id.as_bytes())?;
            Ok(id)
        }
        pub(super) fn enabled_status(&self) -> Value {
            let accounts = self.accounts();
            let Some(active) = accounts.active else {
                return json!({"provider":"chatgpt","status":"signed_out","experimental":true});
            };
            let email = accounts
                .accounts
                .iter()
                .find(|a| a.client_id == active)
                .and_then(|a| a.email.clone());
            match load_tokens(&active) {
                Ok(t) if !t.validated_subject.is_empty() => {
                    json!({"provider":"chatgpt","status":if !granted(&t.scope){"insufficient_scope"}else if t.expires_at<=Utc::now().timestamp()+30{"expired"}else{"connected"},"email":email,"expires_at":t.expires_at,"experimental":true})
                }
                _ => json!({"provider":"chatgpt","status":"signed_out","experimental":true}),
            }
        }
        pub(super) async fn enabled_sign_in(&self) -> ServiceResult<Value> {
            let _gate = self
                .oauth_gate
                .try_lock()
                .map_err(|_| "ChatGPT sign-in already in progress")?;
            let _process_lock = self.oauth_process_lock()?;
            let accounts = self.accounts();
            let returning = accounts
                .active
                .as_deref()
                .and_then(|id| {
                    accounts
                        .accounts
                        .iter()
                        .find(|a| a.client_id == id && id.starts_with("oaiapp_"))
                })
                .cloned();
            let old_tokens = returning
                .as_ref()
                .and_then(|a| load_tokens(&a.client_id).ok())
                .filter(|t| !t.validated_subject.is_empty());
            let state = random_value(32)?;
            let nonce = random_value(32)?;
            let verifier = random_value(48)?;
            let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
            let listener = TcpListener::bind("127.0.0.1:0")
                .await
                .map_err(|_| "Could not bind authentication callback")?;
            let redirect = format!(
                "http://127.0.0.1:{}/auth/callback",
                listener
                    .local_addr()
                    .map_err(|_| "Callback address unavailable")?
                    .port()
            );
            let mut authorize = Url::parse(AUTHORIZE).map_err(|_| "Invalid authorization URL")?;
            authorize
                .query_pairs_mut()
                .append_pair(
                    "client_id",
                    returning
                        .as_ref()
                        .map(|a| a.client_id.as_str())
                        .unwrap_or("dynamic_agent_client"),
                )
                .append_pair("ext_agent_host_id", &self.host_id()?)
                .append_pair("response_type", "code")
                .append_pair("redirect_uri", &redirect)
                .append_pair("scope", SCOPE)
                .append_pair("resource", RESOURCE)
                .append_pair("state", &state)
                .append_pair("nonce", &nonce)
                .append_pair("code_challenge_method", "S256")
                .append_pair("code_challenge", &challenge);
            if returning.is_none() {
                authorize
                    .query_pairs_mut()
                    .append_pair("agent_name_hint", "AntiRL");
            }
            if let Some(t) = &old_tokens {
                authorize
                    .query_pairs_mut()
                    .append_pair("id_token_hint", &t.id_token);
            }
            open::that(authorize.as_str()).map_err(|_| "Could not open sign-in browser")?;
            let (code, issued) = timeout(
                Duration::from_secs(180),
                receive_callback(
                    listener,
                    &state,
                    returning.as_ref().map(|account| account.client_id.as_str()),
                ),
            )
            .await
            .map_err(|_| "ChatGPT sign-in timed out")??;
            let response = client()?
                .post(TOKEN)
                .form(&[
                    ("grant_type", "authorization_code"),
                    ("client_id", issued.as_str()),
                    ("code", code.as_str()),
                    ("redirect_uri", redirect.as_str()),
                    ("code_verifier", verifier.as_str()),
                    ("resource", RESOURCE),
                ])
                .send()
                .await
                .map_err(|_| "Could not exchange ChatGPT authorization")?;
            if !response.status().is_success() {
                return Err("ChatGPT authorization exchange rejected".into());
            }
            let value: Value = response
                .json()
                .await
                .map_err(|_| "Invalid OAuth response")?;
            let mut tokens = token_record(&value, None)?;
            let claims = verify_identity(
                &tokens.id_token,
                &issued,
                Some(&nonce),
                returning.as_ref().map(|a| a.subject.as_str()),
                &signing_keys(&tokens.id_token).await?,
            )?;
            tokens.validated_subject = claims.sub.clone();
            save_tokens(&issued, &tokens)?;
            let mut updated = accounts;
            updated.active = Some(issued.clone());
            updated.accounts.retain(|a| a.client_id != issued);
            updated.accounts.push(Account {
                client_id: issued,
                subject: claims.sub,
                email: claims.email,
            });
            self.save_accounts(&updated)?;
            Ok(self.enabled_status())
        }
        pub(super) async fn enabled_access_token(&self) -> ServiceResult<String> {
            let _gate = self.oauth_gate.lock().await;
            let _process_lock = self.oauth_process_lock()?;
            let accounts = self.accounts();
            let active = accounts
                .active
                .as_deref()
                .filter(|id| id.starts_with("oaiapp_"))
                .ok_or("Sign in to ChatGPT first")?;
            let account = accounts
                .accounts
                .iter()
                .find(|a| a.client_id == active)
                .ok_or("Missing ChatGPT account")?;
            let old = load_tokens(active)?;
            if old.validated_subject != account.subject || old.validated_subject.is_empty() {
                return Err("Legacy or unverified ChatGPT credentials rejected".into());
            }
            if !granted(&old.scope) {
                return Err("ChatGPT plan permission not granted".into());
            }
            if old.expires_at > Utc::now().timestamp() + 60 {
                return Ok(old.access_token);
            }
            let value = refresh_exchange(&client()?, TOKEN, active, &old).await?;
            let tokens = token_record(&value, Some(&old))?;
            if value["id_token"].as_str().is_some() {
                verify_identity(
                    &tokens.id_token,
                    active,
                    None,
                    Some(&account.subject),
                    &signing_keys(&tokens.id_token).await?,
                )?;
            }
            if !granted(&tokens.scope) {
                return Err("ChatGPT plan permission no longer granted".into());
            }
            save_tokens(active, &tokens)?;
            Ok(tokens.access_token)
        }
        pub(super) async fn enabled_models(&self) -> ServiceResult<Value> {
            let token = self.enabled_access_token().await?;
            let response = client()?
                .get(format!("{RESOURCE}/models"))
                .bearer_auth(token)
                .send()
                .await
                .map_err(|_| "ChatGPT catalog request failed")?;
            if !response.status().is_success() {
                return Err("ChatGPT catalog unavailable".into());
            }
            let body: Value = response
                .json()
                .await
                .map_err(|_| "Invalid ChatGPT catalog")?;
            let models: Vec<Value> = body["models"]
                .as_array()
                .ok_or("Invalid ChatGPT models catalog")?
                .iter()
                .filter(|m| m["visibility"] == "list")
                .filter_map(|m| {
                    Some(json!({"id":m["slug"].as_str()?,"name":m["display_name"].as_str()?}))
                })
                .collect();
            Ok(json!({"provider":"chatgpt","models":models}))
        }
    }

    pub(super) async fn sign_out(service: &CoachService) -> ServiceResult<()> {
        let _gate = service.oauth_gate.lock().await;
        let _process_lock = service.oauth_process_lock()?;
        let mut accounts = service.accounts();
        let Some(active) = accounts.active.take() else {
            return Ok(());
        };
        let mut revoked = false;
        if let Ok(tokens) = load_tokens(&active) {
            // Discovery supplies revocation location; only the pinned issuer's
            // HTTPS origin is allowed to receive the protected refresh token.
            if let Ok(http) = client() {
                if let Ok(discovery) = http
                    .get("https://auth.openai.com/.well-known/openid-configuration")
                    .send()
                    .await
                {
                    if discovery.status().is_success() {
                        if let Ok(body) = discovery.json::<Value>().await {
                            if body["issuer"] == "https://auth.openai.com" {
                                if let Some(url) = body["revocation_endpoint"]
                                    .as_str()
                                    .and_then(|s| Url::parse(s).ok())
                                    .filter(|u| {
                                        u.scheme() == "https"
                                            && u.host_str() == Some("auth.openai.com")
                                            && u.port_or_known_default() == Some(443)
                                            && u.username().is_empty()
                                            && u.password().is_none()
                                    })
                                {
                                    for attempt in 0..3 {
                                        match http
                                            .post(url.clone())
                                            .form(&[
                                                ("token", tokens.refresh_token.as_str()),
                                                ("token_type_hint", "refresh_token"),
                                                ("client_id", active.as_str()),
                                            ])
                                            .send()
                                            .await
                                        {
                                            Ok(response) if response.status().is_success() => {
                                                revoked = true;
                                                break;
                                            }
                                            Ok(response)
                                                if !response.status().is_server_error() =>
                                            {
                                                break
                                            }
                                            _ => {
                                                if attempt < 2 {
                                                    tokio::time::sleep(Duration::from_millis(
                                                        200 * (1 << attempt),
                                                    ))
                                                    .await;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        delete_record(&active)?;
        service.save_accounts(&accounts)?;
        if !revoked {
            return Err("Signed out locally. Remote session revocation was not confirmed; disconnect AntiRL in ChatGPT Settings.".into());
        }
        Ok(())
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        fn signed(claims: &Value) -> String {
            let mut header = jsonwebtoken::Header::new(Algorithm::RS256);
            header.kid = Some("synthetic-test-key".into());
            let key = jsonwebtoken::EncodingKey::from_rsa_pem(include_bytes!(
                "../tests/fixtures/synthetic-oidc-test-key.pem"
            ))
            .unwrap();
            jsonwebtoken::encode(&header, claims, &key).unwrap()
        }
        #[test]
        fn signed_identity_rejects_wrong_issuer_audience_nonce_expiry_and_tampering() {
            let keys: JwkSet =
                serde_json::from_str(include_str!("../tests/fixtures/synthetic-oidc-jwks.json"))
                    .unwrap();
            let now = Utc::now().timestamp();
            let claims = json!({"sub":"synthetic-user","iss":"https://auth.openai.com","aud":"oaiapp_test","exp":now+60,"iat":now,"nonce":"expected","email":"test@example.invalid"});
            assert_eq!(
                verify_identity(
                    &signed(&claims),
                    "oaiapp_test",
                    Some("expected"),
                    None,
                    &keys
                )
                .unwrap()
                .sub,
                "synthetic-user"
            );
            for (key, value) in [
                ("iss", json!("https://attacker.invalid")),
                ("aud", json!("oaiapp_other")),
                ("exp", json!(now - 60)),
                ("nonce", json!("wrong")),
                ("sub", json!("")),
                ("iat", json!(now + 60)),
            ] {
                let mut changed = claims.clone();
                changed[key] = value;
                assert!(
                    verify_identity(
                        &signed(&changed),
                        "oaiapp_test",
                        Some("expected"),
                        None,
                        &keys
                    )
                    .is_err(),
                    "claim {key}"
                );
            }
            assert!(verify_identity(
                &signed(&claims),
                "oaiapp_test",
                Some("expected"),
                Some("another-user"),
                &keys
            )
            .is_err());
            let token = signed(&claims);
            let mut parts: Vec<_> = token.split('.').map(str::to_string).collect();
            parts[1] = URL_SAFE_NO_PAD.encode(br#"{"sub":"attacker"}"#);
            assert!(verify_identity(
                &parts.join("."),
                "oaiapp_test",
                Some("expected"),
                None,
                &keys
            )
            .is_err());
        }
        #[test]
        fn callback_binds_state_path_and_issued_registration() {
            assert_eq!(
                callback(
                    "/auth/callback?state=s&code=c&client_id=oaiapp_new",
                    "s",
                    None
                )
                .unwrap(),
                ("c".into(), "oaiapp_new".into())
            );
            for target in [
                "/auth/callback?state=bad&code=c&client_id=oaiapp_new",
                "/callback?state=s&code=c&client_id=oaiapp_new",
                "/auth/callback?state=s&code=c&client_id=dynamic_agent_client",
                "/auth/callback?state=s&code=c",
                "/auth/callback?state=s&state=s&code=c&client_id=oaiapp_new",
                "/auth/callback?state=s&error=access_denied",
            ] {
                assert!(callback(target, "s", None).is_err());
            }
            assert!(callback(
                "/auth/callback?state=s&code=c&client_id=oaiapp_changed",
                "s",
                Some("oaiapp_saved")
            )
            .is_err());
            assert_eq!(
                callback("/auth/callback?state=s&code=c", "s", Some("oaiapp_saved"))
                    .unwrap()
                    .1,
                "oaiapp_saved"
            );
        }
        #[tokio::test]
        async fn refresh_fixture_preserves_registration_resource_and_rotates_tokens() {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let endpoint = format!("http://{address}/token");
            let server = async {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut request = vec![];
                let mut bytes = [0u8; 4096];
                loop {
                    let n = stream.read(&mut bytes).await.unwrap();
                    request.extend_from_slice(&bytes[..n]);
                    let Some(end) = request.windows(4).position(|w| w == b"\r\n\r\n") else {
                        continue;
                    };
                    let headers = String::from_utf8_lossy(&request[..end]).to_ascii_lowercase();
                    let length: usize = headers
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("content-length:")
                                .map(|n| n.trim().parse().unwrap())
                        })
                        .unwrap();
                    if request.len() >= end + 4 + length {
                        break;
                    }
                }
                let text = String::from_utf8(request).unwrap();
                assert!(
                    text.contains("client_id=oaiapp_test")
                        && text.contains("grant_type=refresh_token")
                        && text.contains("resource=https%3A%2F%2Fapi.openai.com%2Fv1")
                        && !text.contains("scope=")
                );
                let body=json!({"token_type":"Bearer","access_token":"new-access-synthetic","refresh_token":"rotated-refresh-synthetic","expires_in":3600}).to_string();
                stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            };
            let old = Tokens {
                access_token: "expired-synthetic".into(),
                refresh_token: "old-refresh-synthetic".into(),
                id_token: "retained-synthetic".into(),
                scope: SCOPE.into(),
                expires_at: 0,
                validated_subject: "synthetic-user".into(),
            };
            let http = client().unwrap();
            let exchange = refresh_exchange(&http, &endpoint, "oaiapp_test", &old);
            let (response, ()) = tokio::join!(exchange, server);
            let tokens = token_record(&response.unwrap(), Some(&old)).unwrap();
            assert_eq!(tokens.refresh_token, "rotated-refresh-synthetic");
            assert_eq!(tokens.id_token, old.id_token);
            assert_eq!(tokens.validated_subject, old.validated_subject);
            assert!(tokens.expires_at > Utc::now().timestamp());
            assert!(granted(&tokens.scope));
        }

        #[tokio::test]
        async fn dynamic_loopback_receives_fragmented_callback_and_ignores_favicon() {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let another = TcpListener::bind("127.0.0.1:0").await.unwrap();
            assert_ne!(address.port(), another.local_addr().unwrap().port());
            let browser = async {
                let mut favicon = tokio::net::TcpStream::connect(address).await.unwrap();
                favicon
                    .write_all(b"GET /favicon.ico HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
                    .await
                    .unwrap();
                let mut reply = vec![];
                favicon.read_to_end(&mut reply).await.unwrap();
                assert!(String::from_utf8(reply).unwrap().contains("404"));
                let mut browser = tokio::net::TcpStream::connect(address).await.unwrap();
                for chunk in [
                    b"GET /auth/call".as_slice(),
                    b"back?state=synthetic&code=test&client_id=oaiapp_test HTTP/1.1\r\n".as_slice(),
                    b"Host: 127.0.0.1\r\n\r\n".as_slice(),
                ] {
                    browser.write_all(chunk).await.unwrap();
                    tokio::task::yield_now().await;
                }
                let mut reply = vec![];
                browser.read_to_end(&mut reply).await.unwrap();
                assert!(String::from_utf8(reply)
                    .unwrap()
                    .contains("identity verification"));
            };
            let (callback, ()) =
                tokio::join!(receive_callback(listener, "synthetic", None), browser);
            assert_eq!(callback.unwrap(), ("test".into(), "oaiapp_test".into()));
        }
        #[test]
        fn secure_values_have_pkce_entropy_and_distinct_states() {
            let state = random_value(32).unwrap();
            assert_eq!(URL_SAFE_NO_PAD.decode(&state).unwrap().len(), 32);
            assert_ne!(state, random_value(32).unwrap());
            let verifier = random_value(48).unwrap();
            assert!((43..=128).contains(&verifier.len()));
            assert!(verifier
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'));
        }
    }
}
impl CoachService {
    pub fn chatgpt_status(&self) -> Value {
        #[cfg(feature = "chatgpt-siwc")]
        {
            self.enabled_status()
        }
        #[cfg(not(feature = "chatgpt-siwc"))]
        {
            json!({"status":"unavailable","provider":"chatgpt","reason":UNAVAILABLE,"documentation":"https://developers.openai.com/siwc/token-sharing-open-source/sign-in"})
        }
    }
    pub async fn start_chatgpt_sign_in(&self) -> ServiceResult<Value> {
        #[cfg(feature = "chatgpt-siwc")]
        {
            self.enabled_sign_in().await
        }
        #[cfg(not(feature = "chatgpt-siwc"))]
        {
            Err(UNAVAILABLE.into())
        }
    }
    pub async fn chatgpt_access_token(&self) -> ServiceResult<String> {
        #[cfg(feature = "chatgpt-siwc")]
        {
            self.enabled_access_token().await
        }
        #[cfg(not(feature = "chatgpt-siwc"))]
        {
            Err(UNAVAILABLE.into())
        }
    }
    pub async fn chatgpt_models(&self) -> ServiceResult<Value> {
        #[cfg(feature = "chatgpt-siwc")]
        {
            self.enabled_models().await
        }
        #[cfg(not(feature = "chatgpt-siwc"))]
        {
            Err(UNAVAILABLE.into())
        }
    }
    pub async fn sign_out_chatgpt(&self) -> ServiceResult<()> {
        #[cfg(feature = "chatgpt-siwc")]
        {
            integration::sign_out(self).await
        }
        #[cfg(not(feature = "chatgpt-siwc"))]
        {
            let path = self.dir.join("chatgpt-accounts.json");
            let accounts: Value = std::fs::read(&path)
                .ok()
                .and_then(|bytes| serde_json::from_slice(&bytes).ok())
                .unwrap_or(Value::Null);
            for account in accounts["accounts"].as_array().into_iter().flatten() {
                let Some(client) = account["client_id"].as_str() else {
                    continue;
                };
                let entry = keyring::Entry::new("AntiRL", &format!("chatgpt-{client}"))
                    .map_err(|_| "Windows credential vault unavailable")?;
                if let Ok(raw) = entry.get_password() {
                    if let Ok(manifest) = serde_json::from_str::<Value>(&raw) {
                        if let (Some(g), Some(n)) =
                            (manifest["generation"].as_str(), manifest["parts"].as_u64())
                        {
                            for i in 0..n.min(100) {
                                let chunk = keyring::Entry::new(
                                    "AntiRL",
                                    &format!("chatgpt-{client}-{g}-{i}"),
                                )
                                .map_err(|_| "Windows credential vault unavailable")?;
                                match chunk.delete_credential() {
                                    Ok(()) | Err(keyring::Error::NoEntry) => {}
                                    Err(_) => {
                                        return Err(
                                            "Could not clear ChatGPT credential chunk".into()
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                match entry.delete_credential() {
                    Ok(()) | Err(keyring::Error::NoEntry) => {}
                    Err(_) => return Err("Could not clear ChatGPT credential".into()),
                }
            }
            match std::fs::remove_file(path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(_) => Err("Could not clear ChatGPT profile".into()),
            }
        }
    }
}
#[cfg(all(test, not(feature = "chatgpt-siwc")))]
mod disabled_tests {
    use super::*;
    #[tokio::test]
    async fn disabled_build_never_accepts_placeholder_tokens() {
        let dir = tempfile::tempdir().unwrap();
        let service = CoachService::open(dir.path()).unwrap();
        std::fs::write(
            dir.path().join("chatgpt-accounts.json"),
            r#"{"active":"antirl-desktop-client","accounts":[]}"#,
        )
        .unwrap();
        assert_eq!(service.chatgpt_status()["status"], "unavailable");
        assert!(service.chatgpt_access_token().await.is_err());
        assert!(service.start_chatgpt_sign_in().await.is_err());
        assert!(service.chatgpt_models().await.is_err());
        service.sign_out_chatgpt().await.unwrap();
        assert!(!dir.path().join("chatgpt-accounts.json").exists());
    }
}
