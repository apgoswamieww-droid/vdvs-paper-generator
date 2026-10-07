import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@prisma/client";

const { prismaMock, requireSuperAdminMock, revalidateMock } = vi.hoisted(
  () => ({
    prismaMock: {
      appConfig: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
    },
    requireSuperAdminMock: vi.fn(),
    revalidateMock: vi.fn(),
  })
);

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/session", () => ({ requireSuperAdmin: requireSuperAdminMock }));
vi.mock("next/cache", () => ({
  revalidatePath: revalidateMock,
  revalidateTag: vi.fn(),
}));

import {
  getAppConfig,
  updateAppConfig,
} from "@/app/(dashboard)/dashboard/super-admin/app-config/actions";

const NOW = new Date("2026-10-07T10:00:00.000Z");

function row(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    id: "app_config",
    androidVersion: "1.2.0",
    androidCompulsoryUpdate: false,
    iosVersion: "1.1.0",
    iosCompulsoryUpdate: true,
    maintenanceMode: false,
    updatedAt: NOW,
    ...overrides,
  };
}

const VALID_INPUT = {
  androidVersion: "2.0.0",
  androidCompulsoryUpdate: true,
  iosVersion: "2.1.0",
  iosCompulsoryUpdate: false,
  maintenanceMode: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdminMock.mockResolvedValue({ id: "sa-1", role: "SUPER_ADMIN" });
});

describe("getAppConfig", () => {
  it("rejects callers who are not super admins", async () => {
    requireSuperAdminMock.mockRejectedValue(new Error("Forbidden"));
    const result = await getAppConfig();
    expect(result).toEqual({
      success: false,
      error: "Forbidden: super admin access only.",
    });
    expect(prismaMock.appConfig.findUnique).not.toHaveBeenCalled();
  });

  it("returns the singleton as a serialisable view", async () => {
    prismaMock.appConfig.findUnique.mockResolvedValue(row());
    const result = await getAppConfig();
    expect(result.success).toBe(true);
    expect(result.config).toEqual({
      androidVersion: "1.2.0",
      androidCompulsoryUpdate: false,
      iosVersion: "1.1.0",
      iosCompulsoryUpdate: true,
      maintenanceMode: false,
      updatedAt: NOW.toISOString(),
    });
  });

  it("surfaces a load failure", async () => {
    prismaMock.appConfig.findUnique.mockRejectedValue(new Error("db down"));
    const result = await getAppConfig();
    expect(result).toEqual({
      success: false,
      error: "Could not load the app configuration.",
    });
  });
});

describe("updateAppConfig", () => {
  it("rejects callers who are not super admins", async () => {
    requireSuperAdminMock.mockRejectedValue(new Error("Forbidden"));
    const result = await updateAppConfig(VALID_INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Forbidden: super admin access only.");
    expect(prismaMock.appConfig.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-semver version", async () => {
    const result = await updateAppConfig({
      ...VALID_INPUT,
      androidVersion: "latest",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Use semantic versioning, e.g. 1.2.3.");
    expect(prismaMock.appConfig.upsert).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("upserts the singleton and revalidates the panel", async () => {
    prismaMock.appConfig.upsert.mockResolvedValue(row(VALID_INPUT));
    const result = await updateAppConfig(VALID_INPUT);
    expect(result.success).toBe(true);
    expect(result.config?.androidVersion).toBe("2.0.0");
    expect(prismaMock.appConfig.upsert).toHaveBeenCalledWith({
      where: { id: "app_config" },
      create: { id: "app_config", ...VALID_INPUT },
      update: VALID_INPUT,
    });
    expect(revalidateMock).toHaveBeenCalledWith(
      "/dashboard/super-admin/app-config"
    );
  });

  it("surfaces a database failure", async () => {
    prismaMock.appConfig.upsert.mockRejectedValue(new Error("db down"));
    const result = await updateAppConfig(VALID_INPUT);
    expect(result).toEqual({
      success: false,
      error: "Could not update the app configuration.",
    });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
