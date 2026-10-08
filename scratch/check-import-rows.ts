import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    "SELECT count(*)::int AS n FROM question_imports"
  );
  const nonNull = await prisma.$queryRawUnsafe<{ n: number }[]>(
    'SELECT count(*)::int AS n FROM question_imports WHERE "content_hash" IS NOT NULL'
  );
  console.log("question_imports rows      :", rows[0].n);
  console.log("rows with a content_hash  :", nonNull[0].n);
}

main().finally(() => prisma.$disconnect());
