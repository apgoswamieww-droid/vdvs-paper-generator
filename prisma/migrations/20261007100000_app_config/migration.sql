-- App Configuration: singleton row for mobile version gates, compulsory updates and maintenance mode.
-- CreateTable
CREATE TABLE "app_configs" (
    "id" TEXT NOT NULL,
    "android_version" TEXT NOT NULL DEFAULT '1.0.0',
    "android_compulsory_update" BOOLEAN NOT NULL DEFAULT false,
    "ios_version" TEXT NOT NULL DEFAULT '1.0.0',
    "ios_compulsory_update" BOOLEAN NOT NULL DEFAULT false,
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);
