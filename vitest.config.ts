import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@contextgate/core": path.resolve(__dirname, "./packages/core/src"),
      "@contextgate/connectors": path.resolve(__dirname, "./packages/connectors/src"),
    },
  },
});
