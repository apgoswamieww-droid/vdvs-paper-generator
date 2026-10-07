import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@prisma/client";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    appConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import { GET } from "@/app/api/app/init/route";

const NOW = new Date("2026-10-07T10:00:00.000Z");

function row(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    id: "app_config",
    androidVersion: "1.2.0",
    androidCompulsoryUpdate: true,
    iosVersion: "1.1.0",
    iosCompulsoryUpdate: false,
    maintenanceMode: true,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/app/init", () => {
  it("returns the public payload for the mobile boot check", async () => {
    prismaMock.appConfig.findUnique.mockResolvedValue(row());
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      maintenance_mode: true,
      android: { version: "1.2.0", compulsory_update: true },
      ios: { version: "1.1.0", compulsory_update: false },
      updated_at: NOW.toISOString(),
    });
  });

  it("bootstraps the singleton on first read", async () => {
    prismaMock.appConfig.findUnique.mockResolvedValue(null);
    prismaMock.appConfig.create.mockResolvedValue(row());
    const res = await GET();
    expect(res.status).toBe(200);
    expect(prismaMock.appConfig.create).toHaveBeenCalledWith({
      data: { id: "app_config" },
    });
  });

  it("answers 500 when the config cannot be read", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.appConfig.findUnique.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Could not load app configuration.",
    });
    errSpy.mockRestore();
  });
});
