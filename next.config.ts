import type { NextConfig } from "next";

const standalone = process.env.NEXT_OUTPUT_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(standalone ? { output: "standalone" } : {}),
  /** Next 图片管线会加载 sharp；standalone 默认追踪不到 @img 下的原生 .node，桌面版会启动即崩。 */
  ...(standalone
    ? {
        outputFileTracingIncludes: {
          "/*": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
        },
        /**
         * Electron asar 内不可写：禁用优化与磁盘图片缓存，避免 ENOTDIR。
         * 仍有请求命中 /_next/image 时，ImageOptimizerCache 构造也会 mkdir(cacheDir)。
         */
        images: { unoptimized: true, maximumDiskCacheSize: 0 },
        experimental: { isrFlushToDisk: false },
      }
    : {}),
};

export default nextConfig;