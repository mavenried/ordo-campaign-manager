use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::pin::Pin;

use crate::state::AiClient;

const MODEL: &str = "mistral-small-latest";
const MISTRAL_URL: &str = "https://api.mistral.ai/v1/chat/completions";

#[derive(Serialize, Deserialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}


fn build_messages(system: &str, messages: &[Message]) -> Vec<Value> {
    let mut out = vec![json!({"role": "system", "content": system})];
    for m in messages {
        out.push(json!({"role": m.role, "content": m.content}));
    }
    out
}

pub async fn stream_chat(
    ai: &AiClient,
    system: &str,
    messages: &[Message],
) -> anyhow::Result<Pin<Box<dyn futures::Stream<Item = String> + Send>>> {
    let body = json!({
        "model": MODEL,
        "messages": build_messages(system, messages),
        "max_tokens": 1024,
        "stream": true,
    });

    let response = ai
        .client
        .post(MISTRAL_URL)
        .header("Authorization", format!("Bearer {}", ai.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!("Mistral API error: {text}"));
    }

    let byte_stream = response.bytes_stream();
    let text_stream = byte_stream.filter_map(|chunk| async move {
        let bytes = chunk.ok()?;
        let text = std::str::from_utf8(&bytes).ok()?.to_string();
        let mut result = String::new();
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data.trim() == "[DONE]" {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<Value>(data) {
                    if let Some(t) = val["choices"][0]["delta"]["content"].as_str() {
                        result.push_str(t);
                    }
                }
            }
        }
        if result.is_empty() { None } else { Some(result) }
    });

    Ok(Box::pin(text_stream))
}

pub async fn complete(
    ai: &AiClient,
    system: &str,
    messages: &[Message],
) -> anyhow::Result<String> {
    let body = json!({
        "model": MODEL,
        "messages": build_messages(system, messages),
        "max_tokens": 2048,
    });

    let response = ai
        .client
        .post(MISTRAL_URL)
        .header("Authorization", format!("Bearer {}", ai.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!("Mistral API error: {text}"));
    }

    let val: Value = response.json().await?;
    Ok(val["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string())
}
