/// Ollama HTTP client for CrossForge AI agents.
///
/// Communicates with a local Ollama instance at localhost:11434.
/// All AI features degrade gracefully when Ollama is not available.

use serde::{Serialize, Deserialize};
use futures_util::StreamExt;

const DEFAULT_URL: &str = "http://localhost:11434";

#[derive(Debug, Clone)]
pub struct OllamaClient {
    base_url: String,
    client: reqwest::Client,
}

#[derive(Debug, Serialize)]
struct GenerateRequest {
    model: String,
    prompt: String,
    system: String,
    stream: bool,
    options: GenerateOptions,
}

#[derive(Debug, Serialize)]
struct GenerateOptions {
    temperature: f32,
    num_predict: u32,
}

#[derive(Debug, Deserialize)]
struct GenerateResponse {
    response: String,
    #[serde(default)]
    done: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct TagsResponse {
    models: Vec<OllamaModelInfo>,
}

#[derive(Debug, Deserialize)]
struct OllamaModelInfo {
    name: String,
    size: Option<u64>,
}

impl OllamaClient {
    pub fn new(base_url: Option<&str>) -> Self {
        Self {
            base_url: base_url.unwrap_or(DEFAULT_URL).to_string(),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .unwrap_or_default(),
        }
    }

    /// Check if Ollama is running and accessible.
    pub async fn is_available(&self) -> bool {
        self.client
            .get(format!("{}/api/tags", self.base_url))
            .timeout(std::time::Duration::from_secs(3))
            .send()
            .await
            .is_ok()
    }

    /// List available models.
    pub async fn list_models(&self) -> anyhow::Result<Vec<OllamaModel>> {
        let resp = self.client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await?;

        let tags: TagsResponse = resp.json().await?;
        Ok(tags.models.into_iter().map(|m| OllamaModel {
            name: m.name,
            size: m.size,
        }).collect())
    }

    /// Generate a completion with a system prompt.
    pub async fn generate(
        &self,
        model: &str,
        system: &str,
        prompt: &str,
        temperature: f32,
    ) -> anyhow::Result<String> {
        let req = GenerateRequest {
            model: model.to_string(),
            prompt: prompt.to_string(),
            system: system.to_string(),
            stream: false,
            options: GenerateOptions {
                temperature,
                num_predict: 2048,
            },
        };

        let resp = self.client
            .post(format!("{}/api/generate", self.base_url))
            .json(&req)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Ollama error ({}): {}", status, body);
        }

        let gen: GenerateResponse = resp.json().await?;
        Ok(gen.response)
    }

    /// Generate a completion with streaming token callbacks.
    /// `on_token` is called for each token chunk as it arrives.
    /// Returns the full accumulated response.
    pub async fn generate_streaming<F>(
        &self,
        model: &str,
        system: &str,
        prompt: &str,
        temperature: f32,
        mut on_token: F,
    ) -> anyhow::Result<String>
    where
        F: FnMut(String),
    {
        let req = GenerateRequest {
            model: model.to_string(),
            prompt: prompt.to_string(),
            system: system.to_string(),
            stream: true,
            options: GenerateOptions {
                temperature,
                num_predict: 2048,
            },
        };

        let resp = self.client
            .post(format!("{}/api/generate", self.base_url))
            .json(&req)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Ollama error ({}): {}", status, body);
        }

        let mut stream = resp.bytes_stream();
        let mut full_response = String::new();
        let mut line_buf = String::new();

        while let Some(chunk) = stream.next().await {
            let bytes = chunk?;
            let text = String::from_utf8_lossy(&bytes);
            line_buf.push_str(&text);

            // Ollama streams NDJSON: one JSON object per line
            while let Some(newline_pos) = line_buf.find('\n') {
                let line = line_buf[..newline_pos].trim().to_string();
                line_buf = line_buf[newline_pos + 1..].to_string();

                if line.is_empty() { continue; }

                if let Ok(gen) = serde_json::from_str::<GenerateResponse>(&line) {
                    if !gen.response.is_empty() {
                        on_token(gen.response.clone());
                        full_response.push_str(&gen.response);
                    }
                    if gen.done { break; }
                }
            }
        }

        Ok(full_response)
    }

    /// Pick the best available model for crossword tasks.
    pub async fn best_available_model(&self) -> Option<String> {
        let models = self.list_models().await.ok()?;
        let model_names: Vec<&str> = models.iter().map(|m| m.name.as_str()).collect();

        // Prefer these models in order
        let preferences = [
            "phi4", "phi-4", "phi3", "phi-3",
            "mistral-small", "mistral",
            "llama3", "llama-3", "llama3.1", "llama3.2",
            "gemma2", "gemma",
            "qwen2.5",
        ];

        for pref in &preferences {
            if let Some(m) = model_names.iter().find(|n| n.contains(pref)) {
                return Some(m.to_string());
            }
        }

        // Fall back to first available model
        models.into_iter().next().map(|m| m.name)
    }
}
