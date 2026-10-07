"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/session";
import {
  APP_CONFIG_ID,
  readAppConfig,
  toConfigView,
  type AppConfigView,
} from "@/lib/app-config";

export type AppConfigResult = {
  success: boolean;
  error?: string;
  config?: AppConfigView;
};

const versionSchema = z
  .string()
  .trim()
  .regex(/^\d+\.\d+\.\d+$/, "Use semantic versioning, e.g. 1.2.3.");

const appConfigSchema = z.object({
  androidVersion: versionSchema,
  androidCompulsoryUpdate: z.boolean(),
  iosVersion: versionSchema,
  iosCompulsoryUpdate: z.boolean(),
  maintenanceMode: z.boolean(),
});

/** Read the singleton row for the super-admin configuration panel. */
export async function getAppConfig(): Promise<AppConfigResult> {
  try {
    await requireSuperAdmin();
  } catch {
    return { success: false, error: "Forbidden: super admin access only." };
  }
  try {
    return { success: true, config: toConfigView(await readAppConfig()) };
  } catch {
    return { success: false, error: "Could not load the app configuration." };
  }
}

/** Persist version gates + maintenance mode (super-admins only). */
export async function updateAppConfig(input: unknown): Promise<AppConfigResult> {
  try {
    await requireSuperAdmin();
  } catch {
    return { success: false, error: "Forbidden: super admin access only." };
  }

  const parsed = appConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const updated = await prisma.appConfig.upsert({
      where: { id: APP_CONFIG_ID },
      create: { id: APP_CONFIG_ID, ...parsed.data },
      update: parsed.data,
    });
    revalidatePath("/dashboard/super-admin/app-config");
    return { success: true, config: toConfigView(updated) };
  } catch {
    return { success: false, error: "Could not update the app configuration." };
  }
}
