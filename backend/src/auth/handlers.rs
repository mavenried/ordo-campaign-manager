use axum::{extract::State, Extension, Json};
use jsonwebtoken::{encode, EncodingKey, Header};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{rand_core::OsRng, SaltString};
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    state::AppState,
};
use super::models::{AuthClaims, AuthResponse, LoginRequest, RegisterRequest, UserInfo};

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(req.password.as_bytes(), &salt)
        .map_err(|_| AppError::Internal)?
        .to_string();

    let user = sqlx::query_as::<_, UserInfo>(
        "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
         RETURNING id, email, name, role",
    )
    .bind(&req.email)
    .bind(&req.name)
    .bind(&hash)
    .fetch_one(&state.db)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db) if db.constraint() == Some("users_email_key") => {
            AppError::BadRequest("email already in use".into())
        }
        e => AppError::Db(e),
    })?;

    let token = make_token(&user.id, &user.role, &state.config.jwt_secret)?;
    Ok(Json(AuthResponse { token, user }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>> {
    let row = sqlx::query(
        "SELECT id, email, name, role, password_hash FROM users WHERE email = $1",
    )
    .bind(&req.email)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    use sqlx::Row;
    let password_hash: String = row.try_get("password_hash").map_err(|_| AppError::Internal)?;
    let hash = PasswordHash::new(&password_hash).map_err(|_| AppError::Internal)?;
    Argon2::default()
        .verify_password(req.password.as_bytes(), &hash)
        .map_err(|_| AppError::Unauthorized)?;

    let user = UserInfo {
        id: row.try_get("id").map_err(|_| AppError::Internal)?,
        email: row.try_get("email").map_err(|_| AppError::Internal)?,
        name: row.try_get("name").map_err(|_| AppError::Internal)?,
        role: row.try_get("role").map_err(|_| AppError::Internal)?,
    };
    let token = make_token(&user.id, &user.role, &state.config.jwt_secret)?;
    Ok(Json(AuthResponse { token, user }))
}

pub async fn me(
    Extension(claims): Extension<AuthClaims>,
    State(state): State<AppState>,
) -> Result<Json<UserInfo>> {
    let user = sqlx::query_as::<_, UserInfo>(
        "SELECT id, email, name, role FROM users WHERE id = $1",
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(user))
}

fn make_token(user_id: &Uuid, role: &str, secret: &str) -> Result<String> {
    let exp = (chrono::Utc::now() + chrono::Duration::days(7)).timestamp() as usize;
    let claims = AuthClaims { sub: *user_id, role: role.to_string(), exp };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
        .map_err(|_| AppError::Internal)
}
