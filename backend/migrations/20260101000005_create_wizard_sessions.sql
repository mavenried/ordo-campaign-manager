CREATE TABLE wizard_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_name TEXT NOT NULL,
    project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
    messages    JSONB NOT NULL DEFAULT '[]',
    finalized   BOOLEAN NOT NULL DEFAULT false,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
