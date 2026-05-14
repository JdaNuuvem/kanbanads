-- ============================================================================
-- Kanban Ads & Dropshipping — Postgres schema
-- Postgres 15+
-- ============================================================================
-- Cria extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- emails case-insensitive
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy search (gin_trgm_ops)

-- ============================================================================
-- LIMPEZA (rodar em dev só) — descomentar pra resetar
-- ============================================================================
-- DROP SCHEMA public CASCADE; CREATE SCHEMA public;

-- ============================================================================
-- ENUMS
-- ============================================================================
CREATE TYPE user_role AS ENUM ('admin', 'gestor', 'editor', 'viewer');

CREATE TYPE creative_type   AS ENUM ('video', 'image', 'copy');
CREATE TYPE creative_status AS ENUM ('rascunho', 'aprovado', 'rodando', 'pausado', 'morto');

CREATE TYPE activity_type AS ENUM (
  'create', 'move', 'assign', 'unassign',
  'comment', 'mention', 'metric', 'delete', 'edit'
);

CREATE TYPE notif_reason AS ENUM ('mention', 'assignee', 'watcher', 'comment_on_mine');

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       CITEXT UNIQUE,
  password_hash TEXT,                  -- bcrypt; NULL = SSO/external auth
  color       TEXT NOT NULL DEFAULT 'oklch(0.78 0.16 135)',
  role        user_role NOT NULL DEFAULT 'editor',
  active      BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_active ON users(active) WHERE active = true;

-- ============================================================================
-- WORKSPACES — cada workspace é um kanban isolado
-- ============================================================================
CREATE TABLE workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT 'oklch(0.72 0.12 240)',
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_workspaces_default ON workspaces(is_default) WHERE is_default = true;

CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_ws_members_user ON workspace_members(user_id);

-- Workspace default para seed data
INSERT INTO workspaces (id, name, description, color, created_by, is_default)
VALUES ('00000000-0000-0000-0000-000000000001', 'Kanban Principal', 'Workspace padrão', 'oklch(0.72 0.12 240)', '11111111-1111-1111-1111-111111111111', true)
ON CONFLICT DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'member'),
  ('00000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'member')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- CATÁLOGOS (estágios e labels)
-- ============================================================================
CREATE TABLE stages (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  position  SMALLINT NOT NULL UNIQUE,
  color     TEXT NOT NULL,
  icon      TEXT
);

CREATE TABLE labels (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT NOT NULL
);

-- Checklist templates por estágio
CREATE TABLE stage_checklist_templates (
  stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  item_id  TEXT NOT NULL,
  text     TEXT NOT NULL,
  position SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (stage_id, item_id)
);

-- ============================================================================
-- PRODUCTS
-- ============================================================================
CREATE TABLE products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  stage_id         TEXT NOT NULL REFERENCES stages(id),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  color            TEXT,
  favorite         BOOLEAN NOT NULL DEFAULT false,
  start_date       DATE,
  supplier         TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  reserved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  reserved_at      TIMESTAMPTZ,
  entered_stage_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_stage          ON products(stage_id) WHERE archived_at IS NULL;
CREATE INDEX idx_products_favorite       ON products(favorite) WHERE favorite = true;
CREATE INDEX idx_products_entered_stage  ON products(stage_id, entered_stage_at);
CREATE INDEX idx_products_workspace      ON products(workspace_id, created_at DESC);
CREATE INDEX idx_products_name_trgm      ON products USING gin (name gin_trgm_ops);

-- M2M: produto ↔ labels
CREATE TABLE product_labels (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label_id   TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, label_id)
);

-- M2M: responsáveis múltiplos
CREATE TABLE product_assignees (
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (product_id, user_id)
);

CREATE INDEX idx_assignees_user ON product_assignees(user_id);

-- Checklist do produto (instância por produto)
CREATE TABLE product_checklist (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  done_at    TIMESTAMPTZ,
  done_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (product_id, item_id)
);

