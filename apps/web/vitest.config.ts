import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // Next's build output isn't part of the unit-test graph.
    exclude: ["node_modules", ".next", "dist"],
  },
});
