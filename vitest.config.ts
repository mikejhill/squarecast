import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      include: ["src/lib/**/*.ts", "src/controllers/**/*.ts"],
      exclude: ["src/lib/**/*.d.ts"],
      thresholds: {
        perFile: true,
        branches: 80,
        functions: 100,
        lines: 90,
        statements: 90,
      },
    },
  },
});
