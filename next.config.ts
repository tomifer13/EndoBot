import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["duckdb", "adm-zip"],
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
    };
    if (isServer) {
      config.externals = config.externals ?? [];
      config.externals.push({ duckdb: "commonjs duckdb" });
    }
    return config;
  },
};

export default nextConfig;
