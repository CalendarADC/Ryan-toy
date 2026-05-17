import type { ApiAuthSource } from "@/lib/apiAuth";
import { getDesktopDbMode } from "@/lib/desktop/desktopDbMode";
import { shouldTrustClientTaskId } from "@/lib/tasks/resolveTask";
import { isDesktopBundledClientRequest } from "@/lib/runtime/desktopLocalMode";

export type ImagePersistMode = {
  /** 仅返回 data URL，由浏览器 IndexedDB 保存，不上传 R2、不写数据库 */
  clientOnly: boolean;
  /** 桌面单机：写入本机 GEMMUSE_LOCAL_MEDIA_DIR */
  localDisk: boolean;
};

/**
 * 决定生图结果如何落盘：
 * - 网页 strict-local → clientOnly（用户浏览器存图）
 * - 桌面安装包 → localDisk（用户电脑目录）
 * - 旧版账号 + 云同步 → R2 + Prisma（仅 GEMMUSE_KEY_ONLY_AUTH=0 等场景）
 */
export function resolveImagePersistMode(req: Request, authSource: ApiAuthSource): ImagePersistMode {
  const localDisk =
    isDesktopBundledClientRequest(req) &&
    (authSource === "desktop-ephemeral" ||
      authSource === "desktop-runtime" ||
      getDesktopDbMode() === "off");

  if (localDisk) {
    return { clientOnly: false, localDisk: true };
  }

  if (shouldTrustClientTaskId(req)) {
    return { clientOnly: true, localDisk: false };
  }

  return { clientOnly: false, localDisk: false };
}
