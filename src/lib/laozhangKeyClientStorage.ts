"use client";

import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";

const GLOBAL_KEY_V2 = "jewelry-laozhang-api-key-v2";
const GLOBAL_KIE_KEY_V1 = "jewelry-kie-api-key-v1";
const GLOBAL_IMAGE_API_VENDOR_V1 = "jewelry-image-api-vendor-v1";
const LEGACY_KEY_PREFIX = "jewelry-laozhang-api-key-v1-";
const USER_SCOPE_LS_KEY = "jewelry-generator-user-scope-v1";
/** 与任务工作区无关的全局密钥键（IndexedDB），防止 localStorage 被禁/抛错时「保存了却读不到」。 */
const IDB_LAOZHANG_GLOBAL = "jewelry-gemmuse-laozhang-global-v1";
const IDB_KIE_GLOBAL = "jewelry-gemmuse-kie-global-v1";
const IDB_IMAGE_VENDOR_GLOBAL = "jewelry-gemmuse-image-vendor-global-v1";

/**
 * 与 localStorage 同步的进程内镜像。LS 失败或 hydration 竞态清空 LS 时，同一会话仍能读到密钥并用于请求头。
 * 刷新后由 IndexedDB + hydrateLaozhangApiKeyFromIndexedDb 恢复。
 */
let sessionRamLaozhangKey = "";
let sessionRamKieKey = "";
let sessionRamImageApiVendor: "laozhang" | "kie" = "laozhang";

/** 同页不会触发 storage 事件；用订阅器让 React useSyncExternalStore 在写入后立即刷新。 */
const laozhangKeyListeners = new Set<() => void>();

function notifyLaozhangApiKeyClientListeners(): void {
  laozhangKeyListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

let crossTabListenerAttached = false;

function ensureCrossTabLaozhangApiKeyListener(): void {
  if (typeof window === "undefined" || crossTabListenerAttached) return;
  crossTabListenerAttached = true;
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key == null) {
      notifyLaozhangApiKeyClientListeners();
      return;
    }
    if (
      e.key === GLOBAL_KEY_V2 ||
      e.key === GLOBAL_KIE_KEY_V1 ||
      e.key === GLOBAL_IMAGE_API_VENDOR_V1 ||
      e.key.startsWith(LEGACY_KEY_PREFIX) ||
      e.key === USER_SCOPE_LS_KEY
    ) {
      notifyLaozhangApiKeyClientListeners();
    }
  });
}

/** 供 `useSyncExternalStore`：与 localStorage + 内存镜像同步。 */
export function subscribeClientLaozhangApiKey(onStore: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  ensureCrossTabLaozhangApiKeyListener();
  laozhangKeyListeners.add(onStore);
  return () => {
    laozhangKeyListeners.delete(onStore);
  };
}

function getLegacyScopedKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const scope = (localStorage.getItem(USER_SCOPE_LS_KEY) ?? "").trim();
    if (!scope) return null;
    return `${LEGACY_KEY_PREFIX}${scope}`;
  } catch {
    return null;
  }
}

/**
 * 启动时调用：若 LS 无密钥但 IndexedDB 有，则灌回 LS（尽力）与内存镜像，并通知 UI。
 * 应在任务工作区 hydration 之前 await。
 */
export async function hydrateLaozhangApiKeyFromIndexedDb(): Promise<void> {
  if (typeof window === "undefined") return;
  let ls = "";
  try {
    ls = (localStorage.getItem(GLOBAL_KEY_V2) ?? "").trim();
  } catch {
    ls = "";
  }
  if (ls) {
    sessionRamLaozhangKey = ls;
    return;
  }
  if (sessionRamLaozhangKey.trim()) return;

  try {
    const v = await idbGet<string | undefined>(IDB_LAOZHANG_GLOBAL);
    const t = (typeof v === "string" ? v : "").trim();
    if (!t) return;
    sessionRamLaozhangKey = t;
    try {
      localStorage.setItem(GLOBAL_KEY_V2, t);
    } catch {
      /* 仅依赖 RAM + IDB */
    }
    const legacyKey = getLegacyScopedKey();
    if (legacyKey) {
      try {
        localStorage.setItem(legacyKey, t);
      } catch {
        /* ignore */
      }
    }
    notifyLaozhangApiKeyClientListeners();
  } catch {
    /* ignore */
  }
}

export async function hydrateKieApiKeyFromIndexedDb(): Promise<void> {
  if (typeof window === "undefined") return;
  let ls = "";
  try {
    ls = (localStorage.getItem(GLOBAL_KIE_KEY_V1) ?? "").trim();
  } catch {
    ls = "";
  }
  if (ls) {
    sessionRamKieKey = ls;
    return;
  }
  if (sessionRamKieKey.trim()) return;

  try {
    const v = await idbGet<string | undefined>(IDB_KIE_GLOBAL);
    const t = (typeof v === "string" ? v : "").trim();
    if (!t) return;
    sessionRamKieKey = t;
    try {
      localStorage.setItem(GLOBAL_KIE_KEY_V1, t);
    } catch {
      /* 仅依赖 RAM + IDB */
    }
    notifyLaozhangApiKeyClientListeners();
  } catch {
    /* ignore */
  }
}

