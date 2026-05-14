-- 005_add_reserved_by — Add missing columns for product reservation feature

ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;
