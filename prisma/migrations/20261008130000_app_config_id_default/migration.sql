-- schema.prisma declares `id String @id @default("app_config")` but the
-- app_configs migration created the column with no default, so the schema and
-- the database disagreed. Harmless at runtime (every write sets the id
-- explicitly), but it left `prisma migrate diff` permanently non-empty, which
-- hides real drift — the mistake that let question_imports.contentHash ship
-- broken. Restoring the default makes the diff a usable signal again.
ALTER TABLE "app_configs" ALTER COLUMN "id" SET DEFAULT 'app_config';
