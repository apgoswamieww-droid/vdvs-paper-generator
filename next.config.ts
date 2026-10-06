import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingIncludes: {
    // Tesseract language data is read with runtime-built paths, so NFT cannot
    // trace it on its own. Ship it inside the OCR function to avoid a CDN
    // download on every request (the cause of FUNCTION_INVOCATION_TIMEOUT).
    "/api/ocr": ["./tessdata/**/*"],
  },
};

export default nextConfig;
