import { NextResponse, type NextRequest } from "next/server";
import { isDesktopLocalServerMode } from "@/lib/runtime/desktopLocalMode";

/** 桌面 standalone：绕过 asar 内不可写的 Next 图片优化缓存。 */
function desktopImageBypass(req: NextRequest): NextResponse | null {
  if (process.env.GEMMUSE_DESKTOP_STANDALONE !== "1") return null;
  if (req.nextUrl.pathname !== "/_next/image") return null;
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return new NextResponse("Missing url", { status: 400 });
  try {
    const target = decodeURIComponent(raw);
    if (target.startsWith("/")) {
      return NextResponse.redirect(new URL(target, req.url));
    }
    if (target.startsWith("http://") || target.startsWith("https://")) {
      return NextResponse.redirect(target);
    }
  } catch {
    /* fall through */
  }
  return new NextResponse("Invalid url", { status: 400 });
}

export async function middleware(req: NextRequest) {
  const bypass = desktopImageBypass(req);
  if (bypass) return bypass;
  if (isDesktopLocalServerMode(req)) {
    return NextResponse.next();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/_next/image", "/((?!_next/static|favicon.ico|.*\\..*).*)"],
};