UPDATE users SET role = 'admin' WHERE role = 'assigner';
UPDATE users SET role = 'member' WHERE role = 'assignee';
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member';

UPDATE tasks SET status = 'in_progress' WHERE status = 'blocked';
