/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const staticExport = process.env.SH_INFO_PRICE_STATIC_EXPORT === "1";

const nextConfig = {
  reactStrictMode: true,
  ...(basePath
    ? {
        assetPrefix: basePath,
        basePath
      }
    : {}),
  ...(staticExport
    ? {
        output: "export",
        trailingSlash: true
      }
    : {})
};

export default nextConfig;
