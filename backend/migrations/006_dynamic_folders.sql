-- 006_dynamic_folders — Replace hardcoded folder CHECK with dynamic folders table

-- 1. Create folders table (per workspace)
CREATE TABLE folders (
  name         TEXT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  position     INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, name)
);

-- 2. Seed existing folders for every workspace that has creatives or products
INSERT INTO folders (workspace_id, name, position)
SELECT DISTINCT w.id, f.name, f.pos
FROM workspaces w
CROSS JOIN (VALUES
  ('CA1', 1),
  ('CA2', 2),
  ('CA3', 3),
  ('CA4', 4),
  ('UPSELLS', 5),
  ('SOURCES', 6),
  ('VARIAÇÕES', 7)
) AS f(name, pos)
WHERE EXISTS (
  SELECT 1 FROM workspace_members WHERE workspace_id = w.id
)
OR EXISTS (
  SELECT 1 FROM products WHERE workspace_id = w.id AND archived_at IS NULL
)
ON CONFLICT (workspace_id, name) DO NOTHING;

-- 3. Remove the old CHECK constraint from creatives.folder
ALTER TABLE creatives DROP CONSTRAINT IF EXISTS creatives_folder_check;
