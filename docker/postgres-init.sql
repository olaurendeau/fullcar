-- The dev server and end-to-end tests use `fullcar`; Vitest uses `fullcar_test`, and the
-- migration test its own `fullcar_migrations_test`, which it takes up and down freely.
-- Only run on a fresh volume: the Vitest global setup creates a database missing from an older one.
CREATE DATABASE fullcar_test OWNER fullcar;
CREATE DATABASE fullcar_migrations_test OWNER fullcar;
