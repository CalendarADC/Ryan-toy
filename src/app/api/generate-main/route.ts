import { NextResponse } from "next/server";

import {
  kieImageFailureUserHint,
  kieImagesToImage,
  kieTextToImage,
  laoZhangImageFailureUserHint,
  laoZhangImagesToImage,
  laoZhangTextToImage,
  resolveLaoZhangImageModelFromBanana,
  type ImageSize,
} from "@/lib/ai/AIService";
import {
  expandStep1PromptWithAi,
  resolveCompanionElementPolicy,
  step1ExpandFailureUserHint,
} from "@/lib/ai/step1PromptAiExpander";
import {
  appendKeywordBoosters,
  buildNanoBananaPromptExpansion,
  buildMainImageCompositionBlock,
  buildMaterialLightingBlock,
  buildPendantPhysicalBlock,
  buildCompactRefEditProductionLimits,
  buildReferenceEditInstructionBlock,
  buildReferenceFusionBlock,
  buildRingPhysicalBlock,
  userPromptIsReferenceEditInstruction,
  buildNanoBananaProStep1SystemPrompt,
  buildStep1BatchMotifDiversityPreamble,
  buildStep1PerImageMotifVariantLine,
  buildDelicateRingMotifScaleIntegrationBlock,
  buildGemCountHardLockBlock,
  buildZirconInlayAiColorMatchBlock,
  buildGlobalNegativePromptBlock,
  buildSingleJewelryPieceOnlyConstraintBlock,
  inferJewelryProductKind,
  buildStrictSceneTonePreservationBlock,
  type PromptExpansionStrength,
  userRequestsStrictScenePreservation,
  userExplicitEnvironmentOrSurfaceInPrompt,
} from "@/lib/ai/jewelrySoftLimits";
import { requireApiActiveUser } from "@/lib/apiAuth";
import {
  resolveImageApiVendorFromRequest,
  resolveKieApiKeyFromRequest,
  resolveLaoZhangApiKeyFromRequest,
} from "@/lib/apiLaoZhangKey";
import { isDesktopBundledClientRequest } from "@/lib/runtime/desktopLocalMode";
import { resolveImagePersistMode } from "@/lib/runtime/imagePersistMode";
import { persistGeneratedImage } from "@/lib/images/persistGeneratedImage";
import { explainObjectStorageDisabled, uploadBinaryToObjectStorage } from "@/lib/storage/objectStorage";
import { buildCappyCalmCharacterLockBlock } from "@/lib/ip/cappyCalm";
import { ensureOwnedTaskId, shouldTrustClientTaskId } from "@/lib/tasks/resolveTask";

export const runtime = "nodejs";

type Body = {
  taskId?: string;
  prompt: string;
  count: number;
  provider: string;
  /** 清晰度：1K（最快）、2K（均衡）、4K（最高清） */
  imageSize?: "1K" | "2K" | "4K";
  /** Step1 ?????standard????| strong???????? */
  expansionStrength?: PromptExpansionStrength;
  /** Step1 ????data URL???? 3 ????????????? */
  referenceImageDataUrls?: string[] | null;
  /** @deprecated ?????????? */
  referenceImageDataUrl?: string | null;
  /** Step1??? Banana pro?Pro?? Banana 2?Flash? */
  bananaImageModel?: "banana-pro" | "banana-2";
  /** @deprecated ??? bananaImageModel */
  step1ImageModel?: "banana-pro" | "banana-2";
  /** 客户端已成功注入 Cappy Calm 官方参考图时附带，用于追加角色锁定文案 */
  cappyCalmLockPreset?: "s925" | "goldPlated" | "brass";
  /** 与 x-laozhang-api-key 二选一；桌面内嵌时优先用 body 更稳 */
  laozhangApiKey?: string;
  /** 与 x-kie-api-key 二选一；桌面内嵌时优先用 body 更稳 */
  kieApiKey?: string;
  imageApiVendor?: "laozhang" | "kie";
};

