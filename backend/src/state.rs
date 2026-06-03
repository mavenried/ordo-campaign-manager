use crate::config::Config;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AiClient {
    pub client: reqwest::Client,
    pub api_key: String,
}

impl AiClient {
    pub fn new(api_key: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub ai: AiClient,
}
