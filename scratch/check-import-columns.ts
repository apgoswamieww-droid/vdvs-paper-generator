import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cols = await prisma.$queryRaw<{ column_name: string; data_type: string }[]>`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'question_imports'
    ORDER BY ordinal_position
  `;
  console.log("=== question_imports columns (actual DB) ===");
  for (const c of cols) console.log(`  ${c.column_name}  ${c.data_type}`);

  const idx = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'question_imports'
  `;
  console.log("\n=== indexes ===");
  for (const i of idx) console.log(`  ${i.indexname}\n    ${i.indexdef}`);

  const applied = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
    SELECT migration_name, finished_at FROM _prisma_migrations
    ORDER BY finished_at DESC NULLS LAST LIMIT 4
  `;
  console.log("\n=== last applied migrations ===");
  for (const m of applied) console.log(`  ${m.migration_name}  ${m.finished_at ?? "NOT FINISHED"}`);

  // Any other camelCase columns Prisma thinks exist?
  const schema = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name ~ '[A-Z]'
    ORDER BY table_name, column_name
  `;
  console.log("\n=== other camelCase columns in schema (must match Prisma @map or be absent) ===");
  for (const c of schema) console.log(`  ${c.table_name}.${c.column_name}`);
}

main().finally(() => prisma.$disconnect());