/** 与 Step1 上传上限对齐；避免 Vercel 请求体过大导致 500 */
const MAX_REFERENCE_DATA_URL_CHARS = 3_500 * 1024;

function isValidReferenceDataUrl(v: string): boolean {
  if (!v.startsWith("data:image/")) return false;
  if (v.length > MAX_REFERENCE_DATA_URL_CHARS) return false;
  return /;base64,/.test(v);
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } | null {
  const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const mimeType = m[1]?.toLowerCase() || "image/png";
  const payload = m[2] || "";
  try {
    const bytes = Buffer.from(payload, "base64");
    if (!bytes.length) return null;
    return { mimeType, bytes };
  } catch {
    return null;
  }
}

function imageExtByMime(mimeType: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "png";
}

async function ensureKieReferenceUrls(args: {
  referenceImageDataUrls: string[];
  userId: string;
  taskId: string;
}): Promise<string[]> {
  const uploaded: string[] = [];
  for (let i = 0; i < args.referenceImageDataUrls.length; i++) {
    const dataUrl = args.referenceImageDataUrls[i]!;
    const parsed = parseImageDataUrl(dataUrl);
    if (!parsed) {
      throw new Error("Kie 参考图格式无效：仅支持 data:image/*;base64,...");
    }
    const ext = imageExtByMime(parsed.mimeType);
    const key = `temp/kie-inputs/${args.userId}/${args.taskId}/${Date.now()}_${i}.${ext}`;
    const uploadedItem = await uploadBinaryToObjectStorage({
      bytes: parsed.bytes,
      key,
      contentType: parsed.mimeType,
      cacheControl: "public, max-age=86400",
      gateOptions: {
        allowInKeyOnlyAuth: true,
        allowInDesktopLocalImageStorage: true,
      },
    });
    if (!uploadedItem?.url) {
      const reason = explainObjectStorageDisabled({
        allowInKeyOnlyAuth: true,
        allowInDesktopLocalImageStorage: true,
      });
      throw new Error(`Kie 参考图需要临时公网 URL，但当前环境未启用对象存储上传。${reason}`);
    }
    uploaded.push(uploadedItem.url);
  }
  return uploaded;
}

