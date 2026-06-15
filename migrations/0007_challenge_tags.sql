-- Custom tags per challenge (JSON array of strings), separate from category.
ALTER TABLE challenges ADD COLUMN tags TEXT;
