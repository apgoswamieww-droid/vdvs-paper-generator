import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.school.updateMany({
    data: { isActive: true }
  });
  console.log("All schools set to active.");
}
main().finally(() => prisma.$disconnect());
