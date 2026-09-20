import { PrismaClient } from "@prisma/client";

// ============================================================
//  Prisma Client Singleton
//
//  In Next.js, hot-reloading in development can create multiple
//  Prisma Client instances, exhausting database connections.
//  This pattern caches the client on the global object in dev.
// ============================================================

declare global {
  // Allow the global `var` declaration for the cached instance
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
};

const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;
