// Read-only sanity check — prints schema/data facts, writes nothing.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const cols = await prisma.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'papers' ORDER BY ordinal_position"
  );
  console.log("papers columns:", cols.map((c) => c.column_name).join(", "));

  const tables = await prisma.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_name IN ('header_templates','papers')"
  );
  console.log("tables:", tables.map((t) => t.table_name).join(", "));

  const counts = await prisma.$queryRawUnsafe(
    "SELECT (SELECT count(*) FROM questions) AS questions, (SELECT count(*) FROM subjects) AS subjects, (SELECT count(*) FROM papers) AS papers, (SELECT count(*) FROM class_levels) AS classes"
  );
  const c = counts[0];
  console.log(
    "counts: questions=%s subjects=%s papers=%s classes=%s",
    c.questions, c.subjects, c.papers, c.classes
  );

  // The exact select listPapers() runs — proves the generated client knows setCount.
  const rows = await prisma.paper.findMany({
    where: { schoolId: "cmuuuos5d00002oiq6hjg80v8" },
    select: { id: true, title: true, setCount: true, status: true },
    take: 3,
  });
  console.log("paper findMany with setCount select: OK —", rows.length, "rows");
} finally {
  await prisma.$disconnect();
}
