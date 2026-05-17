"use client";

import { isWebStrictLocalClientMode } from "@/lib/runtime/desktopLocalMode";

export default function WebLocalStorageBanner() {
  if (typeof window === "undefined" || !isWebStrictLocalClientMode()) return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-slate-300/80 bg-slate-50 px-4 py-3 text-sm text-slate-800"
    >
      <p className="leading-relaxed">
        网页单机模式：任务、草稿与生图记录保存在本浏览器（IndexedDB），图片不上传 Cloudflare R2 或
        Supabase。请自备 API Key；换电脑或清空站点数据会丢失本地记录。
      </p>
    </div>
  );
}
