import { PrismaClient, UserRole, PlanTier } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Admin@123";

async function main() {
  console.log("🌱 Starting admin seed...");

  // 1. Ensure the demo school exists (needed for user relations)
  const school = await prisma.school.upsert({
    where: { slug: "vdvs-school" },
    update: {},
    create: {
      name: "Vidyadhish Vidyasankul",
      slug: "vdvs-school",
      address: "Kaliyabid,Bhavnagar, Gujarat 380001",
      phone: "+91-9825634545",
      website: "https://vidyadhish.org/",
      planTier: PlanTier.PRO,
      isActive: true,
    },
  });
  console.log(`✅ School: ${school.name}`);

  const pw = await bcrypt.hash(DEMO_PASSWORD, 12);

  // 2. Create the Admin and Super Admin
  const adminData = { name: "Vidyadhish Vidyasankul", email: "vidyadhish.edu@gmail.com", role: UserRole.SCHOOL_ADMIN };
  const superAdminData = { name: "Platform Owner", email: "apgoswami.eww@gmail.com", role: UserRole.SUPER_ADMIN };

  const allUsers = [superAdminData, adminData];

  await Promise.all(
    allUsers.map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        update: { passwordHash: pw, name: u.name, role: u.role },
        create: {
          name: u.name,
          email: u.email,
          passwordHash: pw,
          role: u.role,
          schoolId: school.id,
          isActive: true,
        },
      })
    )
  );

  console.log(`✅ Admins created successfully (password: ${DEMO_PASSWORD})`);
  console.log("   Super Admin: superadmin@demo.edu");
  console.log("   Admin: admin@demo.edu");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Admin seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