export async function hydrateImageApiVendorFromIndexedDb(): Promise<void> {
  if (typeof window === "undefined") return;
  let ls = "";
  try {
    ls = (localStorage.getItem(GLOBAL_IMAGE_API_VENDOR_V1) ?? "").trim().toLowerCase();
  } catch {
    ls = "";
  }
  if (ls === "kie" || ls === "laozhang") {
    sessionRamImageApiVendor = ls;
    return;
  }
  if (sessionRamImageApiVendor) return;

  try {
    const v = await idbGet<string | undefined>(IDB_IMAGE_VENDOR_GLOBAL);
    const t = (typeof v === "string" ? v : "").trim().toLowerCase();
    if (t !== "kie" && t !== "laozhang") return;
    sessionRamImageApiVendor = t;
    try {
      localStorage.setItem(GLOBAL_IMAGE_API_VENDOR_V1, t);
    } catch {
      /* 仅依赖 RAM + IDB */
    }
    notifyLaozhangApiKeyClientListeners();
  } catch {
    /* ignore */
  }
}

export async function hydrateImageApiKeysFromIndexedDb(): Promise<void> {
  await Promise.all([
    hydrateLaozhangApiKeyFromIndexedDb(),
    hydrateKieApiKeyFromIndexedDb(),
    hydrateImageApiVendorFromIndexedDb(),
  ]);
}

export function readClientLaozhangApiKey(): string {
  if (typeof window === "undefined") return sessionRamLaozhangKey.trim();
  try {
    const v2 = (localStorage.getItem(GLOBAL_KEY_V2) ?? "").trim();
    if (v2) {
      sessionRamLaozhangKey = v2;
      return v2;
    }
  } catch {
    /* localStorage 不可用：回落到内存镜像 */
  }
  const ram = sessionRamLaozhangKey.trim();
  if (ram) return ram;

  try {
    const legacyKey = getLegacyScopedKey();
    if (!legacyKey) return "";
    const legacy = (localStorage.getItem(legacyKey) ?? "").trim();
    if (legacy) {
      sessionRamLaozhangKey = legacy;
      try {
        localStorage.setItem(GLOBAL_KEY_V2, legacy);
      } catch {
        /* ignore */
      }
      notifyLaozhangApiKeyClientListeners();
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return sessionRamLaozhangKey.trim();
}

/** 供 `useSyncExternalStore` 的快照函数。 */
export function getClientLaozhangApiKeySnapshot(): string {
  return readClientLaozhangApiKey();
}

export function writeClientLaozhangApiKey(value: string): void {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  sessionRamLaozhangKey = trimmed;

  try {
    if (!trimmed) {
      localStorage.removeItem(GLOBAL_KEY_V2);
    } else {
      localStorage.setItem(GLOBAL_KEY_V2, trimmed);
    }
    const legacyKey = getLegacyScopedKey();
    if (legacyKey) {
      if (!trimmed) localStorage.removeItem(legacyKey);
      else localStorage.setItem(legacyKey, trimmed);
    }
  } catch (e) {
    console.warn("[GemMuse] 无法写入本机 LaoZhang 密钥备份（localStorage 可能被禁用或配额已满）：", e);
  }

  notifyLaozhangApiKeyClientListeners();

  void (trimmed
    ? idbSet(IDB_LAOZHANG_GLOBAL, trimmed)
    : idbDel(IDB_LAOZHANG_GLOBAL)
  ).then(
    () => {
      notifyLaozhangApiKeyClientListeners();
    },
    () => undefined
  );
}

export function readClientKieApiKey(): string {
  if (typeof window === "undefined") return sessionRamKieKey.trim();
  try {
    const v = (localStorage.getItem(GLOBAL_KIE_KEY_V1) ?? "").trim();
    if (v) {
      sessionRamKieKey = v;
      return v;
    }
  } catch {
    /* localStorage 不可用：回落到内存镜像 */
  }
  return sessionRamKieKey.trim();
}

export function getClientKieApiKeySnapshot(): string {
  return readClientKieApiKey();
}

export function writeClientKieApiKey(value: string): void {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  sessionRamKieKey = trimmed;

  try {
    if (!trimmed) {
      localStorage.removeItem(GLOBAL_KIE_KEY_V1);
    } else {
      localStorage.setItem(GLOBAL_KIE_KEY_V1, trimmed);
    }
  } catch (e) {
    console.warn("[GemMuse] 无法写入本机 Kie 密钥备份（localStorage 可能被禁用或配额已满）：", e);
  }

  notifyLaozhangApiKeyClientListeners();
  void (trimmed ? idbSet(IDB_KIE_GLOBAL, trimmed) : idbDel(IDB_KIE_GLOBAL)).then(
    () => {
      notifyLaozhangApiKeyClientListeners();
    },
    () => undefined
  );
}

export function readClientImageApiVendor(): "laozhang" | "kie" {
  if (typeof window === "undefined") return sessionRamImageApiVendor;
  try {
    const raw = (localStorage.getItem(GLOBAL_IMAGE_API_VENDOR_V1) ?? "").trim().toLowerCase();
    if (raw === "kie" || raw === "laozhang") {
      sessionRamImageApiVendor = raw;
      return raw;
    }
  } catch {
    /* ignore */
  }
  return sessionRamImageApiVendor;
}

export function getClientImageApiVendorSnapshot(): "laozhang" | "kie" {
  return readClientImageApiVendor();
}

export function writeClientImageApiVendor(value: "laozhang" | "kie"): void {
  if (typeof window === "undefined") return;
  const next = value === "kie" ? "kie" : "laozhang";
  sessionRamImageApiVendor = next;
  try {
    localStorage.setItem(GLOBAL_IMAGE_API_VENDOR_V1, next);
  } catch {
    /* ignore */
  }
  notifyLaozhangApiKeyClientListeners();
  void idbSet(IDB_IMAGE_VENDOR_GLOBAL, next).then(
    () => {
      notifyLaozhangApiKeyClientListeners();
    },
    () => undefined
  );
}
