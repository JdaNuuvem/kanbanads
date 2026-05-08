-- ============================================================================
-- Test seeds — fixtures determinísticas
-- ============================================================================
BEGIN;

-- Stages
INSERT INTO stages (id, title, position, color, icon) VALUES
  ('test_stage_1', 'Test Stage 1', 1, '#ff0000', 'box'),
  ('test_stage_2', 'Test Stage 2', 2, '#00ff00', 'check')
ON CONFLICT (id) DO NOTHING;

-- Labels
INSERT INTO labels (id, name, color) VALUES
  ('test_label_1', 'Test Label', '#0000ff')
ON CONFLICT (id) DO NOTHING;

-- Users
INSERT INTO users (id, name, email, password_hash, color, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Test Admin', 'testadmin@test.local', NULL, 'oklch(0.78 0.16 135)', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Test Gestor', 'testgestor@test.local', NULL, 'oklch(0.72 0.14 340)', 'gestor'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Test Editor', 'testeditor@test.local', NULL, 'oklch(0.72 0.12 240)', 'editor')
ON CONFLICT (id) DO NOTHING;

COMMIT;
