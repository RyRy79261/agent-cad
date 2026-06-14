import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Match the tsconfig "@/*" -> "./*" alias the shadcn components use.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    // Next's build output isn't part of the unit-test graph.
    exclude: ["node_modules", ".next", "dist"],
  },
});
