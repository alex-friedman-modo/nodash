import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Fix workspace root detection when deployed
  outputFileTracingRoot: undefined,
};

export default nextConfig;
