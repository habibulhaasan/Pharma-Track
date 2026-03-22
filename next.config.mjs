// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server Actions are stable in Next.js 15 — no experimental flag needed
  
  // Ensure firebase-admin stays Node.js only (never bundled for edge)
  serverExternalPackages: ["firebase-admin"],

  eslint: {
    ignoreDuringBuilds: false,
  },

  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
