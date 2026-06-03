CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done');

CREATE TABLE tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id   UUID NOT NULL REFERENCES task_families(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    form_data   JSONB NOT NULL DEFAULT '{}',
    status      task_status NOT NULL DEFAULT 'todo',
    start_date  DATE,
    due_date    DATE,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_assignees (
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, user_id)
);

CREATE INDEX tasks_family_id ON tasks(family_id);
CREATE INDEX tasks_status    ON tasks(status);
CREATE INDEX tasks_due_date  ON tasks(due_date);
