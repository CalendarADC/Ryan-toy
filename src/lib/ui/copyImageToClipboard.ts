export type CopyImageOutcome =
  | { ok: true; via: "clipboard" }
  | { ok: true; via: "download"; reason: "insecure" | "clipboard_unavailable" }
  | { ok: false; message: string };

/** 剪贴板写入前缩小边长，避免 Step3 大图（4K data URL）超限 */
const MAX_CLIPBOARD_SIDE_PX = 2048;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

async function fetchImageBlob(url: string): Promise<Blob> {
  if (!url) throw new Error("empty image url");

  if (url.startsWith("data:") || url.startsWith("blob:")) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed (${res.status})`);
    return res.blob();
  }

  if (url.startsWith("/")) {
    const res = await fetch(url, { method: "GET", credentials: "include" });
    if (!res.ok) throw new Error(`fetch failed (${res.status})`);
    return res.blob();
  }

  const isHttp = /^https?:\/\//i.test(url);
  const fetchUrl = isHttp ? `/api/download-image?url=${encodeURIComponent(url)}` : url;
  const res = await fetch(fetchUrl, { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  return res.blob();
}

function scaledCanvasSize(width: number, height: number): { width: number; height: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const maxSide = Math.max(w, h);
  if (maxSide <= MAX_CLIPBOARD_SIDE_PX) return { width: w, height: h };
  const scale = MAX_CLIPBOARD_SIDE_PX / maxSide;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
}

async function decodeDataUrlToPngBlob(url: string): Promise<Blob> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = url;
  });
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const { width, height } = scaledCanvasSize(srcW, srcH);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(img, 0, 0, width, height);
  return canvasToPngBlob(canvas);
}

async function blobToPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png" && blob.size > 0) {
    if (typeof createImageBitmap !== "function") return blob;
    const probe = await createImageBitmap(blob);
    const { width, height } = scaledCanvasSize(probe.width, probe.height);
    probe.close();
    if (width === probe.width && height === probe.height) return blob;
  }

  if (typeof createImageBitmap !== "function") {
    return blob.type?.startsWith("image/") ? blob : new Blob([blob], { type: "image/png" });
  }

  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = scaledCanvasSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvasToPngBlob(canvas);
  } finally {
    bitmap.close();
  }
}

async function urlToPngBlobForClipboard(url: string): Promise<Blob> {
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    try {
      return await decodeDataUrlToPngBlob(url);
    } catch {
      const blob = await fetchImageBlob(url);
      return blobToPngBlob(blob);
    }
  }
  return blobToPngBlob(await fetchImageBlob(url));
}

function canWriteImageClipboard(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator.clipboard?.write === "function" &&
    typeof ClipboardItem !== "undefined"
  );
}

async function writePngToClipboard(pngBlob: Blob): Promise<void> {
  const ab = await pngBlob.arrayBuffer();
  const typed = new Blob([ab], { type: "image/png" });
  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": typed,
    }),
  ]);
}

function downloadPngBlob(pngBlob: Blob, filename = "gemmuse-image.png"): void {
  const objectUrl = URL.createObjectURL(pngBlob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

/** 复制展示图到系统剪贴板；失败时尝试触发下载作为兜底。 */
export async function copyImageToClipboard(url: string): Promise<CopyImageOutcome> {
  try {
    const pngBlob = await urlToPngBlobForClipboard(url);

    if (typeof window !== "undefined" && window.desktopBridge?.copyImagePngBase64) {
      const buf = await pngBlob.arrayBuffer();
      const ok = await window.desktopBridge.copyImagePngBase64(arrayBufferToBase64(buf));
      return ok ? { ok: true, via: "clipboard" } : { ok: false, message: "复制失败，请重试。" };
    }

    if (canWriteImageClipboard()) {
      try {
        await writePngToClipboard(pngBlob);
        return { ok: true, via: "clipboard" };
      } catch {
        /* 仍可能因图片过大或浏览器策略失败，走下载兜底 */
      }
    }

    downloadPngBlob(pngBlob);
    return {
      ok: true,
      via: "download",
      reason: window.isSecureContext ? "clipboard_unavailable" : "insecure",
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    if (detail.includes("fetch failed")) {
      return { ok: false, message: "无法读取图片，请刷新页面后重试。" };
    }
    if (/decode|canvas|toBlob|createImageBitmap/i.test(detail)) {
      return { ok: false, message: "图片过大或格式异常，请尝试下载图片。" };
    }
    return { ok: false, message: `复制失败：${detail}` };
  }
}

export function toastForCopyImageOutcome(outcome: CopyImageOutcome): {
  message: string;
  type: "success" | "error";
} {
  if (outcome.ok && outcome.via === "clipboard") {
    return { message: "已复制图片到剪贴板", type: "success" };
  }
  if (outcome.ok && outcome.via === "download") {
    return {
      message:
        outcome.reason === "insecure"
          ? "当前为 HTTP 环境，已改为下载图片（复制到剪贴板需 HTTPS）"
          : "图片较大，剪贴板写入失败，已改为下载图片",
      type: "success",
    };
  }
  return { message: outcome.message, type: "error" };
}

/** @deprecated 使用 toastForCopyImageOutcome */
export function copyImageToClipboardErrorMessage(): string {
  return "复制失败，请重试或改用下载。";
}
