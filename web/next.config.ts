import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/Inglorious", destination: "https://inglorious-six.vercel.app/Inglorious" },
      { source: "/Inglorious/:path*", destination: "https://inglorious-six.vercel.app/Inglorious/:path*" },
    ];
  },
};

export default nextConfig;
