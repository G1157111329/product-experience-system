ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ingredient_items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE recipe_steps ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE check_records ADD COLUMN IF NOT EXISTS recipe_id VARCHAR(36) REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE check_records ADD COLUMN IF NOT EXISTS recipe_step_id VARCHAR(36) REFERENCES recipe_steps(id) ON DELETE SET NULL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS recipe_id VARCHAR(36) REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS recipe_step_id VARCHAR(36) REFERENCES recipe_steps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS check_records_recipe_id_idx ON check_records(recipe_id);
CREATE INDEX IF NOT EXISTS check_records_recipe_step_id_idx ON check_records(recipe_step_id);
CREATE INDEX IF NOT EXISTS issues_recipe_id_idx ON issues(recipe_id);
CREATE INDEX IF NOT EXISTS issues_recipe_step_id_idx ON issues(recipe_step_id);
