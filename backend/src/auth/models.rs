use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthClaims {
    pub sub: Uuid,
    pub role: String,
    pub exp: usize,
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub name: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct UserInfo {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
}
