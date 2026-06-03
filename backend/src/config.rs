use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub mistral_api_key: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            jwt_secret: env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            mistral_api_key: env::var("MISTRAL_API_KEY").unwrap_or_default(),
            port: env::var("PORT")
                .unwrap_or_else(|_| "4000".to_string())
                .parse()
                .expect("PORT must be a number"),
        }
    }
}