export async function POST(req: Request) {
  const authz = await requireApiActiveUser(req);
  if (!authz.ok) return authz.response;

  const body = (await req.json().catch(() => ({}))) as Partial<Body>;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const taskIdRaw = typeof body.taskId === "string" ? body.taskId : "";
  const countRaw = typeof body.count === "number" ? body.count : 2;
  const count = Math.min(5, Math.max(1, Math.floor(countRaw)));
  const provider = typeof body.provider === "string" ? body.provider : "nano-banana-pro";
  const imageApiVendor = resolveImageApiVendorFromRequest(req, body.imageApiVendor);
  // 兼容旧版 fastMode（true → 2K, false → 4K），无 imageSize 时默认 1K
  const imageSizeRaw = body.imageSize as string | undefined;
  // @ts-expect-error fastMode 为旧版兼容字段，已由 imageSize 替代
  const fastMode = body.fastMode as boolean | undefined;
  const resolution = imageSizeRaw || (fastMode === true ? "2K" : fastMode === false ? "4K" : "1K");
  const expansionStrength: PromptExpansionStrength =
    body.expansionStrength === "strong" ? "strong" : "standard";
  const fromArray = Array.isArray(body.referenceImageDataUrls)
    ? body.referenceImageDataUrls
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter((s) => isValidReferenceDataUrl(s))
        .slice(0, 3)
    : [];

  const legacySingle =
    typeof body.referenceImageDataUrl === "string" &&
    body.referenceImageDataUrl.trim() &&
    isValidReferenceDataUrl(body.referenceImageDataUrl.trim())
      ? [body.referenceImageDataUrl.trim()]
      : [];

  const referenceImageDataUrls =
    fromArray.length > 0 ? fromArray : legacySingle.length > 0 ? legacySingle : [];

  const lockPresetRaw = body.cappyCalmLockPreset;
  const cappyCalmLockPreset =
    lockPresetRaw === "goldPlated" || lockPresetRaw === "brass"
      ? "goldPlated"
      : lockPresetRaw === "s925"
        ? "s925"
        : null;

  const bananaRaw =
    typeof body.bananaImageModel === "string"
      ? body.bananaImageModel.trim()
      : typeof body.step1ImageModel === "string"
        ? body.step1ImageModel.trim()
        : "";
  const laoZhangImageModel = resolveLaoZhangImageModelFromBanana(bananaRaw);

  if (!prompt.trim()) {
    return NextResponse.json({ message: "缺少 prompt" }, { status: 400 });
  }
  const desktopLocalRuntime =
    (authz.authSource === "desktop-runtime" || authz.authSource === "desktop-ephemeral") &&
    isDesktopBundledClientRequest(req);
  const imagePersistMode = resolveImagePersistMode(req, authz.authSource);
  const taskId = await ensureOwnedTaskId(authz.user.id, taskIdRaw, {
    upsertForDesktop: desktopLocalRuntime,
    trustClientTaskId: shouldTrustClientTaskId(req),
  });
  if (!taskId) {
    return NextResponse.json(
      { message: "缺少 taskId，请先在左侧选择或新建任务。" },
      { status: 400 },
    );
  }

  const laozhangApiKey = resolveLaoZhangApiKeyFromRequest(req, body.laozhangApiKey);
  const kieApiKey = resolveKieApiKeyFromRequest(req, body.kieApiKey);

  // nano-banana-pro ????????????????????????/???
  const sampling =
    provider === "nano-banana-pro" ? { temperature: 1, topP: 0.85 } : undefined;

  const now = new Date().toISOString();


  const promptLower = prompt.toLowerCase();
  const isSterling925 = /(925|sterling silver|sterling)/.test(promptLower);
  const kind = inferJewelryProductKind(prompt);
  const productType = kind;
  const productTypeCn = productType === "pendant" ? "? bail ???" : "????";

  // 1:1 ??? Etsy ????????? 2K????????? 4K ????????
  const aspectRatio = "1:1" as const;
  const imageSize: ImageSize = resolution as ImageSize;

  try {
    const images = [];
    const kieReferenceImageUrls =
      imageApiVendor === "kie" && referenceImageDataUrls.length
        ? await ensureKieReferenceUrls({
            referenceImageDataUrls,
            userId: authz.user.id,
            taskId,
          })
        : [];
    let aiExpandWarning: string | null = null;
    const isStandardMode = expansionStrength === "standard";
    const userEnvSurface = userExplicitEnvironmentOrSurfaceInPrompt(prompt);
    const etsyBackgroundLine3 = userEnvSurface
      ? "3) ????????????????? prompt ????/??/??????????????????/????????/?????????????????????????/?????????????????????????????????????????"
      : "3) ?????????????plain solid studio background??????? prompt ?????? prompt ????/??????/???????????";
    const ringInnerBandStrictBlock = isStandardMode
      ? "5.0) RING INNER BAND??????????????????????????????????????????????????"
      : [
          "5.0) RING INNER BAND ZERO-DEFECT???????: ???????????????????????????????????????/??/??/?????",
          "5.1) INNER BAND???/???????????????????????????????????????????????????????????",
          "5.2) INNER BAND???/??????????????????????????????????",
          "5.3) INNER BAND???/??????????/???????????????",
          "5.4) ???????????????????????????????????????",
        ].join("\n");
    const etsyMainConstraints = [
      "Etsy ???????????????",
      ...(isStandardMode
        ? []
        : [
            `1) ?????????????????????${productTypeCn === "? bail ???" ? "??????" : "????"}??????????????/???????????????????????? SKU??????????/??????????????????????/??/????????????`,
          ]),
      "2) ????????/??/?????no model, no hands??",
      etsyBackgroundLine3,
      "4) ?????????logo???????????????????",
      ...(isStandardMode
        ? []
        : [
            "4.1) ??????????????????????????????????????2x2/????????????????????????????????????????",
          ]),
      productType === "pendant"
        ? "5) PENDANT / NECKLACE CAD HERO — ABSOLUTE: **only** pendant body + bail / jump ring in frame. **ZERO** necklace chain (no links, no segments, no cord, no string) visible anywhere — not through bail, not from top edge, not partially cropped. Bail **upright / plumb** as if an **off-camera** pull (implied only). Top of frame = **empty backdrop** above bail. Through-opening for stringing must read clearly. FORBID slack bail draped on motif; FORBID copying a reference chain even if reference shows one."
      : ["5) ??????????????????????????? / ?????????????????????????????????????????????????????????????????????????????????????????/?????", ringInnerBandStrictBlock].join(
          "\n"
        ),
    // ????/??????????????????/????
    "6) ???????????????????????????? 2 ??",
    "6.1) ????/??????????? 2 ???????????????????????????",
    "6.2) ????????????/?????????????????/?? + ???????????",
    ...(isSterling925
      ? [
          "7) 925/sterling silver ???????????/???????????no gradient?????????no fading?????????no multi-tone??",
          "7.1) ??????????/??/????/??/??????????????????????no impurities, no speckles??",
        ]
      : []),
      `${isSterling925 ? "8" : "7"}) ??????????????????????????`,
    ].join("\n");

    const refCount = referenceImageDataUrls.length;
    const isReferenceEdit =
      refCount > 0 && userPromptIsReferenceEditInstruction(prompt);
    const promptOriginal = prompt.trim();
    const companionPolicy = resolveCompanionElementPolicy(promptOriginal);
    const primaryCompanionConstraint =
      companionPolicy === "forbid_add"
        ? [
            "PRIMARY + COMPANION ELEMENT POLICY (strict): user explicitly requests a single element only.",
            "Do NOT add any new companion motif. Deepen only the user-specified primary element.",
          ].join("\n")
        : companionPolicy === "auto_add_one"
          ? [
              "PRIMARY + COMPANION ELEMENT POLICY (strict): treat the user motif as the single primary theme.",
              "Add exactly ONE companion element that supports the primary motif, and describe/reflect a clear structural connection between them.",
              "Never introduce a third motif or turn the companion into a second equal theme.",
            ].join("\n")
          : [
              "PRIMARY + COMPANION ELEMENT POLICY (strict): user already requests multiple motifs.",
              "Do NOT auto-add any extra motif beyond user intent.",
            ].join("\n");
    const keywordBoosters = isReferenceEdit ? "" : appendKeywordBoosters(prompt);
    let semanticExpansion = isReferenceEdit
      ? ""
      : buildNanoBananaPromptExpansion(prompt, expansionStrength);
    let expansionSource: "rules" | "ai" | "ai_fallback_rules" = "rules";
    let expansionModel: string | null = null;
    if (!isReferenceEdit && expansionStrength === "strong") {
      try {
        const ai = await expandStep1PromptWithAi({ prompt, kind });
        semanticExpansion = ai.expandedPrompt;
        expansionSource = "ai";
        expansionModel = ai.model;
      } catch (e) {
        // ?????????? AI ???????????????????????
        semanticExpansion = buildNanoBananaPromptExpansion(prompt, "standard");
        expansionSource = "ai_fallback_rules";
        const detail = e instanceof Error ? e.message : "unknown";
        aiExpandWarning = `????AI?????????????????${step1ExpandFailureUserHint(detail)} ???${detail}`;
      }
    }
    const basePromptWithBoosters = promptOriginal + keywordBoosters;
    /** ???? LLM/??????????????=?????????????????? */
    const postAiExpandSinglePieceLock =
      expansionStrength === "strong"
        ? [
            "?????? ? ???????????????",
            "???????????????????????????????????/???????????????",
            "??????????????????",
            buildSingleJewelryPieceOnlyConstraintBlock(),
            ...(kind === "pendant"
              ? [
                  "PENDANT (post-expand lock): **Never** add or preserve a visible necklace chain in this product hero — body + upright bail only; chain is forbidden even if AI expansion text mentions chain.",
                ]
              : []),
          ].join("\n\n")
        : "";
    const boostedPrompt = isReferenceEdit
      ? promptOriginal
      : [basePromptWithBoosters, semanticExpansion, postAiExpandSinglePieceLock]
          .filter(Boolean)
          .join("\n\n");
    const gemCountLockBlock = isReferenceEdit ? "" : buildGemCountHardLockBlock(boostedPrompt);
    const referencePreamble = isReferenceEdit
      ? buildReferenceEditInstructionBlock(refCount, prompt)
      : buildReferenceFusionBlock(refCount, prompt);
    const cappyCalmLock =
      refCount > 0 && cappyCalmLockPreset
        ? buildCappyCalmCharacterLockBlock(cappyCalmLockPreset)
        : "";
    const systemPrompt = buildNanoBananaProStep1SystemPrompt(prompt);

    const pendantChainFinalLock =
      kind === "pendant"
        ? "\n\nPENDANT — FINAL LOCK (wins over reference + expansion): **No chain in frame.** Re-crop mentally: highest metal = bail loop; nothing linked above it. Violation = failed render."
        : "";
    const productionSoftLimits = isReferenceEdit
      ? buildCompactRefEditProductionLimits(kind, prompt).concat(pendantChainFinalLock)
      : [
          kind === "ring"
            ? buildRingPhysicalBlock("main", false)
            : buildPendantPhysicalBlock(false),
          buildMaterialLightingBlock(promptLower, isSterling925),
          buildMainImageCompositionBlock(kind, prompt),
          kind === "ring" ? buildDelicateRingMotifScaleIntegrationBlock(prompt) : "",
          buildZirconInlayAiColorMatchBlock(prompt, kind, { expandedText: boostedPrompt }),
          gemCountLockBlock,
          buildGlobalNegativePromptBlock(prompt, { pendantProductNoChain: kind === "pendant" }),
        ]
          .filter(Boolean)
          .join("\n\n")
          .concat(pendantChainFinalLock);

    const batchDiversity = isReferenceEdit
      ? ""
      : buildStep1BatchMotifDiversityPreamble(count, prompt);
    const userFacingExpandedPromptCommon = [
      "?Nano Banana Pro ?????????",
      "????????????????????????/???/?????",
      aiExpandWarning ? `????${aiExpandWarning}` : "",
      "",
      "???????",
      basePromptWithBoosters,
      "",
      "?AI/??????",
      semanticExpansion || "(???)",
      "",
      `??????${expansionStrength === "strong" ? "????AI???" : "????????"}`,
      `??????${
        expansionSource === "ai"
          ? `AI ??${expansionModel ? `?${expansionModel}?` : ""}`
          : expansionSource === "ai_fallback_rules"
            ? "AI ?????????"
            : "????"
      }`,
      "",
      refCount > 0
        ? `?????????? ${refCount} ?????????????????????????????`
        : "???????????????????",
    ].join("\n");
    const strictSceneToneLock =
      refCount > 0 && userRequestsStrictScenePreservation(prompt)
        ? buildStrictSceneTonePreservationBlock()
        : "";
    const finalPromptCommon = isReferenceEdit
      ? [
          referencePreamble,
          cappyCalmLock,
          strictSceneToneLock,
          primaryCompanionConstraint,
          productionSoftLimits,
          buildSingleJewelryPieceOnlyConstraintBlock(),
          batchDiversity,
        ]
          .filter(Boolean)
          .join("\n\n")
      : refCount > 0
        ? `${referencePreamble}${cappyCalmLock ? `\n\n${cappyCalmLock}` : ""}${
            strictSceneToneLock ? `\n\n${strictSceneToneLock}` : ""
          }\n\n${systemPrompt}\n\n${primaryCompanionConstraint}\n\n${boostedPrompt}\n\n${etsyMainConstraints}\n\n${productionSoftLimits}${
            batchDiversity ? `\n\n${batchDiversity}` : ""
          }`
        : `${systemPrompt}\n\n${primaryCompanionConstraint}\n\n${boostedPrompt}\n\n${etsyMainConstraints}\n\n${productionSoftLimits}${
            batchDiversity ? `\n\n${batchDiversity}` : ""
          }`;

    // 生图可并行；写库必须串行。Supabase pooler 常见 `connection_limit=1`，并行 persist 会触发
    // Prisma "Timed out fetching a new connection from the connection pool".
    const step1PromptEntries = Array.from({ length: count }, (_, i) => {
      const variantLine = buildStep1PerImageMotifVariantLine(i, count, prompt);
      const promptForThis = variantLine ? `${finalPromptCommon}\n\n${variantLine}` : finalPromptCommon;
      const userFacingExpandedPromptForThis = [
        userFacingExpandedPromptCommon,
        variantLine ? `\n????????\n${variantLine}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return { promptForThis, userFacingExpandedPromptForThis };
    });

    const base64List = await Promise.all(
      step1PromptEntries.map((e) =>
        imageApiVendor === "kie"
          ? refCount > 0
            ? kieImagesToImage({
                initImageUrls: kieReferenceImageUrls,
                prompt: e.promptForThis,
                aspectRatio,
                imageSize,
                kieApiKey,
              })
            : kieTextToImage({
                prompt: e.promptForThis,
                aspectRatio,
                imageSize,
                kieApiKey,
              })
          : refCount > 0
            ? laoZhangImagesToImage({
                initImageDataUrls: referenceImageDataUrls,
                prompt: e.promptForThis,
                aspectRatio,
                imageSize,
                sampling,
                laoZhangImageModel,
                laozhangApiKey,
                promptAfterImages: isReferenceEdit,
              })
            : laoZhangTextToImage({
                prompt: e.promptForThis,
                aspectRatio,
                imageSize,
                sampling,
                laoZhangImageModel,
                laozhangApiKey,
              })
      )
    );

    const generated: Array<{
      id: string;
      url: string;
      createdAt: string;
      debugPromptZh: string;
    }> = [];
    for (let i = 0; i < count; i++) {
      const { userFacingExpandedPromptForThis } = step1PromptEntries[i]!;
      const base64 = base64List[i];
      if (!base64) continue;
      const persisted = await persistGeneratedImage({
        userId: authz.user.id,
        taskId,
        kind: "main",
        base64,
        debugPromptZh: userFacingExpandedPromptForThis,
        keyPrefix: `users/${authz.user.id}/step1`,
        localMode: imagePersistMode.localDisk,
        clientOnly: imagePersistMode.clientOnly,
      });
      generated.push({
        id: persisted.id,
        url: persisted.url,
        createdAt: now,
        debugPromptZh: userFacingExpandedPromptForThis,
      });
    }
    images.push(...generated);

    // ?? Step1 ? systemPrompt/????????????????????? prompt????????
    // ?????????????????? images[].debugPromptZh??????????
    return NextResponse.json({
      images,
      debugPromptZh: userFacingExpandedPromptCommon,
      ...(aiExpandWarning ? { warning: aiExpandWarning } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Step1 生图失败";
    const hint = generateMainFailureUserHint(message);
    console.error("[generate-main]", message, e);
    return NextResponse.json({ message, hint }, { status: 500 });
  }
}

function generateMainFailureUserHint(detail: string): string {
  const d = detail.toLowerCase();
  if (
    d.includes("connection pool") ||
    d.includes("p1008") ||
    d.includes("timed out fetching") ||
    d.includes("too many connections")
  ) {
    return "服务器数据库连接繁忙，请隔几秒再试；若同时开了多张生成可改为 1 张。";
  }
  if (d.includes("payload") || d.includes("too large") || d.includes("413")) {
    return "请求体过大（多为参考图过大），请压缩参考图或减少张数后重试。";
  }
  if (d.includes("缺少 kie") || d.includes("kie")) {
    return kieImageFailureUserHint(detail);
  }
  if (d.includes("缺少老张") || d.includes("api key")) {
    return laoZhangImageFailureUserHint(detail);
  }
  return laoZhangImageFailureUserHint(detail);
}

