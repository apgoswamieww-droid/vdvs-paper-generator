// Shared helpers for the AppConfig singleton: the fixed row id, a
// self-initialising reader, and the view/payload shapes used by the
// super-admin panel and the public GET /api/app/init endpoint.

import type { AppConfig } from "@prisma/client";
import prisma from "@/lib/prisma";

/** Fixed primary key of the singleton AppConfig row. */
export const APP_CONFIG_ID = "app_config";

/** Shape returned to the super-admin panel (camelCase + ISO timestamp). */
export type AppConfigView = {
  androidVersion: string;
  androidCompulsoryUpdate: boolean;
  iosVersion: string;
  iosCompulsoryUpdate: boolean;
  maintenanceMode: boolean;
  updatedAt: string;
};

/** Public JSON contract for the mobile app's boot check. */
export type AppInitPayload = {
  maintenance_mode: boolean;
  android: { version: string; compulsory_update: boolean };
  ios: { version: string; compulsory_update: boolean };
  updated_at: string;
};

/**
 * Read the singleton row, creating it with schema defaults on first use so
 * the mobile app always receives a valid payload even before a super admin
 * has opened the panel. Deliberately NOT an upsert-with-empty-update:
 * reads must never bump `updatedAt` (it means "when config was changed").
 */
export async function readAppConfig(): Promise<AppConfig> {
  const existing = await prisma.appConfig.findUnique({
    where: { id: APP_CONFIG_ID },
  });
  if (existing) return existing;
  try {
    return await prisma.appConfig.create({ data: { id: APP_CONFIG_ID } });
  } catch {
    // Two cold readers raced the first insert — the row exists now.
    const row = await prisma.appConfig.findUnique({
      where: { id: APP_CONFIG_ID },
    });
    if (!row) throw new Error("AppConfig singleton could not be initialised.");
    return row;
  }
}

export function toConfigView(config: AppConfig): AppConfigView {
  return {
    androidVersion: config.androidVersion,
    androidCompulsoryUpdate: config.androidCompulsoryUpdate,
    iosVersion: config.iosVersion,
    iosCompulsoryUpdate: config.iosCompulsoryUpdate,
    maintenanceMode: config.maintenanceMode,
    updatedAt: config.updatedAt.toISOString(),
  };
}

/** Snake_case payload the React Native client consumes on launch. */
export function toInitPayload(config: AppConfig): AppInitPayload {
  return {
    maintenance_mode: config.maintenanceMode,
    android: {
      version: config.androidVersion,
      compulsory_update: config.androidCompulsoryUpdate,
    },
    ios: {
      version: config.iosVersion,
      compulsory_update: config.iosCompulsoryUpdate,
    },
    updated_at: config.updatedAt.toISOString(),
  };
}
