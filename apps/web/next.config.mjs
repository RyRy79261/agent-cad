/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the workspace packages from source (no pre-build step needed in dev).
  transpilePackages: ["@agent-cad/ui", "@agent-cad/viewer", "@agent-cad/types"],
};

export default nextConfig;
