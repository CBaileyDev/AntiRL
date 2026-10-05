use super::*;
pub(crate) fn reviewed_cards(question:&str,mode:&str)->Value {
 let cards:Vec<Value>=serde_json::from_str(include_str!("../../../app/src/data/research-cards.json")).unwrap_or_default();
 let lower=question.to_ascii_lowercase();
 json!(cards.into_iter().filter(|c|c["modes"].as_array().is_some_and(|ms|ms.iter().any(|m|m==mode))).filter(|c|c["tags"].as_array().is_some_and(|tags|tags.iter().any(|t|lower.contains(t.as_str().unwrap_or("!"))))).take(3).collect::<Vec<_>>())
}