-- ============================================================================
-- CRIATIVOS (CA1, CA2, …, UPSELLS, SOURCES, VARIAÇÕES)
-- ============================================================================
CREATE TABLE creatives (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  folder      TEXT NOT NULL CHECK (folder IN ('CA1','CA2','CA3','CA4','UPSELLS','SOURCES','VARIAÇÕES')),
  name        TEXT NOT NULL,
  type        creative_type NOT NULL,
  version     SMALLINT NOT NULL DEFAULT 1,
  status      creative_status NOT NULL DEFAULT 'rascunho',
  size        TEXT,
  body_text   TEXT,                       -- conteúdo de copy
  link        TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  ctr         NUMERIC(8,2)  NOT NULL DEFAULT 0,
  cpm         NUMERIC(8,2)  NOT NULL DEFAULT 0,
  spent       NUMERIC(12,2) NOT NULL DEFAULT 0,
  added_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_creatives_product   ON creatives(product_id);
CREATE INDEX idx_creatives_folder    ON creatives(product_id, folder);
CREATE INDEX idx_creatives_status    ON creatives(status);

-- ============================================================================
-- MÉTRICAS DIÁRIAS
-- ============================================================================
CREATE TABLE metrics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  time        TEXT,                              -- 'HH:MM'
  cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
  bid         NUMERIC(12,2),
  budget      NUMERIC(12,2),
  cpa         NUMERIC(12,2) GENERATED ALWAYS AS (CASE WHEN sales > 0 THEN cost/sales ELSE 0 END) STORED,
  sales       INTEGER NOT NULL DEFAULT 0,
  revenue     NUMERIC(12,2) NOT NULL DEFAULT 0,
  note        TEXT,
  logged_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metrics_product_date ON metrics(product_id, date DESC);
CREATE INDEX idx_metrics_date         ON metrics(date);
CREATE UNIQUE INDEX idx_metrics_unique ON metrics(product_id, date);

-- ============================================================================
-- COMENTÁRIOS + MENÇÕES
-- ============================================================================
CREATE TABLE comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  edited_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_product ON comments(product_id, created_at DESC);
CREATE INDEX idx_comments_author  ON comments(author_id);

CREATE TABLE comment_mentions (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX idx_mentions_user ON comment_mentions(user_id);

-- ============================================================================
-- ATIVIDADE (feed da equipe) + NOTIFICAÇÕES
-- ============================================================================
-- Eventos globais. Source-of-truth de tudo que aconteceu.
CREATE TABLE activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          activity_type NOT NULL,
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name  TEXT,                         -- snapshot (sobrevive a delete)
  by_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  text          TEXT NOT NULL,
  snippet       TEXT,
  payload       JSONB,                        -- {from_stage, to_stage, …}
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_at         ON activity(at DESC);
CREATE INDEX idx_activity_product    ON activity(product_id, at DESC);
CREATE INDEX idx_activity_by         ON activity(by_id, at DESC);
CREATE INDEX idx_activity_type       ON activity(type);
CREATE INDEX idx_activity_workspace  ON activity(workspace_id, at DESC);
CREATE INDEX idx_activity_payload_gin ON activity USING gin (payload);

-- Quem foi afetado por cada evento (mencionado / responsável / watcher)
-- Permite filtrar feed pessoal rapidamente.
CREATE TABLE activity_targets (
  activity_id UUID NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      notif_reason NOT NULL,
  PRIMARY KEY (activity_id, user_id, reason)
);

CREATE INDEX idx_activity_targets_user ON activity_targets(user_id);

-- Notificações = view personalizada da activity. read flag separado por user.
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  reason      notif_reason NOT NULL,
  read        BOOLEAN NOT NULL DEFAULT false,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_id, reason)
);

CREATE INDEX idx_notifs_user_unread ON notifications(user_id, created_at DESC) WHERE read = false;
CREATE INDEX idx_notifs_user_all    ON notifications(user_id, created_at DESC);

