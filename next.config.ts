import type { NextConfig } from "next";

const standalone = process.env.NEXT_OUTPUT_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(standalone ? { output: "standalone" } : {}),
  /** Next 图片管线会加载 sharp；standalone 默认追踪不到 @img 下的原生 .node，桌面版会启动即崩。 */
  ...(standalone
    ? {
        env: {
          GEMMUSE_DESKTOP_STANDALONE: "1",
        },
        outputFileTracingIncludes: {
          "/*": [
            "./node_modules/sharp/**/*",
            "./node_modules/@img/**/*",
            "./node_modules/@aws-sdk/**/*",
            "./node_modules/@smithy/**/*",
            "./node_modules/@aws-crypto/**/*",
          ],
        },
        /** 项目根下的历史安装包目录不应进入 standalone，否则每发一版会嵌套上一份 release-dist。 */
        outputFileTracingExcludes: {
          "/*": [
            "./release-dist/**",
            "./release-dist-*/**",
            "./release-win-unpacked/**",
          ],
        },
        /**
         * Electron asar 内不可写：禁用优化与磁盘图片缓存，避免 ENOTDIR。
         * middleware 对 /_next/image 直接重定向到原图，避免触碰 ImageOptimizerCache。
         */
        images: { unoptimized: true, maximumDiskCacheSize: 0 },
        experimental: { isrFlushToDisk: false },
      }
    : {}),
};

export default nextConfig;