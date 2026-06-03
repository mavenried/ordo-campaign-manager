mod auth;
mod calendar;
mod campaign_wizard;
mod campaigns;
mod chat;
mod config;
mod error;
mod state;
mod tasks;
mod users;
pub(crate) mod wizard; // claude.rs used by campaign_wizard

use axum::{
    middleware,
    routing::{delete, get, post, patch},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use config::Config;
use state::{AiClient, AppState};

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "campaign_manager=debug,tower_http=debug".parse().unwrap()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();

    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await
        .expect("failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("failed to run migrations");

    let ai = AiClient::new(config.mistral_api_key.clone());
    let state = AppState { db, config: config.clone(), ai };

    let cors = CorsLayer::permissive();

    // Assigner-only routes
    let assigner_only = Router::new()
        .route("/campaigns", post(campaigns::handlers::create_campaign))
        .route("/campaigns/{id}", patch(campaigns::handlers::update_campaign).delete(campaigns::handlers::delete_campaign))
        .route("/campaigns/{id}/tasks", post(tasks::handlers::create_task))
        .route("/tasks/{id}", delete(tasks::handlers::delete_task))
        .route("/tasks/{id}/assignees", post(tasks::handlers::add_assignee))
        .route("/tasks/{id}/assignees/{user_id}", delete(tasks::handlers::remove_assignee))
        .route("/tasks/{id}/dependencies", post(tasks::handlers::add_dependency))
        .route("/tasks/{id}/dependencies/{dep_id}", delete(tasks::handlers::remove_dependency))
        // Campaign creation wizard
        .route("/campaign-wizard/start", post(campaign_wizard::handlers::start_wizard))
        .route("/campaign-wizard/{session_id}/message", post(campaign_wizard::handlers::wizard_message))
        .route("/campaign-wizard/{session_id}/generate", post(campaign_wizard::handlers::generate_tasks))
        .layer(middleware::from_fn(auth::middleware::require_assigner));

    // All authenticated users
    let protected = Router::new()
        .route("/auth/me", get(auth::handlers::me))
        .route("/me/tasks", get(tasks::handlers::my_tasks))
        .route("/users", get(users::handlers::list_users))
        .route("/users/{id}/tasks", get(tasks::handlers::user_tasks))
        .route("/campaigns", get(campaigns::handlers::list_campaigns))
        .route("/campaigns/{id}", get(campaigns::handlers::get_campaign))
        .route("/campaigns/{id}/tasks", get(tasks::handlers::list_tasks))
        .route("/tasks/{id}", get(tasks::handlers::get_task).patch(tasks::handlers::update_task))
        .route("/calendar", get(calendar::handlers::get_calendar))
        .route("/chat/sessions", get(chat::handlers::list_sessions).post(chat::handlers::create_session))
        .route("/chat/sessions/{id}", delete(chat::handlers::delete_session))
        .route("/chat/sessions/{id}/messages", get(chat::handlers::list_messages))
        .route("/chat/sessions/{id}/message", post(chat::handlers::send_message))
        .merge(assigner_only)
        .layer(middleware::from_fn_with_state(state.clone(), auth::middleware::require_auth));

    let api = Router::new()
        .nest("/api/v1", Router::new()
            .route("/auth/register", post(auth::handlers::register))
            .route("/auth/login", post(auth::handlers::login))
        )
        .nest("/api/v1", protected)
        .with_state(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, api).await.unwrap();
}
