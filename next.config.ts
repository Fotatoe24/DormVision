import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Avatar uploads go through Supabase Storage (lib/actions.ts /
    // app/api/profile/route.ts), which serves them from a
    // <project-ref>.supabase.co URL — allow-listed here so next/image
    // can fetch and optimize them instead of the app rendering a raw
    // <img> with no resizing.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
