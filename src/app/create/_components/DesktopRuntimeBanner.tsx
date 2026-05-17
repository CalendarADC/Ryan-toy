"use client";

import { useEffect, useState } from "react";

import { withDesktopLocalHeader } from "@/lib/runtime/desktopLocalMode";

type RuntimeInfo = {
  dbMode: string;
  databaseReachable: boolean | null;
  localMediaConfigured: boolean;
  localImageStorageEnabled: boolean;
};

export default function DesktopRuntimeBanner() {
  const [info, setInfo] = useState<RuntimeInfo | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.desktopBridge?.isDesktop) return undefined;
    const ac = new AbortController();
    void fetch("/api/desktop/runtime-info", {
      headers: new Headers(withDesktopLocalHeader()),
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) setInfo(j as RuntimeInfo);
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  if (!info) return null;

  const mediaWarn = info.localImageStorageEnabled && !info.localMediaConfigured;
  const degradedDb =
    info.dbMode !== "off" && info.databaseReachable === false;
  if (!degradedDb && !mediaWarn) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {degradedDb ? (
        <div
          role="status"
          className="rounded-lg border border-amber-500/35 bg-amber-500/[0.12] px-4 py-3 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-50"
        >
          <p className="leading-relaxed">
            已启用数据库模式（DESKTOP_DB_MODE={info.dbMode}），但当前无法连接数据库，已降级为本地临时会话；生图仍走本机目录或
            data URL。
          </p>
        </div>
      ) : null}
      {mediaWarn ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/35 bg-amber-500/[0.12] px-4 py-3 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-50"
        >
          <p className="leading-relaxed">
            未配置 GEMMUSE_LOCAL_MEDIA_DIR 时，部分大图可能回退为 data URL，占用更多内存。
          </p>
        </div>
      ) : null}
    </div>
  );
}
