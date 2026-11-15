import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/Inglorious", destination: "https://inglorious-git-inglorious-basepath-preview-cristoferrsg-9877.vercel.app/Inglorious" },
      { source: "/Inglorious/:path*", destination: "https://inglorious-git-inglorious-basepath-preview-cristoferrsg-9877.vercel.app/Inglorious/:path*" },
    ];
  },
};

export default nextConfig;
