import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The bytes of a filled template, hashed the way the import action does.
const fileBytes = new TextEncoder().encode("fake docx bytes for the bulk import");
const contentHash = createHash("sha256").update(fileBytes).digest("hex");

async function main() {
  const school = await prisma.school.findFirst({ select: { id: true, name: true } });
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!school || !user) throw new Error("no school/user to test against");

  console.log("school:", school.name);
  console.log("hash  :", contentHash.slice(0, 16), "…\n");

  // 1. The exact call that threw in commitImport.
  const previous = await prisma.questionImport.findFirst({
    where: { schoolId: school.id, contentHash },
    select: { id: true, successCount: true, createdAt: true },
  });
  console.log("1. idempotency lookup (was throwing) ->", previous);

  // 2. Write a row carrying the hash, then find it again.
  const created = await prisma.questionImport.create({
    data: {
      fileName: "template.docx",
      kind: "QUESTION",
      status: "PENDING",
      totalCount: 3,
      successCount: 3,
      failedCount: 0,
      errors: [],
      contentHash,
      schoolId: school.id,
      userId: user.id,
    },
    select: { id: true, contentHash: true },
  });
  console.log("2. created row ->", created.id, created.contentHash === contentHash ? "(hash round-trips)" : "(HASH MISMATCH!)");

  // 3. The lookup must now find it — this is the duplicate-upload guard.
  const found = await prisma.questionImport.findFirst({
    where: { schoolId: school.id, contentHash },
    select: { id: true, successCount: true },
  });
  console.log("3. re-upload lookup ->", found?.successCount === 3 ? "found, would refuse duplicate ✓" : "NOT FOUND ✗");

  // 4. A different hash must NOT match.
  const other = await prisma.questionImport.findFirst({
    where: { schoolId: school.id, contentHash: "0".repeat(64) },
    select: { id: true },
  });
  console.log("4. different hash ->", other === null ? "no match ✓" : "WRONGLY MATCHED ✗");

  await prisma.questionImport.delete({ where: { id: created.id } });
  console.log("\ncleaned up test row");
}

main().finally(() => prisma.$disconnect());
