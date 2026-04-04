// frontend/next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Suppress leaflet SSR issues
  transpilePackages: ["react-leaflet", "react-leaflet-cluster"],
};

export default nextConfig;
