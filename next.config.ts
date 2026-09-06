import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // supabase/config.toml's site_url/redirect URLs are all 127.0.0.1 (not
  // localhost), so Supabase email links land there — this just lets the dev
  // server's HMR client talk back to itself on that origin too. Dev-only;
  // has no effect on a production build.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
