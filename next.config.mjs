/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output is what the Dockerfile copies: a self-contained server.js
  // plus only the node_modules it actually needs.
  output: "standalone",
};

export default nextConfig;
