use super::*;
/// Explicit compatibility adapter. Never re-label duration as uptime or waste.
pub(crate) fn normalize_analysis(mut a: Value) -> Value {
    if let Some(ms) = a["metrics"].as_array_mut() {
        for m in ms {
            if m["key"] == "supersonic_boost_seconds" {
                m["legacy_key"] = json!("supersonic_boost_seconds");
                m["key"] = json!("boost_active_at_supersonic_speed_s");
                m["label"] = json!("Boost active at supersonic speed");
                m["description"]=json!("Observed boost active at >=2200 uu/s; not threshold uptime or proven waste. Legacy observation retained.");
            }
        }
    }
    if let Some(events) = a["events"].as_array_mut() {
        for e in events {
            if let Some(keys) = e["metric_keys"].as_array_mut() {
                for key in keys {
                    if *key == "supersonic_boost_seconds" {
                        *key = json!("boost_active_at_supersonic_speed_s");
                    }
                }
            }
        }
    }
    a
}
