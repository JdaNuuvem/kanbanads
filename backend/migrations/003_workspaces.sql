-- ============================================================================
-- 003_workspaces — Workspace support (idempotent migration)
-- Cria tabelas/colunas se não existirem + dados do workspace default
-- ============================================================================

-- Cria tabela workspaces se não existir
CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT 'oklch(0.72 0.12 240)',
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_default ON workspaces(is_default) WHERE is_default = true;

-- Trigger updated_at
DROP TRIGGER IF EXISTS tr_workspaces_updated_at ON workspaces;
CREATE TRIGGER tr_workspaces_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Cria tabela workspace_members se não existir
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ws_members_user ON workspace_members(user_id);

-- Adiciona workspace_id nas tabelas existentes (se ainda não tiver)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'workspace_id') THEN
    ALTER TABLE products ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity' AND column_name = 'workspace_id') THEN
    ALTER TABLE activity ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_products_workspace ON products(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_workspace ON activity(workspace_id, at DESC);

-- Recria views com escopo de workspace (DROP + CREATE é idempotente)
DROP VIEW IF EXISTS v_user_workload;
CREATE VIEW v_user_workload AS
SELECT
  u.id, u.name, u.role, u.color,
  COUNT(DISTINCT pa.product_id) FILTER (
    WHERE p.stage_id != 'morto' AND p.archived_at IS NULL
  ) AS active_count,
  COUNT(DISTINCT pa.product_id) FILTER (
    WHERE p.stage_id IN ('rodando','escala')
  ) AS running_count,
  COUNT(DISTINCT pa.product_id) FILTER (
    WHERE p.stage_id = 'rodando' AND p.entered_stage_at < now() - interval '7 days'
  ) AS stale_count,
  COALESCE(SUM(pma.profit), 0) AS total_profit
FROM users u
LEFT JOIN product_assignees pa ON pa.user_id = u.id
LEFT JOIN products p           ON p.id = pa.product_id
LEFT JOIN v_product_metrics pma ON pma.product_id = p.id
WHERE u.active = true
GROUP BY u.id, u.name, u.role, u.color;

DROP VIEW IF EXISTS v_user_stage_distribution;
CREATE VIEW v_user_stage_distribution AS
SELECT pa.user_id, p.stage_id, COUNT(*) AS n
FROM product_assignees pa
JOIN products p ON p.id = pa.product_id
WHERE p.archived_at IS NULL
GROUP BY pa.user_id, p.stage_id;

DROP VIEW IF EXISTS v_funnel;
CREATE VIEW v_funnel AS
SELECT
  s.id, s.title, s.position, s.color,
  COUNT(p.id) AS total,
  ROUND(AVG(EXTRACT(EPOCH FROM (now() - p.entered_stage_at))/86400))::INTEGER AS avg_days_in_stage
FROM stages s
LEFT JOIN products p ON p.stage_id = s.id AND p.archived_at IS NULL
GROUP BY s.id, s.title, s.position, s.color
ORDER BY s.position;

-- Cria workspace default e popula dados existentes (idempotente)
DO $$
DECLARE
  default_ws_id UUID;
  admin_user_id UUID;
  user_record RECORD;
BEGIN
  -- Verifica se já existe workspace default
  SELECT id INTO default_ws_id FROM workspaces WHERE is_default = true LIMIT 1;

  IF default_ws_id IS NULL THEN
    SELECT id INTO admin_user_id FROM users WHERE role = 'admin' AND active = true LIMIT 1;
    IF admin_user_id IS NULL THEN
      SELECT id INTO admin_user_id FROM users WHERE active = true LIMIT 1;
    END IF;

    INSERT INTO workspaces (id, name, description, color, created_by, is_default)
    VALUES (gen_random_uuid(), 'Kanban Principal', 'Workspace padrão', 'oklch(0.72 0.12 240)', admin_user_id, true)
    RETURNING id INTO default_ws_id;

    -- Adiciona todos usuários ativos como membros
    FOR user_record IN SELECT id FROM users WHERE active = true LOOP
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (default_ws_id, user_record.id,
        CASE
          WHEN user_record.id = admin_user_id THEN 'owner'
          WHEN EXISTS (SELECT 1 FROM users WHERE id = user_record.id AND role = 'admin') THEN 'admin'
          ELSE 'member'
        END
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Migra produtos órfãos (sem workspace_id) para o workspace default
  UPDATE products SET workspace_id = default_ws_id WHERE workspace_id IS NULL;

  -- Migra activity órfã para o workspace default
  UPDATE activity SET workspace_id = default_ws_id WHERE workspace_id IS NULL;
END $$;
