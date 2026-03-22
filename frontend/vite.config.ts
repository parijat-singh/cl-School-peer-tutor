/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    css: false,
    environment: "node",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary"],
      include: ["src/lib/**/*.ts"],
      exclude: [
        "**/*.test.*", "**/*.d.ts", "**/vite-env.d.ts",
        "src/lib/cognito.ts",
        "src/lib/cognito-auth.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@pages": path.resolve(__dirname, "./src/pages"),
      "@hooks": path.resolve(__dirname, "./src/hooks"),
      "@lib": path.resolve(__dirname, "./src/lib"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Code-split by route for performance
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          forms: ["react-hook-form", "zod", "@hookform/resolvers"],
        },
      },
    },
  },
});
