import prisma from "../lib/prisma";

async function main() {
  const c = await prisma.appConfig.findUnique({ where: { id: "app_config" } });
  console.log("maintenanceMode:", c?.maintenanceMode);
  console.log("updatedAt:", c?.updatedAt.toISOString());
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());