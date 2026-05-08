-- ============================================================================
-- Seed inicial — espelho do data.jsx (frontend)
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- Catálogos
-- ----------------------------------------------------------------------------
INSERT INTO stages (id, title, position, color, icon) VALUES
  ('separados', 'Produtos Separados',  1, 'var(--col-separados)', 'inbox'),
  ('coletados', 'Criativos Coletados', 2, 'var(--col-coletados)', 'layers'),
  ('editados',  'Criativos Editados',  3, 'var(--col-editados)',  'sparkle'),
  ('subir',     'Para Subir',          4, 'var(--col-subir)',     'upload'),
  ('rodando',   'Rodando',             5, 'var(--col-rodando)',   'play'),
  ('escala',    'Escala',              6, 'var(--col-escala)',    'rocket'),
  ('morto',     'Produto Morto',       7, 'var(--col-morto)',     'skull')
ON CONFLICT (id) DO NOTHING;

INSERT INTO labels (id, name, color) VALUES
  ('gadget',  'Gadget',  'oklch(0.72 0.12 240)'),
  ('beleza',  'Beleza',  'oklch(0.72 0.14 340)'),
  ('pet',     'Pet',     'oklch(0.78 0.14 80)'),
  ('casa',    'Casa',    'oklch(0.72 0.14 160)'),
  ('fitness', 'Fitness', 'oklch(0.72 0.14 30)'),
  ('kids',    'Kids',    'oklch(0.72 0.14 300)'),
  ('wow',     'WOW',     'oklch(0.82 0.16 90)'),
  ('inverno', 'Inverno', 'oklch(0.72 0.10 220)')
ON CONFLICT (id) DO NOTHING;

-- Checklist templates
INSERT INTO stage_checklist_templates (stage_id, item_id, text, position) VALUES
  ('separados','fornecedor','Fornecedor confirmado',0),
  ('separados','margem','Margem mínima validada (≥ 2x)',1),
  ('separados','concorrencia','Pesquisa de concorrência feita',2),
  ('coletados','sources','Mínimo 5 sources coletadas',0),
  ('coletados','hooks','Hooks identificados',1),
  ('coletados','angulos','Ângulos de venda mapeados',2),
  ('editados','ca1','CA1 com 3+ criativos prontos',0),
  ('editados','ca2','CA2 com 3+ criativos prontos',1),
  ('editados','thumbs','Thumbnails revisadas',2),
  ('editados','copies','Copies aprovadas',3),
  ('subir','pixel','Pixel/CAPI funcionando',0),
  ('subir','site','Site / checkout testado',1),
  ('subir','estoque','Estoque/fornecedor alinhado',2),
  ('subir','conta','Conta de anúncio liberada',3),
  ('subir','utm','UTMs configuradas',4),
  ('rodando','monitor','Monitorando 3x ao dia',0),
  ('rodando','roas','ROAS mínimo definido',1),
  ('escala','cbo','CBOs estruturadas',0),
  ('escala','lookalike','Lookalikes ativados',1),
  ('escala','upsell','Upsell rodando',2),
  ('morto','analise','Análise de morte registrada',0),
  ('morto','pausado','Campanhas pausadas',1)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- Equipe
-- ----------------------------------------------------------------------------
INSERT INTO users (id, name, email, color, role) VALUES
  ('11111111-1111-1111-1111-111111111111','Você',         'voce@kanban.local',  'oklch(0.78 0.16 135)','admin'),
  ('22222222-2222-2222-2222-222222222222','Ana Trafego',  'ana@kanban.local',   'oklch(0.72 0.14 340)','gestor'),
  ('33333333-3333-3333-3333-333333333333','Bruno Editor', 'bruno@kanban.local', 'oklch(0.72 0.12 240)','editor'),
  ('44444444-4444-4444-4444-444444444444','Carla Copy',   'carla@kanban.local', 'oklch(0.82 0.16 90)', 'editor')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Produto exemplo: Mini Aspirador Portátil USB
-- ----------------------------------------------------------------------------
WITH p AS (
  INSERT INTO products (id, name, stage_id, color, favorite, start_date, supplier, created_by, entered_stage_at)
  VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Mini Aspirador Portátil USB', 'rodando', 'oklch(0.72 0.12 240)', true,
    DATE '2026-04-22', 'https://aliexpress.com/item/100482839',
    '11111111-1111-1111-1111-111111111111',
    now() - interval '3 days'
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT * FROM p;

INSERT INTO product_labels (product_id, label_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','gadget'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','casa')
ON CONFLICT DO NOTHING;

-- Multi-assignee: Ana é dona, Bruno também
INSERT INTO product_assignees (product_id, user_id, assigned_by) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- Métricas (últimos 8 dias)
INSERT INTO metrics (product_id, date, time, cost, sales, revenue, logged_by)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  (current_date - i)::DATE,
  '14:30',
  (100 + random()*80)::NUMERIC(12,2),
  (random()*8)::INTEGER,
  (300 + random()*400)::NUMERIC(12,2),
  '22222222-2222-2222-2222-222222222222'
FROM generate_series(0,7) i;

-- Comentário com mention pro Bruno
WITH c AS (
  INSERT INTO comments (id, product_id, author_id, body, created_at)
  VALUES (
    'cccccccc-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    'CA2 está performando 30% melhor que CA1 — pausar criativos antigos. @Bruno consegue cortar mais 2 versões hoje?',
    now() - interval '2 days'
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT * FROM c;

INSERT INTO comment_mentions (comment_id, user_id) VALUES
  ('cccccccc-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333')
ON CONFLICT DO NOTHING;

-- Activity correspondente (mention)
WITH a AS (
  INSERT INTO activity (id, type, product_id, product_name, by_id, text, snippet, at)
  VALUES (
    'eeeeeeee-1111-1111-1111-111111111111',
    'mention', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Mini Aspirador Portátil USB',
    '22222222-2222-2222-2222-222222222222',
    'mencionou em', 'CA2 está performando 30% melhor que CA1…',
    now() - interval '2 days'
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT * FROM a;

INSERT INTO activity_targets (activity_id, user_id, reason) VALUES
  ('eeeeeeee-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','mention')
ON CONFLICT DO NOTHING;
-- A notificação é criada automaticamente pelo trigger.

COMMIT;
