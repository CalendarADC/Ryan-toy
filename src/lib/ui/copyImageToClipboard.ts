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

  if (url.startsWith("/api/local-media/")) {
    const res = await fetch(url, { method: "GET", credentials: "same-origin" });
    if (!res.ok) throw new Error(`fetch failed (${res.status})`);
    return res.blob();
  }

  const isHttp = /^https?:\/\//i.test(url);
  const fetchUrl = isHttp ? `/api/download-image?url=${encodeURIComponent(url)}` : url;
  const res = await fetch(fetchUrl, { method: "GET", credentials: "same-origin" });
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  return res.blob();
}

/** 复制展示图到系统剪贴板（网页用 Clipboard API，桌面版走 Electron 原生剪贴板）。 */
export async function copyImageToClipboard(url: string): Promise<boolean> {
  try {
    const blob = await fetchImageBlob(url);

    if (typeof window !== "undefined" && window.desktopBridge?.copyImagePngBase64) {
      const buf = await blob.arrayBuffer();
      return await window.desktopBridge.copyImagePngBase64(arrayBufferToBase64(buf));
    }

    if (!navigator.clipboard?.write || typeof window.ClipboardItem === "undefined") {
      return false;
    }

    const type = blob.type?.startsWith("image/") ? blob.type : "image/png";
    await navigator.clipboard.write([
      new window.ClipboardItem({
        [type]: blob,
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function copyImageToClipboardErrorMessage(): string {
  if (typeof window !== "undefined" && window.desktopBridge?.isDesktop) {
    return "复制失败，请重试。";
  }
  return "复制失败：请在 HTTPS 或 localhost 环境使用支持图片剪贴板的浏览器（如 Chrome/Edge）。";
}
