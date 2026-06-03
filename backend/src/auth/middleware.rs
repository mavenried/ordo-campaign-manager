use axum::{
    body::Body,
    extract::State,
    http::{Request, header},
    middleware::Next,
    response::Response,
    Extension,
};
use jsonwebtoken::{decode, DecodingKey, Validation};

use crate::{error::AppError, state::AppState};
use super::models::AuthClaims;

pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> std::result::Result<Response, AppError> {
    // Check Authorization header first
    let token = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string())
        // Fall back to ?token= query param (for SSE / EventSource)
        .or_else(|| {
            req.uri().query().and_then(|q| {
                q.split('&')
                    .find(|p| p.starts_with("token="))
                    .map(|p| p.trim_start_matches("token=").to_string())
            })
        })
        .ok_or(AppError::Unauthorized)?;

    let claims = decode::<AuthClaims>(
        &token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AppError::Unauthorized)?
    .claims;

    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}

pub async fn require_assigner(
    Extension(claims): Extension<AuthClaims>,
    req: Request<Body>,
    next: Next,
) -> std::result::Result<Response, AppError> {
    if claims.role != "assigner" {
        return Err(AppError::Unauthorized);
    }
    Ok(next.run(req).await)
}
