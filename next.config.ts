import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (used in app/api/parse-transcript) picks its pdf.js build via a
  // dynamic `require(`./pdf.js/${version}/build/pdf.js`)`. Next.js bundles Route
  // Handler dependencies by default, and that dynamic require doesn't survive
  // bundling — it works in local dev but 404s/throws "module not found" once
  // deployed. Excluding it here makes it use plain Node `require` at runtime.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
