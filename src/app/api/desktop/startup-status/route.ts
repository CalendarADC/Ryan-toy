import { NextResponse } from "next/server";

import { collectDesktopStartupStatus } from "@/lib/desktop/desktopStartupChecks";

export const dynamic = "force-dynamic";

/** 供桌面安装包启动窗拉取；仅反映本机环境与内置服务状态。 */
export async function GET() {
  try {
    const status = await collectDesktopStartupStatus();
    return NextResponse.json(status);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[desktop/startup-status]", e);
    return NextResponse.json(
      {
        ok: false,
        dbMode: "off" as const,
        checks: {
          server: "error" as const,
          database: "skipped" as const,
          mediaDir: "skipped" as const,
          r2Bypass: "skipped" as const,
          step1ExpandApiKey: "skipped" as const,
          step1ExpandVisionModel: "skipped" as const,
        },
        paths: { mediaDir: null },
        detail,
      },
      { status: 200 },
    );
  }
}
