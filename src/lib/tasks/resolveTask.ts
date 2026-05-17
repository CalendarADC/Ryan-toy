import { prisma } from "@/lib/db";
import {
  isDesktopBundledClientRequest,
  isDesktopLocalServerMode,
  isWebLocalClientRequest,
} from "@/lib/runtime/desktopLocalMode";

/** 网页/桌面 strict-local：任务仅存本机，服务端信任客户端传来的 taskId */
export function shouldTrustClientTaskId(req: Request): boolean {
  return (
    isDesktopBundledClientRequest(req) ||
    isWebLocalClientRequest(req) ||
    isDesktopLocalServerMode(req)
  );
}

export async function ensureOwnedTaskId(
  userId: string,
  taskId: string,
  opts?: { upsertForDesktop?: boolean; trustClientTaskId?: boolean },
): Promise<string | null> {
  const id = taskId.trim();
  if (!id) return null;

  if (opts?.trustClientTaskId) {
    return id;
  }

  let task: { id: string } | null = null;
  try {
    task = await prisma.task.findFirst({
      where: { id, userId },
      select: { id: true },
    });
  } catch {
    if (opts?.upsertForDesktop) return id;
    return null;
  }
  if (task) return task.id;
  if (!opts?.upsertForDesktop) return null;
  try {
    await prisma.task.create({
      data: {
        id,
        userId,
        name: "桌面任务",
        searchLine: "",
        sortOrder: 0,
        currentStep: "STEP1",
        isProtected: false,
      },
    });
    return id;
  } catch {
    try {
      const again = await prisma.task.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      return again?.id ?? null;
    } catch {
      return id;
    }
  }
}
