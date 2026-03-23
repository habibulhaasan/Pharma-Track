// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["firebase-admin"],

  eslint: {
    ignoreDuringBuilds: true, // ESLint warnings won't fail Vercel builds
  },

  typescript: {
    ignoreBuildErrors: false, // Keep TS errors blocking (they're real bugs)
  },
};

export default nextConfig;