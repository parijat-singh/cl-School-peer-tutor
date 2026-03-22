import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/shared/**"],
      exclude: [
        "src/shared/email.ts",       // SMTP integration — no unit test value
        "src/shared/google-meet.ts",  // Google API integration
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
});
