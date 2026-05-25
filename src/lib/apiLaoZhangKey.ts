const LAOZHANG_KEY_HEADER = "x-laozhang-api-key";
const KIE_KEY_HEADER = "x-kie-api-key";
const IMAGE_VENDOR_HEADER = "x-image-api-vendor";

export type ImageApiVendor = "laozhang" | "kie";

function normalizeImageApiVendor(v: unknown): ImageApiVendor {
  return typeof v === "string" && v.trim().toLowerCase() === "kie" ? "kie" : "laozhang";
}

export function resolveRequestLaoZhangApiKey(req: Request): string {
  const key = req.headers.get(LAOZHANG_KEY_HEADER)?.trim() ?? "";
  return key;
}

export function resolveRequestKieApiKey(req: Request): string {
  const key = req.headers.get(KIE_KEY_HEADER)?.trim() ?? "";
  return key;
}

export function resolveImageApiVendorFromRequest(req: Request, bodyValue: unknown): ImageApiVendor {
  const bodyVendor = normalizeImageApiVendor(bodyValue);
  if (bodyVendor === "kie") return "kie";
  return normalizeImageApiVendor(req.headers.get(IMAGE_VENDOR_HEADER));
}

/**
 * 优先从 JSON body 取密钥（桌面内嵌 Next 时自定义头偶发不可达），再读请求头。
 */
export function resolveLaoZhangApiKeyFromRequest(req: Request, bodyValue: unknown): string | undefined {
  if (typeof bodyValue === "string" && bodyValue.trim()) return bodyValue.trim();
  const h = resolveRequestLaoZhangApiKey(req);
  return h.trim() || undefined;
}

export function requireRequestLaoZhangApiKey(req: Request): string {
  const key = resolveRequestLaoZhangApiKey(req);
  if (!key) {
    throw new Error("缺少老张 API Key：请先在 Step1 顶部填写 API 密钥。");
  }
  return key;
}

/**
 * 优先从 JSON body 取密钥（桌面内嵌 Next 时自定义头偶发不可达），再读请求头。
 */
export function resolveKieApiKeyFromRequest(req: Request, bodyValue: unknown): string | undefined {
  if (typeof bodyValue === "string" && bodyValue.trim()) return bodyValue.trim();
  const h = resolveRequestKieApiKey(req);
  return h.trim() || undefined;
}