-- Histórico por produto (mostra na aside do modal)
-- Pode ser materializado a partir da activity, ou separado por simplicidade.
CREATE TABLE product_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  text        TEXT NOT NULL,
  by_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_history_product ON product_history(product_id, at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================
-- updated_at automático
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated_at      BEFORE UPDATE ON users      FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER tr_products_updated_at   BEFORE UPDATE ON products   FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER tr_creatives_updated_at  BEFORE UPDATE ON creatives  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER tr_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- entered_stage_at automático ao mudar stage_id
CREATE OR REPLACE FUNCTION trg_stage_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.entered_stage_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_products_stage_change BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION trg_stage_change();

-- Cria notification automaticamente pra cada activity_target
CREATE OR REPLACE FUNCTION trg_activity_target_notify() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, activity_id, reason)
  VALUES (NEW.user_id, NEW.activity_id, NEW.reason)
  ON CONFLICT (user_id, activity_id, reason) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_activity_target_notify AFTER INSERT ON activity_targets
  FOR EACH ROW EXECUTE FUNCTION trg_activity_target_notify();

-- ============================================================================
-- VIEWS — agregações úteis pra dashboard
-- ============================================================================

-- Métricas agregadas por produto (1 linha por produto)
CREATE VIEW v_product_metrics AS
SELECT
  m.product_id,
  SUM(m.cost)    AS total_cost,
  SUM(m.revenue) AS total_revenue,
  SUM(m.sales)   AS total_sales,
  SUM(m.revenue) - SUM(m.cost) AS profit,
  CASE WHEN SUM(m.cost) > 0 THEN SUM(m.revenue)/SUM(m.cost) ELSE 0 END AS roas,
  CASE WHEN SUM(m.sales) > 0 THEN SUM(m.cost)/SUM(m.sales) ELSE 0 END AS cpa,
  COUNT(DISTINCT m.date) AS active_days,
  MAX(m.date) AS last_metric_date
FROM metrics m
GROUP BY m.product_id;

-- Carga de trabalho por usuário (= o gráfico do dashboard)
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

-- Distribuição por estágio de cada usuário (pra barra empilhada)
CREATE VIEW v_user_stage_distribution AS
SELECT pa.user_id, p.stage_id, COUNT(*) AS n
FROM product_assignees pa
JOIN products p ON p.id = pa.product_id
WHERE p.archived_at IS NULL
GROUP BY pa.user_id, p.stage_id;

-- Funil (counts por estágio)
CREATE VIEW v_funnel AS
SELECT
  s.id, s.title, s.position, s.color,
  COUNT(p.id) AS total,
  ROUND(AVG(EXTRACT(EPOCH FROM (now() - p.entered_stage_at))/86400))::INTEGER AS avg_days_in_stage
FROM stages s
LEFT JOIN products p ON p.stage_id = s.id AND p.archived_at IS NULL
GROUP BY s.id, s.title, s.position, s.color
ORDER BY s.position;

-- Notificações não-lidas por usuário (pra o badge do sino)
CREATE VIEW v_unread_counts AS
SELECT user_id, COUNT(*) AS unread
FROM notifications
WHERE read = false
GROUP BY user_id;

-- ============================================================================
-- ROW-LEVEL SECURITY (opcional — habilitar se cada usuário só vê o que devia)
-- ============================================================================
-- Configurar a sessão com:
--    SET app.current_user_id = '<uuid>';
--    SET app.current_role    = 'editor';
--
-- ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
--
-- Notification: só o dono vê
-- CREATE POLICY notifs_self ON notifications USING (
--   user_id = current_setting('app.current_user_id')::uuid
-- );
--
-- Viewer (visualizador): READ all, WRITE nada
-- Editor / Gestor: tudo nos produtos atribuídos
-- Admin: tudo
-- ============================================================================
