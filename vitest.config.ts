import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit-test config — pure Node tests (no React rendering yet).
// `@/` mirrors the tsconfig path alias so tests import app modules
// exactly like production code does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
