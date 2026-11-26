ALTER TABLE academic_pathway ADD COLUMN IF NOT EXISTS guidance JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE academic_pathway ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE academic_pathway ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS academic_pathway_title_unique ON academic_pathway (lower(trim(title)));
