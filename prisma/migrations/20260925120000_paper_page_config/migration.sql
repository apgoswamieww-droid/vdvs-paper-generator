-- Custom page setup for generated papers (size / orientation / margins / density)
ALTER TABLE "papers" ADD COLUMN "pageConfig" JSONB;
