/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["firebase-admin"],

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: false,
  },

  // Cache server component fetches to reduce Firestore reads
  // Pages re-validate every 60 seconds instead of on every request
  experimental: {
    staleTimes: {
      dynamic: 60,   // cache dynamic pages for 60s
      static: 300,   // cache static pages for 5 mins
    },
  },
};

export default nextConfig;
