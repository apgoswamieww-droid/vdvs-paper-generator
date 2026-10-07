import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingIncludes: {
    // Tesseract language data is read with runtime-built paths, so NFT cannot
    // trace it on its own. Ship it inside the OCR function to avoid a CDN
    // download on every request (the cause of FUNCTION_INVOCATION_TIMEOUT).
    "/api/ocr": [
      "./tessdata/**/*",
      // tesseract.js runs OCR on a worker_threads Worker whose entry
      // (src/worker-script/node/index.js) is reached through a runtime-built
      // path.join(__dirname, ...), so NFT never follows it — and neither does
      // it follow that file's own require('..'), which pulls in the actual
      // engine (worker-script/index.js, utils/setImage, constants/defaultOutput).
      // Locally those resolve from the full node_modules; on Vercel only traced
      // files ship, so the worker thread throws MODULE_NOT_FOUND before it ever
      // answers, createWorker() never settles, and the request hangs until the
      // deadline. Ship the whole src tree plus its runtime deps.
      "./node_modules/tesseract.js/src/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/regenerator-runtime/**/*",
    ],
  },
};

export default nextConfig;
