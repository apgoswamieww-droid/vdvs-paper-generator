import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit-test config — Node tests by default; DOM tests opt in with a
// `// @vitest-environment jsdom` docblock (see tests/taxonomy-select.test.tsx).
// `@/` mirrors the tsconfig path alias so tests import app modules
// exactly like production code does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
