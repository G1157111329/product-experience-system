-- Cell style targets use "leaf-row-id:column-id" for individual cells.
-- Two UUIDs plus the separator exceed the previous VARCHAR(36) limit.
ALTER TABLE matrix_cell_styles
  ALTER COLUMN target_id TYPE VARCHAR(160);
