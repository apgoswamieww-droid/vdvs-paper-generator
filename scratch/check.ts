import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, schoolId: true, role: true }
  });
  const schools = await prisma.school.findMany({
    select: { id: true, slug: true, name: true, isActive: true }
  });

  console.log("USERS:", JSON.stringify(users, null, 2));
  console.log("SCHOOLS:", JSON.stringify(schools, null, 2));
}
main().finally(() => prisma.$disconnect());
