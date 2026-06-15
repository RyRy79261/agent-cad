import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the workspace packages from source (no pre-build step needed in dev).
  transpilePackages: ["@agent-cad/ui", "@agent-cad/viewer", "@agent-cad/types"],
  // Pin the monorepo root for Turbopack (Next 16's default bundler). Without this it
  // walks up the tree and latches onto a stray ~/package-lock.json as the root.
  turbopack: {
    root: join(__dirname, "..", ".."),
  },
};

export default nextConfig;
