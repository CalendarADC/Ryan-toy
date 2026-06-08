/**
 * 珠宝图生成的「软限制」：通过 Prompt 拼接提高可生产性与电商主图质量。
 * Gemini / 老张图接口无独立 negative prompt 字段，负面约束以英文段落形式写入正文。
 */

import { buildRingWomensOnModelStyleAdaptiveBlock } from "@/lib/step2/ringWomensOnModelStyle";

export type JewelryProductKind = "ring" | "pendant";
export type PromptExpansionStrength = "standard" | "strong";
export type PendantRearTopologyClass = "relief_3d" | "plate_back";

export function classifyPendantRearTopologyFromPrompt(prompt: string): PendantRearTopologyClass {
  const t = prompt.trim().toLowerCase();
  if (!t) return "relief_3d";
  const plateLike =
    /(圆盘|方盘|徽章|章牌|奖章|coin|medallion|disk|disc|badge|seal|flat\s*back|平面封底|封底|平背|平板|牌状|盘状)/i.test(
      t
    );
  if (plateLike) return "plate_back";
  const reliefLike =
    /(立体|浮雕|厚雕|厚重|3d|three[-\s]?dimensional|volumetric|sculpt|round[-\s]?body|full[-\s]?body|背面立体|双面凸)/i.test(
      t
    );
  if (reliefLike) return "relief_3d";
  return "relief_3d";
}

/**
 * 与 generate-main / Step3 enhance 一致：
 * - 先判吊坠/项链类与常见 IP 吊坠（避免无「吊坠」字样时被误判为 ring 而挂上戒指角度参考图）。
 * - 再判戒指类关键词。
 * - 均无时默认 pendant（保守：误用戒指机位板比漏用 ring 软约束更严重）。
 */
export function inferJewelryProductKind(prompt: string): JewelryProductKind {
  const pl = prompt.trim().toLowerCase();
  if (!pl) return "pendant";

  const pendantCue =
    /(pendant|necklace|choker|charm|bail|hanging loop|hanger|locket|amulet|chain|链条|吊坠|项链|贴颈项链|颈链|吊饰|挂坠|cappy\s*calm|卡皮巴拉|\bcapybara\b)/i.test(
      pl
    );

  const ringCue =
    /(\bring\b|rings|戒指|指环|戒圈|戒托|婚戒|对戒|戒臂|戒面|女戒|男戒|钻戒|尾戒|扳指)/i.test(pl);

  if (pendantCue) return "pendant";
  if (ringCue) return "ring";
  return "pendant";
}

/**
 * Step3 后视图：用户若已在 prompt 中明确描述吊坠/项链背面/后视造型（含镂空背、透底、背面雕刻等），
 * 则不自动附加默认「实心封底」硬约束，避免覆盖用户意图。
 */
export function userSpecifiedPendantOrNecklaceRearDetail(prompt: string): boolean {
  const t = prompt.trim();
  if (!t) return false;
  const pl = t.toLowerCase();

  if (
    /(镂空背|透底|开窗背|背面镂空|反面镂空|背透|open[\s_-]*back|hollow[\s_-]*back|openwork[\s_-]*back|see[\s-]*through[\s_-]*back|pierced[\s_-]*back|lattice[\s_-]*back|cage[\s_-]*back|mesh[\s_-]*back|open[\s_-]*back[\s_-]*setting)/i.test(
      pl
    )
  ) {
    return true;
  }

  const rearCue = /(背面|反面|后视图|后侧|后壁|背部|rear\s*view|back\s*view|back\s*plate|back\s*of|underside|reverse\s+side)/i.test(
    t
  );
  if (!rearCue) return false;

  return /(镂空|透|开洞|开窗|网格|孔洞|雕刻|纹样|纹理|浮雕|字|铭|图案|造型|结构|hollow|openwork|pierced|cage|lattice|mesh|engrav|pattern|texture|design|slot|perforat)/i.test(
    t
  );
}

/**
 * Step3 吊坠/项链后视图：无用户自定义背面描述时，用「几何结构补全 / 工业建模」约束（英文进 img2img）。
 * 与旧版「整块光滑封底板」不同：背面须有与正面体量匹配的深度与细节，禁止图3式空白大平面。
 */
export function buildPendantRearViewDefaultSolidBackBlock(): string {
  return [
    "PENDANT / NECKLACE — REAR (BACK) VIEW: INDUSTRIAL GEOMETRY COMPLETION (strict): user text did NOT specify custom rear/back detailing; perform **geometric structure completion** as in jewelry CAD / cast modeling.",
    "MENTAL MODEL: imagine a **solid metal blank** that was **machined / cast / engraved away** — front bosses (feathers, faces, bezels, filigree) imply **matched wall thickness, inner ribs, stepped relief, and symmetry** on the reverse. The piece must read as **hand-rotatable 360° jewelry** with no \"paper back\".",
    "POSITIVE (rear — forward constraints): **back view of the pendant**; **full 3D solid structure**; **complete details on the back**; **symmetrical design** when the front motif is symmetric; **complex coherent geometry matching the front silhouette**; **industrial jewelry modeling standard**; **solid metal casting read**; **deep relief** on the reverse; **realistic silver (or user-alloy) texture** with controlled oxidation in recesses; **intricate reverse-side detail** — panel seams, structural webs, gem-seat backs, quill-backs of feathers, under-gallery struts as appropriate.",
    "FORBID (rear — negative constraints): **flat back**, **empty back**, **smooth featureless slab**, **2D-only relief**, **paper-thin sheet**, **missing structural detail**, **simplified placeholder geometry**, **only outline silhouette** with no believable Z-depth.",
    "OPACITY / NO X-RAY: remain **opaque solid metal** — do NOT render a transparent \"window\" into the front motif or stones from behind; no magic see-through of the front design through solid metal.",
    "WEARABILITY: avoid toy-like **random sieve perforations** across the whole rear that would break skin contact; pierced/openwork rear ONLY if the user prompt clearly requests it.",
    "BAIL / HARDWARE on rear: show believable **solid posts, junctions, and inner loop paths** — never delete or seal shut the functional bail.",
    "QUALITY BAR: match **high-end CAD reverse completion** (comparable to pro 3D jewelry tools auto-completing a back view) — the reverse must feel **authored and manufacturable**, not a rushed flat fill.",
  ].join("\n");
}

/**
 * Step3 吊坠后视两阶段：第一阶段侧视探针。
 * 目标是先暴露厚度与背板轮廓，避免直接 rear 时模型“偷懒回正面”。
 */
export function buildPendantRearTopologyProbeBlock(): string {
  return [
    "PENDANT PROFILE PROBE (classification pre-pass, not final deliverable): generate a strict side/profile capture to expose depth and back-plane cues.",
    "Camera instruction: 85°-95° lateral orbit from hero front; keep motif visible as edge/profile; reveal front relief thickness, back-plane boundary, and rim depth in one frame.",
    "FORBID frontal fallback: no straight-on face, no near-frontal beauty relight, no duplicate hero crop.",
    "REQUIRE geometry cues: at least two of {clear front relief projection, visible rear boundary plane, measurable rim thickness, bail-junction depth read}.",
    "Keep same SKU and same scene family; this probe is only for topology disambiguation.",
  ].join("\n");
}

/**
 * Step3 吊坠后视两阶段：第二阶段按拓扑生成后视主约束块。
 */
export function buildPendantRearByTopologyBlock(topology: PendantRearTopologyClass): string {
  if (topology === "plate_back") {
    return [
      "PENDANT REAR TOPOLOGY = PLATE_BACK (strict): treat this SKU as medallion/plate family — rear should be near-planar sealed back, not a full convex second sculpture.",
      "REAR TARGET: mostly flat or gently stepped back plane with manufacturable details (engraving, ribs, webs, floral/filigree, hallmarks, gem-seat backs where applicable).",
      "Thickness rule: preserve realistic rim/wall thickness from profile cues; do not collapse to paper-thin sheet.",
      "FORBID: front-face duplicate from rear request, full animal face/front motif on rear, or deep convex back that reads like another front sculpture.",
      "ANTI-DUPLICATE: rear must be structurally distinguishable from front/main beyond lighting changes.",
    ].join("\n");
  }
  return [
    "PENDANT REAR TOPOLOGY = RELIEF_3D (strict): treat this SKU as volumetric relief family — rear must continue solid 3D mass and back-of-relief geometry.",
    "REAR TARGET: readable rear volume, back-side curvature/stepped depths, believable structural continuation from front relief and side thickness.",
    "FORBID: flat sealed slab rear with no volumetric continuity when profile indicates thick relief body.",
    "ANTI-DUPLICATE: rear must not be a near-frontal clone; camera must favor normals opposite to hero front.",
  ].join("\n");
}

/**
 * 两阶段 rear：从 profile probe 继续转到背面，显式禁止回到 front-like。
 */
export function buildPendantRearFromProbeContinuationBlock(): string {
  return [
    "REAR FROM PROFILE CONTINUATION (strict): the current generation is stage-2 and MUST continue camera orbit from the profile probe toward back view.",
    "Orbit requirement: continue another ~70°-110° from probe bearing so the final camera normals point away from hero front.",
    "FORBID fallback: do NOT reset to frontal hero composition, do NOT output front-face duplicate with only relight changes.",
    "Success criteria: rear structural cues must dominate (back plane / rear relief / back-side hardware continuity), while SKU identity stays locked.",
  ].join("\n");
}

/** 代码层关键词补强（追加在用户原始 prompt 末尾） */
export function appendKeywordBoosters(prompt: string): string {
  const pl = prompt.toLowerCase();
  const parts: string[] = [];
  if (/\bring\b|rings|戒指/.test(pl)) {
    parts.push("ring shape, circular band, jewelry loop");
  }
  if (/necklace|pendant|chain|链条|吊坠|项链/.test(pl)) {
    parts.push(
      "pendant body + bail only, upright bail plumb axis, implied off-camera pull, absolutely zero necklace chain or links visible in frame"
    );
  }
  if (!parts.length) return "";
  return ", " + parts.join(", ");
}

/**
 * Step1：给 nano-banana-pro 一段更“像珠宝设计师”的英语扩写，
 * 在不改变用户核心意图前提下补全材质、工艺、镶嵌、风格语义。
 */
export function buildNanoBananaPromptExpansion(
  prompt: string,
  strength: PromptExpansionStrength = "standard"
): string {
  const p = prompt.trim();
  if (!p) return "";

  const pl = p.toLowerCase();
  const kind = /(pendant|necklace|charm|bail|吊坠|项链|链坠)/i.test(pl) ? "pendant" : "ring";
  const is925 = /(925|sterling silver|sterling|925银)/i.test(p);
  const hammered = /(hammered|锤纹|手工锤纹)/i.test(p);
  const gems = /(宝石|gem|gemstone|amethyst|spinel|ruby|sapphire|moonstone|石)/i.test(p);
  const filigree = /(雕花|花丝|engrave|engraving|filigree|carving)/i.test(p);

  // 风格词只做“提示”，不强制覆盖用户主体意图
  const styleHints: string[] = [];
  if (/(mystic|mysticism|神秘主义|符文|lunar|ritual|occult)/i.test(p)) styleHints.push("mystic");
  if (/(gothic|暗黑|哥特)/i.test(p)) styleHints.push("gothic");
  if (/(art nouveau|新艺术)/i.test(p)) styleHints.push("art nouveau");
  if (/(art deco|装饰艺术)/i.test(p)) styleHints.push("art deco");
  if (/(minimal|极简)/i.test(p)) styleHints.push("minimal");
  if (/(vintage|antique|复古)/i.test(p)) styleHints.push("vintage");
  if (/(cyberpunk|赛博朋克|futur|未来)/i.test(p)) styleHints.push("futuristic");
  if (/(nature|botanical|floral|自然|植物|花)/i.test(p)) styleHints.push("nature");

  const lines: string[] = [
    "Expanded jewelry-creative direction for Nano Banana Pro (style-adaptive, do not override user intent):",
    "First infer the user's style DNA from the prompt, then enrich the concept with jewelry-native creative details while preserving the exact core subject and composition intent.",
    `Design target: ${
      kind === "ring" ? "a manufacturable high-end ring" : "a manufacturable high-end pendant"
    } with believable 3D structure, clear hierarchy (hero motif + supporting ornaments), and wearable proportions.`,
    `Material baseline: ${is925 ? "925 sterling silver" : "premium jewelry metal"} with realistic micro-reflections, clean finish, and production-grade polish/oxidation control.`,
    "Creative expansion method (strict): add 3-6 style-consistent details in these domains only — metal surface treatment, edge rhythm, relief layering depth, gemstone setting logic, symbolic micro-motifs, and silhouette flow.",
    "Do NOT change the user's requested main subject/category. Do NOT replace creature/theme. Innovate around craftsmanship vocabulary, not around product identity.",
    "Manufacturing realism: every decorative element must look physically buildable (cast/engraved/stone-set), with credible thickness, transitions, and attachment points.",
  ];

  if (styleHints.length) {
    lines.push(`Detected style hints: ${styleHints.join(", ")}. Keep expansion consistent with these cues.`);
  }
  if (hammered) {
    lines.push(
      "If hammered texture is requested: show intentional hand-hammer marks with controlled highlight breakup, not random noise."
    );
  }
  if (gems) {
    lines.push(
      "If gemstones are present: use believable prong/bezel seating and coherent gemstone color story; avoid floating or physically impossible stones."
    );
  }
  if (filigree) {
    lines.push(
      "If filigree/engraving is requested: keep ornamental rhythm readable, with clear primary-secondary pattern hierarchy."
    );
  }
  lines.push(
    "Render intent: premium e-commerce jewelry photo quality — sharp details, realistic metal/specular behavior, and clear focal narrative."
  );
  // 2026-04: 当前“标准扩写”即采用原强创意规则版，提升基础出图补强能力。
  // “强创意”模式将由外部 AI 改写接口提供（在 generate-main 中调用），此处作为统一规则回退。
  lines.push(
    "Increase creative specificity while preserving the same core subject — add richer but style-consistent micro-details in silhouette transitions, relief rhythm, and ornament hierarchy."
  );
  lines.push(
    "When multiple coherent options exist, choose the most visually distinctive premium-jewelry interpretation that still remains manufacturable and faithful to user intent."
  );

  return lines.join(" ");
}

/** 从提示词括号内 A/B/C、A、B 等拆出候选主体词，供批量生图轮换 */
export function extractMotifAlternativesFromPrompt(prompt: string): string[] {
  const seen = new Set<string>();
  const normalize = (raw: string) =>
    raw
      .trim()
      .replace(/^(?:等|如|例如|比如)\s*/u, "")
      .replace(/等[\s\S]*$/u, "")
      .replace(/可爱动物$/u, "")
      .trim();

  const add = (raw: string) => {
    const t = normalize(raw);
    if (t.length >= 1 && t.length <= 24) seen.add(t);
  };

  const bracketRe = /[（(]([^）)]+)[）)]/g;
  let bm: RegExpExecArray | null;
  while ((bm = bracketRe.exec(prompt)) !== null) {
    const inner = bm[1];
    if (!/[\/／、|｜]/.test(inner)) continue;
    for (const part of inner.split(/[\/／、|｜]/)) add(part);
  }

  const flatSlash = prompt.match(/[\u4e00-\u9fffA-Za-z·]+(?:\/[\u4e00-\u9fffA-Za-z·]+)+/g);
  if (flatSlash) {
    for (const chunk of flatSlash) {
      if (!/[\/／]/.test(chunk)) continue;
      for (const part of chunk.split(/[\/／]/)) add(part);
    }
  }

  return Array.from(seen);
}

/** Step1 一次生成多张时：避免每张都锁死为同一物种（如全是兔子） */
export function buildStep1BatchMotifDiversityPreamble(count: number, prompt: string): string {
  if (count <= 1) return "";
  const alts = extractMotifAlternativesFromPrompt(prompt);
  const lines = [
    "【批量生成 — 主体多样性（必须遵守）】",
    `本次一次生成 ${count} 张主图。若提示词中列举多种可接受的主体（如用「/」「、」或括号内多选，或带「等」的列举），整套图必须在「主视线动物/核心造型」上明显区分开，禁止 ${count} 张全部重复同一物种或同一固定构图。`,
    "Each requested image is a SEPARATE output file: every single render must still be ONE photograph only — do NOT merge multiple variants into one grid/collage inside a single image.",
    "Across this batch: maximize diversity of the primary creature/motif when alternatives are implied; do NOT output the same dominant animal on every image.",
  ];
  if (alts.length >= 2) {
    lines.push(
      `User-listed motif pool (rotate across images): ${alts.join(" | ")}. Each image should emphasize a different pool entry when possible.`
    );
  }
  return lines.join("\n");
}

/** 单张图追加的轮换指令（与 buildStep1BatchMotifDiversityPreamble 配合） */
export function buildStep1PerImageMotifVariantLine(
  index: number,
  total: number,
  prompt: string
): string {
  if (total <= 1) return "";
  const alts = extractMotifAlternativesFromPrompt(prompt);
  const lines = [
    `【本张为批量中第 ${index + 1}/${total} 张】`,
    "THIS FRAME (strict): deliver ONE single full-frame product photo — NO in-frame grid, NO collage of multiple rings/panels.",
    "THIS IMAGE VARIANT (strict): Primary focal creature/motif must differ clearly from other images in this same batch — avoid cloning the same species and pose across the set.",
  ];
  if (alts.length >= 2) {
    if (index < alts.length) {
      const pick = alts[index];
      lines.push(
        `ASSIGNED PRIMARY MOTIF FOR THIS RENDER: "${pick}" — make this animal/creature the clear hero of the ring design for this image only; sibling renders use other listed options.`
      );
    } else {
      lines.push(
        `EXTRA SLOT (${index + 1}/${total}): user listed ${alts.length} motif(s) but requested more images — choose a NEW primary cute animal consistent with the brief (not yet used in this batch), distinct from: ${alts.join(
          ", "
        )}.`
      );
    }
  } else {
    lines.push(
      "Interpret the user's cute-animal + floral brief with a fresh primary species or floral emphasis for this slot — vary species, silhouette, and focal layout vs. other batch images."
    );
  }
  return lines.join("\n");
}

export function userRequestedDarkBackground(prompt: string): boolean {
  return /(black background|dark background|黑底|深色背景|深色[^，。\n]{0,24}木|深色老橡|black gold|黑金|onyx|matte black|炭黑|深黑背景)/i.test(
    prompt
  );
}

/** 用户是否在 prompt 里明确写了台面/环境/材质背景（非默认灰白无缝棚拍） */
export function userExplicitEnvironmentOrSurfaceInPrompt(prompt: string): boolean {
  if (userRequestedDarkBackground(prompt)) return true;
  const pl = prompt.toLowerCase();
  if (
    /(橡木|老橡木|胡桃木|实木|原木|木纹|木桌|木台面|木.{0,8}桌面|桌面|台面上|置于.{0,14}(木|桌|台)|木面|年轮|树瘤|桌板|台面)/i.test(
      prompt
    ) ||
    /\b(wood|oak|walnut|teak|mahogany|wooden|woodgrain|wood\s*grain|rustic\s+table|tabletop|driftwood|burl)\b/i.test(
      pl
    )
  ) {
    return true;
  }
  if (
    /(大理石|花岗|石材|天鹅绒|丝绒|绒布|亚麻|竹编|石板|水泥|皮革|velvet|marble|granite|slate|linen|leather)/i.test(
      prompt
    )
  ) {
    return true;
  }
  return false;
}

/** 用户明确要求“保持原场景/光影/色调不变”时，启用更强的影调锁。 */
export function userRequestsStrictScenePreservation(prompt: string): boolean {
  const p = prompt.toLowerCase();
  return (
    /(保持|维持|不改变|不要改变|锁定|一致|还原).{0,16}(场景|背景|光影|色调|曝光|白平衡|饱和度).{0,10}(不变|一致|原样|相同)/i.test(
      prompt
    ) ||
    /(same|keep|preserve|lock).{0,20}(scene|background|lighting|tone|exposure|white\s*balance|saturation).{0,12}(unchanged|same|consistent)/i.test(
      p
    )
  );
}

/** 参考图/Step3 的严格影调与场景锁，优先级高于常规风格文案。 */
export function buildStrictSceneTonePreservationBlock(): string {
  return [
    "STRICT SCENE+TONE PRESERVATION (highest priority): Treat init/reference photo as photometric master.",
    "Keep the SAME background scene identity and grade: exposure, white balance, contrast curve, saturation intent, shadow depth, highlight rolloff — match init warmth **as-is**, neither cooler nor warmer.",
    "FORBID global re-light, gray cast, desaturation, matte haze, low-contrast wash, or cool-down that makes metal/stone look darker or duller.",
    "FORBID global **yellow / amber / golden** cast, tungsten shift, or pushing neutral backgrounds toward tan/cream unless the init already had that grade.",
    "If any style line conflicts with this lock, this lock wins.",
  ].join("\n");
}

/**
 * Step3 多视角（左/右/后/正）默认影调锁：不依赖用户文案是否写「保持色调」。
 * 解决侧视/后视常被模型「暖化」、整体偏黄的问题。
 */
export function buildStep3MultiViewTonePreservationBlock(): string {
  return [
    buildStrictSceneTonePreservationBlock(),
    "STEP3 MULTI-VIEW COLOR STABILITY (strict): left/right/rear/front product shots must read as the **same photo session** as the init — **only** camera bearing changes.",
    "Match init metal color (silver stays silver-toned, not brassy), stone hues, cushion/fabric/wood **if visible** — do not invent yellower velvet, warmer oak, or amber global grade.",
    "Side and rear orbits often trigger erroneous warm relights; **explicitly resist** that failure mode.",
  ].join("\n\n");
}

/** 强制机位与 init 可区分，避免 img2img 只微调光影却标签为左/右/正视图。 */
export function buildStep3MandatoryCameraOrbitBlock(
  shot: "left" | "right" | "rear" | "front" | "handheld",
  kind?: JewelryProductKind
): string {
  const orbitHint =
    shot === "left"
      ? "orbit **counterclockwise** toward the piece's physical **LEFT** (~60°–110°)"
      : shot === "right"
        ? "orbit **clockwise** toward the physical **RIGHT** (~60°–110°)"
        : shot === "handheld"
          ? "switch to a **human hand-held macro perspective** with fingers actively pinching/holding the jewelry; not a neck-wearing shot and not a static tabletop-only shot"
        : shot === "rear" && kind === "ring"
          ? "orbit to the **true rear / back** of the ring (~120°–180° from the hero face), then **lay the ring flat** so the **rear exterior of the shank** faces the lens — **not** an upright through-hole shot"
          : shot === "rear"
            ? "rotate to the **true back / rear** (~120°–180° from the hero face)"
            : "square the camera to a **true frontal** hero (perpendicular to the display face)";
  return [
    `MANDATORY CAMERA DELTA (${shot.toUpperCase()} — non-negotiable): ${orbitHint}.`,
    "The output **must** be visibly different in **viewing bearing** from the init — a viewer should immediately see this is **not** the same camera position as the Step2 hero.",
    "If band ellipse, motif plane, and stone table read **the same** as the init (only polish/glare shifted), you **failed** — increase orbit until asymmetric lateral or rear/front cues dominate.",
    "Preserve SKU, stones, and session tone; **change camera only** — but the camera change must be **obvious**.",
  ].join(" ");
}

export function buildStep3HandheldShotBlock(kind: JewelryProductKind): string {
  const kindLine =
    kind === "pendant"
      ? "Pendant handheld: hold pendant between fingers (or on fingertips) with clear bail and pendant body visible; chain may be absent or partially present, but jewelry remains the sole hero."
      : "Ring handheld: hold ring between fingers or let ring rest on fingertips; maintain clear view of ring face and shank profile.";
  return [
    "HANDHELD / PLAY-IN-HAND VIEW (strict): generate a realistic macro hand-interaction shot with natural finger skin texture, tiny pressure deformation, and believable depth-of-field.",
    kindLine,
    "Composition: jewelry occupies hero area while at least 2 fingers are visible for scale reference; avoid face or full body.",
    "Realism cues: subtle micro shadows between jewelry and skin, correct contact points, and natural grip force; no floating jewelry detached from fingers.",
    "FORBID: mannequin hand, plastic toy hand, extra rings/bracelets, unrealistic giant jewelry scale, or a pure tabletop still-life with no hand interaction.",
  ].join("\n");
}

/**
 * Step3 戒指四视图统一摆放定义：
 * - 必须“躺放”在展示环境中（非手持）
 * - 戒指中孔所在平面需垂直于台面（即中孔不是朝上平放）
 */
export function buildRingStep3LyingPlacementBlock(
  shot: "front" | "left" | "right" | "rear"
): string {
  const shared = [
    "RING PLACEMENT BASELINE (strict, applies to front/left/right/rear): place the ring lying/resting on the display surface in a stable product pose.",
    "Lying definition lock: the ring-hole insertion plane must be **perpendicular to the tabletop** (vertical plane), not parallel to the tabletop.",
    "FORBID: flat face-up donut placement (hole plane parallel to table), upright balancing stand tricks, levitating ring, hand-held ring, or mannequin hand.",
    "Keep realistic contact with surface and believable contact shadows; no floating geometry.",
  ].join("\n");
  if (shot === "front") {
    return [
      shared,
      "FRONT ORIENTATION: theme/head/main motif faces the lens squarely while staying in the same lying placement family.",
      "Do not rotate into side-profile for front view.",
    ].join("\n");
  }
  if (shot === "left") {
    return [
      shared,
      "LEFT ORIENTATION (theme-led): classify left view by motif facing direction — the main theme/head should point toward **screen-left**.",
      "This is not a mirrored right view; preserve lying placement while rotating to the left-bearing variant.",
    ].join("\n");
  }
  if (shot === "right") {
    return [
      shared,
      "RIGHT ORIENTATION (theme-led): classify right view by motif facing direction — the main theme/head should point toward **screen-right**.",
      "This is not a mirrored left view; preserve lying placement while rotating to the right-bearing variant.",
    ].join("\n");
  }
  return [
    shared,
    "REAR ORIENTATION: show the back of theme/head and rear structure while keeping the same lying placement definition.",
    "Rear should not fall back to front or side hero composition.",
  ].join("\n");
}

/**
 * Step3 戒指后视图（方案 A）：放倒 + 戒圈背面/屁股朝镜头，对齐老张测试站图1。
 * 禁止图2式「立起来、镜头正对戒圈内孔」的穿心视角。
 */
export function buildRingRearProductViewBlock(): string {
  return [
    "RING — REAR / BACK PRODUCT VIEW (strict):",
    "Placement: keep the ring in the same lying placement family — resting on the surface with ring-hole plane perpendicular to the tabletop.",
    "Rear target: camera reads back-of-theme + rear shank structure as the dominant information.",
    "Allow visible inner hole as part of lying rear composition, but rear topology must dominate over front hero features.",
    "FORBID: front-face fallback, left/right side-only fallback, top-down flat donut placement, levitating or hand-held pose.",
    "Keep identical design and stone count; reveal legitimate rear geometry only.",
  ].join("\n");
}

/** 细戒 / 中细戒：主题相对戒臂的比例档位（Step1 扩写 + 生图软限制共用） */
export type RingMotifShankScaleTier = "ultra-thin" | "medium-thin";

/** Step1 扩写必须写入的整句（细戒） */
export const STEP1_ULTRA_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE =
  "设计主题相对戒臂 1.2–1.6 倍，并强调肩线融合、禁止中间大两侧小";

/** Step1 扩写必须写入的整句（中细戒 / 中性戒指） */
export const STEP1_MEDIUM_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE =
  "设计主题相对戒臂 1.2–1.8 倍，并强调肩线融合、禁止中间大两侧小";

/** 中细戒、中性戒指 → 1.2–1.8（优先于细戒/女戒档） */
export function userWantsMediumThinRing(prompt: string): boolean {
  const pl = prompt.toLowerCase();
  if (/(中细戒指|中细戒|中细款|中细圈|中性戒指|中性戒|男女通用戒|男女皆宜戒)/i.test(prompt)) {
    return true;
  }
  if (/\b(unisex|gender[-\s]?neutral)\s+ring\b/i.test(pl)) return true;
  return false;
}

/** 细戒、女戒等 → 1.2–1.6（不含已命中中细/中性档） */
export function userWantsUltraThinRing(prompt: string): boolean {
  if (userWantsMediumThinRing(prompt)) return false;
  const pl = prompt.toLowerCase();
  if (
    /(细戒|细戒指|细圈|细款戒|纤细|纤巧|轻薄戒|窄戒|细戒臂|戒臂[^，。\n]{0,8}细|小巧戒|精致小戒|女戒|女士戒指|女性戒指|女生戒指|女式戒|女款戒|适合女性|适合女士|女性.{0,4}佩戴)/i.test(
      prompt
    )
  ) {
    return true;
  }
  if (
    /\b(thin|slim|narrow|delicate|dainty)\s+(ring|band|shank)\b/.test(pl) ||
    /\b(women'?s|womens|ladies)\s+ring\b/.test(pl) ||
    /\bring\s+for\s+women\b/.test(pl)
  ) {
    return true;
  }
  return false;
}

export function getRingMotifShankScaleTier(prompt: string): RingMotifShankScaleTier | null {
  if (userWantsMediumThinRing(prompt)) return "medium-thin";
  if (userWantsUltraThinRing(prompt)) return "ultra-thin";
  return null;
}

/** 仅细戒/女戒或中细/中性戒：需主题与戒臂比例句；其余戒指不做此要求 */
export function userWantsDelicateThinWomensRing(prompt: string): boolean {
  return getRingMotifShankScaleTier(prompt) !== null;
}

export function mandatoryPhraseForRingMotifShankTier(tier: RingMotifShankScaleTier): string {
  return tier === "ultra-thin"
    ? STEP1_ULTRA_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE
    : STEP1_MEDIUM_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE;
}

/** 扩写正文中 canonical 比例句（含括号包裹的重复） */
const RING_MOTIF_SHANK_RATIO_LINE_RE =
  /\[?\s*设计主题相对戒臂[^。；\n\]]{0,56}[。；\]】]?\s*|【戒指主题\/戒臂比例[^】]*】\s*/g;

const RING_MOTIF_SHANK_ANY_RATIO_MENTION_RE =
  /(?:设计主题|体量|主题)相对戒臂\s*(?:约|大约)?\s*[\d.]+\s*倍|相对戒臂\s*(?:约|大约)?\s*[\d.]+\s*倍/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanupRingMotifShankRatioText(text: string): string {
  return text
    .replace(/[，、]{2,}/g, "，")
    .replace(/[，、]\s*([。；\n])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 正文是否已写过主题/戒臂比例（含「体量相对戒臂约1.4倍」等自然改写） */
export function hasRingMotifShankRatioMention(
  text: string,
  _tier?: RingMotifShankScaleTier
): boolean {
  if (RING_MOTIF_SHANK_ANY_RATIO_MENTION_RE.test(text)) {
    return true;
  }
  if (/禁止中间大两侧小/.test(text) && /(?:肩线|戒臂).{0,28}(?:融合|收拢)/.test(text)) {
    return true;
  }
  return false;
}

export function stripRingMotifShankRatioLines(text: string): string {
  let t = text
    .replace(RING_MOTIF_SHANK_RATIO_LINE_RE, "")
    .replace(new RegExp(escapeRegExp(STEP1_ULTRA_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE), "g"), "")
    .replace(new RegExp(escapeRegExp(STEP1_MEDIUM_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE), "g"), "");
  // 展示背景固定句之后若又跟了一条比例标准句，整段去掉
  const bgRe =
    /(展示背景：根据设计，把(?:戒指|吊坠)放到你认为合适的展示背景里)([\s\S]*)$/;
  const bgMatch = t.match(bgRe);
  if (bgMatch) {
    const tail = bgMatch[2] ?? "";
    if (
      RING_MOTIF_SHANK_RATIO_LINE_RE.test(tail) ||
      /设计主题相对戒臂/.test(tail) ||
      RING_MOTIF_SHANK_ANY_RATIO_MENTION_RE.test(tail)
    ) {
      t = bgMatch[1] ?? t;
    }
  }
  return cleanupRingMotifShankRatioText(t);
}

function injectRingMotifShankRatioIntoOpening(text: string, phrase: string): string {
  const ringOpen = text.match(/^设计一枚S925银戒指，/);
  if (ringOpen) {
    return text.replace(/^设计一枚S925银戒指，/, `设计一枚S925银戒指，${phrase}，`);
  }
  const pendantOpen = text.match(/^设计一枚S925银吊坠，/);
  if (pendantOpen) {
    return text.replace(/^设计一枚S925银吊坠，/, `设计一枚S925银吊坠，${phrase}，`);
  }
  return `${phrase}。${text}`;
}

/** 扩写后处理：比例要求只在正文出现一次；禁止在展示背景后再挂标准句 */
export function ensureStep1ExpandedRingMotifShankPhrase(
  expanded: string,
  tier: RingMotifShankScaleTier
): string {
  const phrase = mandatoryPhraseForRingMotifShankTier(tier);
  const hadRatio = hasRingMotifShankRatioMention(expanded, tier);
  const trimmed = stripRingMotifShankRatioLines(expanded);
  if (!trimmed) return phrase;
  if (hadRatio) {
    return trimmed;
  }
  return injectRingMotifShankRatioIntoOpening(trimmed, phrase);
}

/**
 * Step3 佩戴图：用户意图为「适合女性佩戴 / 女戒 / 通勤秀气」等时，加强完整手部与高端棚拍气质。
 * 与 userWantsDelicateThinWomensRing 对齐并略扩同义表达。
 */
export function userWantsWomensRingOnModelPresentation(prompt: string): boolean {
  if (userWantsDelicateThinWomensRing(prompt)) return true;
  const p = prompt.trim();
  const pl = p.toLowerCase();
  if (
    /(女款戒|女式戒|女性戒指|女生戒指|女士款|优雅戒指|气质戒指|送女友|送老婆|送女生)/i.test(p)
  ) {
    return true;
  }
  if (
    /\b(ladies|lady|feminine|elegant)\b.*\bring\b/i.test(pl) ||
    /\bring\b.*\b(ladies|lady|feminine|for\s+her)\b/i.test(pl)
  ) {
    return true;
  }
  return false;
}

/**
 * 戒指 on-model：女性向 — 由 AI 根据 SKU + brief 自由发挥穿戴场景（见 ringWomensOnModelStyle）。
 */
export function buildRingWomensOnModelLuxuryPresentationBlock(
  prompt = "",
  varietySeed = ""
): string {
  return buildRingWomensOnModelStyleAdaptiveBlock(prompt, varietySeed);
}

/**
 * 女性细戒：主题区与戒臂比例平衡、肩线自然过渡（Step1 主图 / Step3 增强共用）。
 * 良品参考：主题沿上弧分布或自戒肩渐宽融入，戒臂与装饰区体量接近、过渡连续。
 * 劣品参考：极细戒臂 + 中央巨大盾形/牌饰/高台，断崖式台阶、头重脚轻。
 */
export function buildDelicateRingMotifScaleIntegrationBlock(prompt: string): string {
  const tier = getRingMotifShankScaleTier(prompt);
  if (!tier) return "";
  const ratioHint =
    tier === "ultra-thin"
      ? "theme mass ~1.2–1.6× band width"
      : "theme mass ~1.2–1.8× band width";
  return [
    "RING MOTIF/SHANK (fine band): obey the Chinese expansion ratio line once; smooth shoulder integration;",
    `${ratioHint}; FORBID center-heavy 'big middle, thin sides' silhouette.`,
  ].join(" ");
}

/** 从扩写/提示中解析「全件宝石共 N 颗」声明，供生图与扩写颗数对齐 */
export function parseStatedTotalGemCount(text: string): number | null {
  const m = /全件宝石共\s*(\d+)\s*颗/.exec(text);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(n) || n < 1 || n > 6) return null;
  return n;
}

/** 生图：扩写已声明颗数时，硬性锁定可见宝石总数（避免与「最多 6 颗」冲突） */
export function buildGemCountHardLockBlock(expandedOrBoosted: string): string {
  const n = parseStatedTotalGemCount(expandedOrBoosted);
  if (!n) return "";
  return [
    "GEM COUNT LOCK (strict): the expansion text states exactly",
    `${n} visible set stones total (main + all accents). Render at most ${n} — do NOT add extra melee on leaves, stem, or shank.`,
    `禁止在画面中增加第 ${n + 1} 颗及以外的任何镶嵌石；叶脉/藤蔓/戒臂上不得「每片叶子一颗石」式加点。`,
  ].join(" ");
}

/** 细戒专用全局负面补充（与 buildGlobalNegativePromptBlock 拼接） */
export function buildDelicateRingBalanceNegativeLines(prompt: string): string[] {
  const tier = getRingMotifShankScaleTier(prompt);
  if (!tier) return [];
  const maxMul = tier === "ultra-thin" ? "1.6" : "1.8";
  return [
    `Delicate ring negatives (${tier}): NO center-heavy 'big middle, thin sides' shank read; NO oversized shield/kite/plaque on a much thinner shank; NO abrupt step from narrow band to thick top platform; NO trophy crown wider than ~${maxMul}× the shank; NO 'thin wire + huge top charm' contrast.`,
  ];
}

/** 用户原文是否指定非锆石类主配石（与 step1 扩写逻辑对齐） */
function userPromptSpecifiesNonZirconGemstoneForInlay(prompt: string): boolean {
  return /(?:天然|主石|配石)?(?:钻石|红宝石|蓝宝石|祖母绿|翡翠|和田玉|珍珠|紫水晶|黄水晶|白水晶|水晶|玛瑙|碧玺|石榴石|橄榄石|尖晶石|刚玉|海蓝宝|坦桑石|碧玺石|月光石|托帕石)/i.test(
    prompt
  );
}

/**
 * Step1 生图：配石为锆石时，由图像模型根据设计自动匹配色泽（勿默认全白）。
 */
export function buildZirconInlayAiColorMatchBlock(
  prompt: string,
  kind: JewelryProductKind,
  opts?: { maxVisibleGems?: number; expandedText?: string }
): string {
  if (kind !== "ring" && kind !== "pendant") return "";
  if (userPromptSpecifiesNonZirconGemstoneForInlay(prompt)) return "";
  const stated =
    opts?.maxVisibleGems ??
    (opts?.expandedText ? parseStatedTotalGemCount(opts.expandedText) : null) ??
    parseStatedTotalGemCount(prompt);
  const maxGems = stated ?? 6;
  const maxColors = 3;
  return [
    "【锆石配石 — 色泽由生图模型匹配（必须遵守）】",
    "主配石/点缀石材质为锆石（除非用户原文明确要求其它宝石）。",
    "若扩写已写明商品色名（如香槟锆、深海蓝锆、粉红锆等），须在本图中按扩写色名落实，不得擅自改成白锆或其它色。",
    "若扩写未写色名，请根据设计主题自动选择协调锆石色泽，避免机械默认全白锆。",
    "ZIRCON COLOR (image model decides): match hue to motif + style + metal; avoid habitually rendering all stones colorless/white unless the design truly calls for it.",
    "",
    "【宝石数量与布局 — 必须遵守】",
    stated
      ? `扩写已声明全件宝石共 ${stated} 颗：画面中可见镶嵌宝石必须**恰好 ${stated} 颗**，不得增加至 6 颗或「每叶一颗」式加点。`
      : "整件首饰可见镶嵌宝石总共不超过 6 颗；锆石/宝石颜色不超过 3 种。",
    "禁止密排/连片/成行/成带镶、轨道或凹槽内连续小颗镶、花瓣/藤蔓/戒臂表面碎钻铺满（反例：一排蓝锆、满镶小花）。",
    "须保留金属间隙，主石突出、配石稀疏；颗数与色号须与扩写一致，不得擅自增加宝石或颜色。",
    `GEM COUNT (strict): at most ${maxGems} visible set stones total, at most ${maxColors} distinct stone colors; no pavé rows, channel-packed melee, or all-over micro-stone coverage.`,
  ].join("\n");
}

/**
 * 禁止单张图内出现多件首饰（如多枚戒指并排、多件陈列），Step1 构图 / 全局负面 / Step3 保真共用。
 */
export function buildSingleJewelryPieceOnlyConstraintBlock(): string {
  return [
    "SINGLE JEWELRY SUBJECT ONLY (strict): Exactly ONE physical jewelry piece in the entire frame — one ring OR one pendant body as the only hero product.",
    "FORBID: two or more rings or pendants visible as separate jewelry objects; three-in-a-row / N-in-a-row ring lineup on table, leather, or fabric; multi-piece flat lay; several rings sharing one hero shot.",
    "FORBID: jewelry collection spreads, catalog comparison with multiple SKUs in one photo, left+center+right trio of rings, or duplicate twin rings framing the composition unless the user prompt explicitly requests a pair (default: never).",
    "The only allowed exception for a second metal object is a minimal display stand/holder that is clearly NOT a second ring or pendant; it must not read as another piece of jewelry.",
  ].join("\n");
}

const RING_REAR_VIEW_NEGATIVE_LINES = [
  "Ring rear-view negatives: NO upright ring on band edge with camera through finger hole; NO centered perfect circular hole dominating frame; NO donut/tunnel end-on composition; NO front stone table or animal face still squarely toward lens when rear was requested.",
];

const GLOBAL_NEGATIVE_TAIL_LINES = [
  "No corrosion artifacts: no rust patches, no green oxidation stains, no random tarnish spots, no peeling/plating loss, no uneven faded metal color unless explicitly requested by the user.",
  "For animal motifs: avoid lifeless/stiff expression, avoid statue-like frozen face, avoid dead-eye look, avoid rigid toy-like posture with no organic flow.",
  "For ring inner band: NO extra hole, NO inner-wall cutout, NO perforation slot, NO recessed cavity/pocket, NO inward dent/sink on the finger-contact interior surface.",
  "Ring inner-surface negatives: NO inner dent, NO inner dimple, NO inner groove, NO groove inside shank, NO concave trench on inner shank, NO inner ridge/bump/seam line, NO casting seam on finger-contact interior, NO inner engraving/inner text/inner filigree on the finger-contact inner loop.",
  "Perspective consistency negatives: NO mixed conflicting viewpoints in one product (e.g., face front-on while ring body is side profile), NO twisted impossible ring geometry, NO corkscrew deformation, NO physically contradictory camera projection.",
  ...RING_REAR_VIEW_NEGATIVE_LINES,
];

/**
 * 全局负面约束。若用户在 prompt 中明确要求木质台面/木纹/石材等环境，则不得再禁止「木」，
 * 否则会把「深色老橡木桌面」等需求与默认棚拍逻辑一起冲掉。
 */
export function buildGlobalNegativePromptBlock(
  prompt: string,
  opts?: { onModel?: boolean; pendantProductNoChain?: boolean }
): string {
  const surfaceOk = userExplicitEnvironmentOrSurfaceInPrompt(prompt);
  const propClause = surfaceOk
    ? "unrelated freestanding ceramic figurines or random decorative wood crates as separate props (NOT the user-requested tabletop/surface); if the user described oak/wood grain/marble/fabric table or environment, render that faithfully — do NOT replace with seamless gray/white studio sweep."
    : "wood or ceramic props,";
  const delicateRingNegatives = buildDelicateRingBalanceNegativeLines(prompt);
  const onModel = !!opts?.onModel;
  const wearingFailure =
    onModel
      ? " **WEARING-BRIEF FAILURE to avoid:** jewelry still framed like the init **tabletop catalog still-life** (piece alone on cushion / jewelry box / tray as the hero) with **no visible finger, hand, neck, or chain-on-body context** when the shot is on-model."
      : "";
  const pendantNoChain =
    !onModel && !!opts?.pendantProductNoChain
      ? " **PENDANT / NECKLACE PRODUCT HERO — NO CHAIN (strict):** any visible **necklace chain, chain links, cable/snake/rolo links, cord, string, or leather lace** passing through the bail or entering from the **top edge** of the frame; chain continuation above bail; \"half chain\" peeking in; jewelry photography where the hero is clearly **on-chain** instead of **body + bail only**."
      : "";
  const head =
    "NEGATIVE CONSTRAINTS (strictly avoid): multiple unrelated products in one hero shot, multiple salient jewelry pieces in one frame (e.g. three rings side-by-side on leather, row of rings, several pendants in one shot), jewelry collection / multi-SKU lineup, collage layout, photo grid, split screen, multi-panel montage, tiled frames (2x2 / 3x3 / NxN), storyboard layout, contact sheet, diptych/triptych, before-after split, picture-in-picture, any readable text, watermark, signature, logo, human face in frame, deformed or twisted fingers, plastic or resin toy look, " +
    propClause +
    " matte dull flat metal with no highlights, flat lighting with no reflections, blurry output, low resolution, clutter objects, jewelry presentation box as prop, extra earrings or bracelets unless the text prompt explicitly requests a matching set." +
    wearingFailure +
    pendantNoChain;
  return [head, ...delicateRingNegatives, ...GLOBAL_NEGATIVE_TAIL_LINES].join("\n");
}

/** 未传用户 prompt 时的最严默认（仍禁止木道具，避免无关木块） */
export const GLOBAL_NEGATIVE_PROMPT_BLOCK = buildGlobalNegativePromptBlock("");

export function buildRingPhysicalBlock(
  context: "main" | "enhance",
  onModel: boolean
): string {
  const lines = [
    "PHYSICAL PRODUCTION (RING) — manufacturability:",
    "- Inner finger opening rule: keep ONLY the central wearable ring hole (the normal finger passage). Do NOT create any additional cutout/perforation/window on the inner wall of the band.",
    "- Inner band integrity (strict): inner band must be a continuous, smooth, complete closed loop surface with even thickness on the finger-contact side; NO extra holes, NO through-slots, NO carved recess pockets, NO dents, NO concave sink areas, NO inward collapsed patches, NO broken inner rim.",
    "- Inner-contact surface finish (strict): the full 360-degree inner loop that touches finger must be smooth, continuous, mirror-polished, and production-finished (finished jewelry grade).",
    "- Forbidden on inner-contact loop: NO inner dent, NO pit/dimple, NO groove/trench, NO raised bump/ridge, NO sharp inner crease/edge line, NO casting seam, NO inner engraving/text/pattern/filigree.",
    "- Decoration placement rule: decorative motifs/engravings/gem settings are allowed only on outer/top surfaces, never on finger-contact inner loop.",
    "- Shank cross-section: solid metal band with believable thickness and volume — NOT hair-thin wire, NOT paper-thin blade edges.",
    "- Under-gallery / underside comfort rule (strict): NO downward protruding claws, spikes, hooks, or dangling ornamental points below the lower finger-contact contour of the band.",
    "- Wearability lock: the ring underside (palm-facing / finger-contact side) must remain smooth, tucked, and snag-free; avoid any protrusion that would poke, scratch, block finger bending, or catch fabric.",
    "- Silhouette boundary (strict): all decorative mass should stay above or flush with shoulder/upper shank flow; do NOT extend decorative elements beneath the ring's bottom contact envelope.",
  ];
  if (context === "enhance" && onModel) {
    lines.push(
      "- On-model: anatomically correct hand — natural finger joints and proportions; do NOT twist, melt, or extra-digit finger geometry."
    );
  }
  return lines.join("\n");
}

/**
 * 吊坠/项链主图与多视角：3D 体积 + 可直立/不可直立两种合法陈列 + 禁止「图2」式反物理摆法；
 * bail 默认竖直提拉（暗示上方有链、不画链），便于建模与穿链开孔识别。
 * 图1/图2/图3 为内部命名，模型以文字语义执行，不依赖外部图片。
 */
export function buildPendantNecklaceHeroPresentationEnBlock(): string {
  return [
    "**ABSOLUTE — NO CHAIN IN PRODUCT / CAD HERO (non-wearing):** Do **NOT** render necklace chain, cord, string, leather lace, or **any** repeating link pattern (cable, rolo, snake, Figaro, etc.). Do **NOT** show links passing through the bail or entering from the **top** of the frame. The **bail / jump ring** is the **only** upward metal past the motif; above it = **empty backdrop only**. Implied overhead pull is OK; **visible chain is always wrong** for this shot type.",
    "PENDANT / NECKLACE — 3D HERO + PRESENTATION (strict): Every pendant/charm must read as a fully sculpted 3D jewelry mass with believable wall thickness, relief depth, and undercuts — NOT a flat stamped coin, NOT a smooth paper-thin silhouette with no depth.",
    "Rear / back views must still communicate solid volumetric form; forbid a pancake-flat back with zero curvature unless the user explicitly requests that rear style.",
    "PRODUCT + CAD BAIL PRESENTATION (no necklace chain in frame unless on-model): BEFORE locking composition, infer whether this motif can realistically freestand on the tabletop without tipping (stable base / feet / broad bottom).",
    "IF FREESTAND-PLAUSIBLE — use CENTERED UPRIGHT hero (internal style ref: Fig.3): stable floor contact, pendant centered as hero. The **bail + jump ring** must read **upright / vertically tensioned** along the natural stringing axis **as if an overhead chain pulls it straight** — the chain is **implied only** and must **NOT** appear in frame (CAD-friendly connector pose). Keep **solid metal continuity** at the bail junction. **FORBID** a bail **collapsed / fully draped** resting slack on the head or motif like a cushion-loose loop. **FORBID** a bail **floating** with no believable attachment to the topper.",
    "IF NOT FREESTAND-PLAUSIBLE — use LEAN-AGAINST-SUPPORT hero (internal style ref: Fig.1): lean the pendant body against a clear physical backdrop (display box edge, velvet riser, fabric block, jewelry tray wall). Apply the **same upright bail rule** wherever the bail is visible: vertical chain-pull read without drawing chain; body weight reads supported by the lean.",
    "FORBIDDEN WRONG PATTERN (internal style ref: Fig.2): a non-freestanding pendant balanced on a narrow tip/edge/crown with NO lean-support; **body** contact that would obviously topple; **OR** deleting / sealing the bail; **OR** hiding the through-opening needed for stringing.",
  ].join("\n");
}

export function buildPendantPhysicalBlock(onModel: boolean): string {
  const lines = [
    "PHYSICAL PRODUCTION (PENDANT / NECKLACE) — manufacturability:",
    "- Bail / connector: functional bail with a clearly open path for chain (bail hole or slit visibly pass-through); NOT a dead sealed knot, NOT a solid ring with no chain entry.",
  ];
  if (onModel) {
    lines.push(
      "ON-MODEL PENDANT (strict): **ignore** freestanding tabletop / Fig.3 cushion-hero rules for THIS shot — output must match a **worn** necklace/pendant brief (chain allowed, body context). Preserve **SKU topology** (motif, bail, stones) from the init; composition may change to wearing.",
      "- Chain (if visible): natural drape under gravity; individual chain links readable — NOT a single blurry rope or smeared tube."
    );
  } else {
    lines.push(buildPendantNecklaceHeroPresentationEnBlock());
  }
  return lines.join("\n");
}

type PendantOnModelStyleCue =
  | "gothic_dark"
  | "vintage_art"
  | "minimal_modern"
  | "nature_poetic"
  | "cyber_future"
  | "street_unisex";

function inferPendantOnModelStyleCue(prompt: string): PendantOnModelStyleCue {
  const p = prompt.trim().toLowerCase();
  if (!p) return "street_unisex";
  if (/(gothic|暗黑|哥特|黑金|occult|ritual|神秘|符文)/i.test(prompt)) return "gothic_dark";
  if (/(vintage|antique|复古|做旧|新艺术|art nouveau|装饰艺术|art deco)/i.test(prompt)) {
    return "vintage_art";
  }
  if (/(minimal|极简|clean line|几何|现代|modern)/i.test(prompt)) return "minimal_modern";
  if (/(nature|botanical|floral|植物|花|月亮|月相|森系)/i.test(prompt)) return "nature_poetic";
  if (/(cyber|futur|赛博|机甲|数字|科技感)/i.test(prompt)) return "cyber_future";
  return "street_unisex";
}

/**
 * Step2 吊坠/项链穿戴图：固定比例与链条规格约束（用户给定标尺）
 */
export function buildPendantOnModelScaleAndChainBlock(): string {
  return [
    "PENDANT ON-MODEL SCALE + CHAIN SPEC (strict):",
    "Treat the pendant body as a real wearable small piece: target physical height around **2.5 cm** (about 24–27 mm including bail if visible). This is a hard real-world size lock.",
    "Scale correction priority (critical): compared with common over-close outputs, the pendant must read about **1/3 of that oversized visual volume**; keep it clearly visible but much smaller in frame.",
    "Render a **thin silver twisted-rope chain** (fine helix rope texture), not a thick curb/cable chain and not a leather cord.",
    "Real-world proportion lock: pendant should read as a compact chest pendant — roughly thumb-nail to first-finger-segment scale in a neck/collarbone composition, never an oversized talisman filling most of the chest area.",
    "Length/read lock: chain behaves like a normal short necklace drop with natural gravity; pendant sits around upper chest / near collarbone zone, with believable drape tension.",
    "Frame occupancy lock: pendant + bail should usually occupy only about **8%–14% of the full image area** in on-model shots (never dominant center-macro occupancy).",
    "FORBID scale failures: giant pendant hero (4–6+ cm visual read), zoomed-in framing that makes pendant appear unrealistically huge, toy-mini pendant that is barely visible, extra-thick statement chain overpowering the pendant, or chain gauge inconsistent with a fine silver rope chain.",
  ].join("\n");
}

/**
 * Step2 吊坠/项链穿戴图：拍摄距离/角度与着装暴露度约束
 */
export function buildPendantOnModelFramingAndWardrobeBlock(
  wearGender?: "male" | "female" | null
): string {
  const framing = [
    "NECKLACE WEARING CAMERA FRAMING (strict):",
    "Use a clearly pulled-back **small-medium wearing shot** (not macro): include full lower neck + both clavicles + a broader upper-chest window so pendant scale reads naturally as real wearing.",
    "Camera bearing may be true frontal or slight 10°–25° three-quarter side angle; keep pendant clearly readable and centered near chest focal area.",
    "FORBID tight local crop (only a tiny neck patch / pendant-only close-up), and forbid extreme side angle that hides pendant face.",
    "Distance lock (critical): camera should be pulled back enough to show a longer chain path from both neck sides down to pendant; avoid beauty-macro jewelry close-up language.",
    "Composition target: preserve generous breathing room around pendant; chest/neck context must dominate image area rather than pendant metal details.",
  ].join("\n");
  if (wearGender === "female") {
    return [
      framing,
      "WARDROBE (female selected): allow tasteful low-neckline styling for light sensual fashion read; keep it elegant and subtle.",
      "SAFETY: no nipple exposure, no explicit sexual posing, no fetish framing; jewelry remains product hero.",
    ].join("\n");
  }
  if (wearGender === "male") {
    return [
      framing,
      "WARDROBE (male selected): allow upper-chest / clavicle visibility and mild muscle definition to convey strength.",
      "SAFETY: no nipple exposure, no explicit sexual posing, no erotic intent; jewelry remains product hero.",
    ].join("\n");
  }
  return [
    framing,
    "WARDROBE (auto/unisex): clean neckline with moderate chest context and tasteful styling; avoid conservative turtleneck that hides necklace and avoid explicit exposure.",
    "SAFETY: no nipple exposure, no explicit sexual posing.",
  ].join("\n");
}

function buildPendantOnModelWardrobeByStyleCue(
  cue: PendantOnModelStyleCue,
  wearGender?: "male" | "female" | null
): string {
  const isMale = wearGender === "male";
  const isFemale = wearGender === "female";
  const femaleOrAuto = isMale ? false : true;
  if (cue === "gothic_dark") {
    return femaleOrAuto
      ? "Wardrobe match (gothic_dark, female/auto): black or charcoal deep V / square neck knit; minimal cool makeup; no chest prints."
      : "Wardrobe match (gothic_dark, male): black crew or henley, dark gray layer; clean masculine silhouette.";
  }
  if (cue === "vintage_art") {
    return femaleOrAuto
      ? "Wardrobe match (vintage_art, female/auto): cream / ivory / beige vintage blouse or soft square neck; linen or velvet texture hint."
      : "Wardrobe match (vintage_art, male): oatmeal knit or open-collar shirt; warm-neutral retro gentleman casual.";
  }
  if (cue === "minimal_modern") {
    return femaleOrAuto
      ? "Wardrobe match (minimal_modern, female/auto): white / black / gray solid top; no pattern; crisp neckline."
      : "Wardrobe match (minimal_modern, male): solid tee or fine knit; no logo; minimal accessories.";
  }
  if (cue === "nature_poetic") {
    return femaleOrAuto
      ? "Wardrobe match (nature_poetic, female/auto): soft earth-tone cotton / linen round neck; light, not bohemian-layered."
      : "Wardrobe match (nature_poetic, male): olive / sand simple top; relaxed natural posture.";
  }
  if (cue === "cyber_future") {
    return femaleOrAuto
      ? "Wardrobe match (cyber_future, female/auto): dark gray sleek top; cool-tone neckline friendly to metal highlights."
      : "Wardrobe match (cyber_future, male): dark technical-fabric top; sharp lines; no sci-fi clutter.";
  }
  if (isFemale) {
    return "Wardrobe match (street, female): clean white / gray / black tee or fine knit; Etsy everyday editorial.";
  }
  if (isMale) {
    return "Wardrobe match (street, male): neutral contemporary tee / knit; unisex street-commercial.";
  }
  return "Wardrobe match (street, auto — female-biased): clean white / gray / black tee or fine knit; everyday Etsy necklace editorial.";
}

/**
 * Step2 吊坠/项链穿戴图：模特人种池（白人+拉丁/地中海为主）与款式匹配服装
 */
export function buildPendantOnModelCastingAndWardrobeBlock(
  prompt: string,
  wearGender?: "male" | "female" | null
): string {
  const cue = inferPendantOnModelStyleCue(prompt);
  const castingPool = [
    "PENDANT ON-MODEL CASTING (~90% primary pool, strict default):",
    "In roughly **9 out of 10** on-model pendant shots, cast an adult model as **Caucasian (European / North American)** OR **Latino/Latina / Hispanic / Mediterranean–Southern European**.",
    "Caucasian read: fair to light-medium natural skin, believable pores/texture, Western Etsy jewelry e-commerce neck and collarbone proportions.",
    "Latino / Mediterranean read: warm olive, wheat, or light-brown Southern European / Hispanic skin; natural neck/shoulder lines — includes Mediterranean and Latin American casting, not East Asian or South Asian default.",
    "Occasional (~10%): other ethnic presentations are allowed only when the **user prompt explicitly** requests a specific cultural motif or when the SKU narrative clearly demands it — never as the silent default.",
    "Face de-emphasized: prefer chin-to-upper-chest crop; pendant + chain remain the product hero.",
  ].join("\n");

  const genderCasting =
    wearGender === "male"
      ? [
          "GENDER LOCK (user selected male): adult **male** neck / upper chest wearer (strict); masculine posture and wardrobe.",
        ].join("\n")
      : wearGender === "female"
        ? [
            "GENDER LOCK (user selected female): adult **female** neck / upper chest wearer (strict); feminine Etsy on-model necklace presentation.",
          ].join("\n")
        : [
            "GENDER AUTO (Etsy jewelry default): when user did not fix gender, **bias ~70% adult female** wearer — standard for Etsy necklace listings.",
            "Use adult male wearer only when the pendant SKU + user brief clearly read masculine (e.g. heavy chain, biker / dark male gothic cues); still obey the ~90% Caucasian+Latino/Mediterranean casting pool.",
          ].join("\n");

  const wardrobeCommon = [
    "WARDROBE–PENDANT STYLE MATCH (strict): outfit MUST support the inferred pendant style; neckline MUST expose clavicles and full chain path.",
    buildPendantOnModelWardrobeByStyleCue(cue, wearGender),
    "FORBID: turtleneck, scarf, heavy chest layering, large logos/prints, competing necklaces, or wardrobe louder than the pendant.",
    "SAFETY: no nipple exposure, no explicit sexual posing, no fetish framing.",
  ].join("\n");

  return [castingPool, genderCasting, wardrobeCommon].join("\n\n");
}

/**
 * Step2 吊坠/项链穿戴图：按首饰风格自动匹配模特气质
 */
export function buildPendantOnModelStyleAdaptiveBlock(
  prompt: string,
  wearGender?: "male" | "female" | null
): string {
  const cue = inferPendantOnModelStyleCue(prompt);
  const common =
    "MODEL STYLING (adaptive): keep face de-emphasized; prioritize neck/collarbone/chest crop and jewelry readability. Outfit must support pendant style, never overpower it.";
  const genderLine = (wearGender?: "male" | "female" | null): string => {
    if (wearGender === "male") {
      return "Gender fit (male selected): use a masculine neck/shoulder styling read (wardrobe and posture), avoid feminine-heavy makeup/accessory language.";
    }
    if (wearGender === "female") {
      return "Gender fit (female selected): use a feminine neck/shoulder styling read (wardrobe and posture), keep elegance and product clarity.";
    }
    return "Gender fit (auto): Etsy necklace default — **female-biased** styling (~70%); neutral-commercial when male is chosen for the SKU.";
  };
  if (cue === "gothic_dark") {
    return [
      common,
      genderLine(wearGender),
      "Style cue = gothic_dark: choose an edgy model vibe (cool expression, darker wardrobe such as charcoal/black, subtle dramatic contrast), while keeping skin and jewelry realistic.",
      "Tattoo allowance (occasional, sparse): optionally include at most one small subtle tattoo element near neck/collarbone/wrist area; never dense sleeves or large high-contrast tattoo blocks.",
      "Avoid heavy props/makeup blocking pendant visibility; keep visual mood dark-clean, not horror cosplay.",
    ].join("\n");
  }
  if (cue === "vintage_art") {
    return [
      common,
      genderLine(wearGender),
      "Style cue = vintage_art: choose elegant retro model styling (soft classic wardrobe texture, refined posture, calm premium mood).",
      "Keep palette restrained and warm-neutral so silver pendant detail remains clear.",
    ].join("\n");
  }
  if (cue === "minimal_modern") {
    return [
      common,
      genderLine(wearGender),
      "Style cue = minimal_modern: choose clean modern model styling (simple monochrome top, minimal accessories, crisp lighting).",
      "No busy patterns near neckline; keep commercial editorial cleanliness.",
    ].join("\n");
  }
  if (cue === "nature_poetic") {
    return [
      common,
      genderLine(wearGender),
      "Style cue = nature_poetic: choose gentle natural model styling (soft fabric, natural posture, light airy mood) while preserving product sharpness.",
      "Avoid bohemian over-layering that hides chain/pendant proportions.",
    ].join("\n");
  }
  if (cue === "cyber_future") {
    return [
      common,
      genderLine(wearGender),
      "Style cue = cyber_future: choose futuristic model styling (sleek silhouette, controlled cool-toned lighting accents, modern technical wardrobe hints).",
      "Keep composition product-led: no heavy sci-fi scene clutter.",
    ].join("\n");
  }
  return [
    common,
    genderLine(wearGender),
    "Style cue = street_unisex: choose neutral contemporary model styling suitable for broad unisex market (clean tee/knit, natural pose, balanced contrast).",
    "Keep pendant as hero; avoid loud brand prints and distracting accessories.",
  ].join("\n");
}

export function buildMaterialLightingBlock(
  promptLower: string,
  isSterling925: boolean,
  /** 穿戴图若仍写「macro product」会强烈把模型拉回台面静物，必须与 on-model 分支区分 */
  context: "product_table" | "on_model" = "product_table",
  /**
   * Step3 `/api/enhance` img2img：主图已定影调与做旧层次，若仍套 Step1 的「高抛光银」等默认，
   * 模型常把多视角拉成发灰、低对比的「目录片」——此处改为跟随 init 的材质读法。
   */
  forEnhanceFromInit = false
): string {
  const wantsVintageOxidized = /(oxid|oxidized|patina|vintage|antique|gothic|做旧|复古|暗黑)/i.test(
    promptLower
  );
  const lensLine =
    context === "on_model"
      ? "editorial on-model jewelry photography: believable hand skin + ring metal; sharp focus on the worn piece; natural subsurface scatter on skin — NOT a tabletop macro packshot with no wearer."
      : forEnhanceFromInit
        ? "macro product photography **in the same lighting/color family and white balance as the init reference**; sharp focus on fine metal texture; preserve highlight **character** and shadow depth from the hero frame — **do not** add yellow/amber warmth beyond the init."
        : "macro product photography; sharp focus on fine metal texture;";
  const lines = [
    "MATERIAL & LIGHTING (reject plastic / toy look):",
    lensLine,
    "crisp specular highlights and ray-tracing-like realistic reflections.",
    "Gemstone: use prong setting OR bezel setting where appropriate; stone must appear mechanically seated in metal — NO floating stone detached from metal.",
    "Avoid: plastic sheen, flat ambient-only lighting, dull gray paste metal.",
  ];
  if (forEnhanceFromInit) {
    lines.push(
      "Corrosion / dirt negatives apply only to **new artifacts** — do NOT remove intentional dark oxidation in grooves or patina that already reads in the init."
    );
  } else {
    lines.push(
      wantsVintageOxidized
        ? "If antique/oxidized style is requested: oxidation must be controlled and intentional only in recesses; no dirty rust-like blotches, no peeling, no random discoloration."
        : "Metal finish must be clean and production-grade: no rust, no corrosion, no random oxidation stains, no faded/patchy plating, no dirty discoloration."
    );
  }
  const silverish =
    isSterling925 || /silver|sterling|银/.test(promptLower);
  if (silverish) {
    if (!forEnhanceFromInit && wantsVintageOxidized) {
      lines.push(
        "Silver: believable oxidized / antiqued recesses with controlled bright highlights on raised metal (where style fits)."
      );
    } else if (!forEnhanceFromInit) {
      lines.push(
        "Silver: high-polish sterling with clean specular ribbons and realistic micro-reflections."
      );
    }
  }
  return lines.join("\n");
}

/** Step3 enhance：强制多视角与主图同套影调，避免软限制里的「棚拍默认」冲淡 init。 */
export function buildEnhanceInitToneLockBlock(onModel: boolean): string {
  if (onModel) {
    return [
      "INIT TONE HARMONY (on-model Step3): keep **SKU metal hue, stone saturation, and overall contrast** consistent with the init reference; avoid milky global haze or desaturation vs the hero.",
    ].join("\n");
  }
  return [
    "INIT PHOTOMASTER MATCH (table / box Step3 — absolute): The init defines the **target grade**. **Lock** exposure, white balance, saturation, shadow depth, highlight rolloff, and background/cushion/fabric hue **exactly as in the init** so this reads as **the same photo session** as the hero — **only** the camera bearing changes.",
    "METAL / PATINA: match the init's **exact** metal read (including dark recess oxidation, brushed vs polish mix, micro-contrast). FORBID re-grading into flat neutral gray, low-contrast \"AI packshot\", forced mirror polish upgrade, or **brassy / yellow-tinted silver**.",
    "GEMS / PEARLS / ACCENTS: keep **hue and saturation** aligned with the init — no pastel washing, no gray veil over pinks or moonstones, **no global yellowing** of stones.",
    "FORBID beauty-filter haze, global lift that crushes mood, or arbitrary warm relights (yellow/amber cast, tungsten shift, yellower wood/velvet than init). FORBID \"clean up\" relights that dull the piece vs the main view.",
  ].join("\n\n");
}

export function buildMainImageCompositionBlock(
  kind: JewelryProductKind,
  prompt: string
): string {
  const hasAnimalMotif =
    /(lion|tiger|wolf|eagle|snake|dragon|cat|dog|owl|phoenix|动物|兽首|狮|虎|狼|鹰|蛇|龙|猫|狗|猫头鹰|凤凰)/i.test(
      prompt
    );
  const customEnv = userExplicitEnvironmentOrSurfaceInPrompt(prompt);
  const dark = userRequestedDarkBackground(prompt);
  const bgLine = customEnv
    ? "Background & environment (strict — honor user text): Implement EXACTLY what the user wrote for surface/table/material (e.g. dark aged oak tabletop, deep readable wood grain), lighting (e.g. soft natural light, macro front close-up), and atmosphere. Do NOT replace with default seamless #F5F5F5 or plain white studio sweep when the user specified wood, stone, fabric, or a real surface. User-requested grain direction / texture must be visible and credible. If the user asks the ring silhouette to echo grain flow, compose so curves and grain feel visually related."
    : dark
      ? "Background: honor user's explicit dark / black / dramatic intent; keep subject edge separation clear."
      : "Background: default seamless studio #F5F5F5 or pure white (#FFFFFF) — do NOT default to near-black gray that collapses metal read; only go dark if the user's prompt clearly asks for black or black-gold mood.";

  const lines = [
    "COMPOSITION (e-commerce hero):",
    "SINGLE FRAME ONLY (strict): output exactly ONE continuous photograph — ONE hero shot per image. NO grid, NO collage, NO split screen, NO multi-panel layout, NO tiled quadrants, NO 2x2 / 3x3 / storyboard, NO contact sheet, NO diptych/triptych, NO white divider lines boxing multiple sub-images; do NOT pack several product variants into one canvas.",
    buildSingleJewelryPieceOnlyConstraintBlock(),
    "Single SKU centered, isolated on backdrop — no jewelry sets, no extra SKU props; if user mentions earrings or other categories but this task is a single ring or single pendant hero, ignore unrelated categories.",
    bgLine,
  ];
  if (kind === "ring") {
    lines.push(
      "STEP1 RING DISPLAY ANGLE (strict — e-commerce hero): mimic premium catalog jewelry: ring STANDS UPRIGHT on the band on the surface, OR a clean flat lay where the TOP decorative plane of the ring faces the camera (face-up). Camera at moderate height (not a low grazing angle along the shank). Soft subtle contact shadow under the ring for grounding."
    );
    lines.push(
      "FORBID side-dominant shots like reference BAD examples: do NOT show the ring lying on its SIDE with only band thickness / shank profile visible; do NOT use a low horizontal grazing angle that emphasizes the ring edge and hides the top motif; do NOT frame the hero as a pure side profile or three-quarter that loses the frontal read of the centerpiece."
    );
    lines.push(
      "REQUIRE: the decorative top face (animal head, stones, filigree) must be the primary visual read — front-facing or slight elevated 3/4 (similar to a standing upright ring product shot), NOT shank-first or band-edge-first."
    );
    lines.push(
      "VIEWPOINT CONSISTENCY LOCK (strict): apply ONE coherent camera perspective to the ENTIRE ring. The hero motif orientation and the band orientation must agree in the same view family. Forbidden: motif near-frontal while the ring body remains side-profile, or any contradictory mixed-angle composite look."
    );
    lines.push(
      "Geometry realism lock (strict): preserve natural ring circular/elliptical continuity and physically plausible mass flow; forbid twisted/warped/shrunk ring body created by forcing a frontal motif onto a side-view ring."
    );
    if (hasAnimalMotif) {
      lines.push(
        "ANIMAL-HEAD RING DISPLAY (strict): hero composition must present the animal head as the primary frontal focal point (similar to a straight hero view), with facial features clearly visible and centered; avoid side-biased angle where only the ring shank dominates."
      );
      lines.push(
        "Animal vitality (strict): expression and sculpting must feel alive and spirited — clear eye focus, subtle facial tension, natural organic rhythm in fur/feather/scale flow; avoid blank, dull, stiff, or emotionless face treatment."
      );
      lines.push(
        "Do NOT crop or hide the animal face; keep eyes/nose/mane (or equivalent key facial structures) readable, symmetric, and visually dominant over decorative side engravings."
      );
      lines.push(
        "Head orientation lock (strict): the animal face must point toward the camera in a near-frontal view (front-facing or slight 10-15 degree turn max). Reject profile/side-face direction where one side of the face is dominant."
      );
      lines.push(
        "Forbidden framing for animal-head ring hero: side profile ring showcase, rotated shank-first angle, or back-of-head emphasis."
      );
      if (userWantsDelicateThinWomensRing(prompt)) {
        const tier = getRingMotifShankScaleTier(prompt);
        const ratio =
          tier === "ultra-thin"
            ? "1.2–1.6× shank width"
            : "1.2–1.8× shank width";
        lines.push(
          `Delicate ring override: animal readable and frontal; motif footprint ~${ratio} max with smooth shoulder integration; FORBID center-heavy 'big middle, thin sides' composition.`
        );
      }
    }
  } else {
    lines.push(
      customEnv
        ? "Pendant framing (Step1 only): show pendant body + bail on the user-described surface/environment (do not ignore wood/stone/fabric)."
        : "Pendant framing (Step1 only): show pendant body + bail in a clean flat-lay / studio hero setup."
    );
    lines.push(
      "STEP1 PENDANT DISPLAY ANGLE (strict): front-facing or slight 3/4 toward camera so motif and stones read clearly; FORBID thin edge-only profile, side-only silhouette, or low grazing angles that hide the main face (same intent as upright ring hero — readable front, not side-only)."
    );
    lines.push(buildPendantNecklaceHeroPresentationEnBlock());
  }
  return lines.join("\n");
}

/**
 * 用户是否在「参考图精修」：移除/保留镶石、改浮雕等，而非从零设计。
 * 此类请求应优先服从用户原文，避免英文 creative expansion 反向加石。
 */
export function userPromptIsReferenceEditInstruction(prompt: string): boolean {
  const t = prompt.trim();
  if (!t) return false;
  const editVerb =
    /(?:移除|删除|去掉|取消|改为|改成|修改为|更换为|仅保留|保留|不要|不得|禁止)/.test(t);
  const scopeCue =
    /(?:参考|如图|原图|同款|比例|造型|外框|浮雕|镶|锆|宝石|密镶|碎钻|翅膀|月牙|吊坠)/.test(t);
  return editVerb && scopeCue;
}

/** 参考图精修：短约束块，用户中文指令为最高优先级 */
export function buildReferenceEditInstructionBlock(refCount: number, prompt: string): string {
  const kind = inferJewelryProductKind(prompt);
  const kindCn = kind === "pendant" ? "吊坠" : "戒指";
  return [
    `【参考图精修 — ${refCount} 张】`,
    `任务类型：在参考图${kindCn}上做定向修改，不是重新设计全新款式。`,
    "优先级（strict）：用户下列中文修改说明 > 参考图结构 > 任何风格扩写；不得违背用户「移除/仅保留 N 颗」等数量与位置要求。",
    "结构：保持参考图整体比例、轮廓与拓扑，仅按用户说明改镶石区域与表面工艺。",
    "宝石（strict）：全件可见镶嵌宝石总共不超过 6 颗、颜色不超过 3 种；若用户写明具体颗数与位置（如外框 4 颗），必须严格遵守，禁止额外加石。",
    "禁止：成片/成行/成带密排镶、凹槽内连续小颗镶、花瓣/表面碎钻铺满；禁止密镶、满镶、满天星式点缀。",
    kind === "pendant"
      ? "吊坠主图：仅吊坠本体+吊环，禁止出现项链链条。"
      : "戒指主图：单枚戒指，戒圈内侧平顺可戴。",
    "用户修改说明（必须落实）：",
    prompt.trim(),
  ].join("\n");
}

/** 精修模式下的精简生产约束（避免超长 prompt 触发上游失败） */
export function buildCompactRefEditProductionLimits(
  kind: JewelryProductKind,
  prompt: string
): string {
  return [
    buildZirconInlayAiColorMatchBlock(prompt, kind),
    buildGlobalNegativePromptBlock(prompt, { pendantProductNoChain: kind === "pendant" }),
    kind === "pendant"
      ? "PENDANT FINAL: no necklace chain in frame; bail upright only."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Step1 有参考图时的融合权重与草图/竞品说明 */
export function buildReferenceFusionBlock(refCount: number, prompt: string): string {
  if (refCount <= 0) return "";
  const lines = [
    `【参考图 — ${refCount} 张】`,
    "Structure from reference, look from text: preserve exact geometry, silhouette, and topology from reference image(s); apply material, finish, patina, and lighting from the TEXT prompt.",
    "Multiple references: synthesize into ONE manufacturable piece; never a collage of separate products; text prompt wins conflicts on style.",
    "Theme-first fusion (strict): identify one primary design theme from the user prompt, then integrate reference elements as supporting motifs; do NOT stack all optional elements equally.",
    "Composition hierarchy (strict): establish clear primary/secondary/tertiary visual roles. Keep one dominant focal narrative, and merge other elements only if they reinforce that narrative.",
  ];
  if (/(sketch|hand-?drawn|line art|草图|手绘)/i.test(prompt)) {
    lines.push(
      "Hand-drawn / sketch reference: convert to photoreal 3D product render with jewelry-grade smooth surfaces and clean edges."
    );
  }
  lines.push(
    "If reference looks like third-party catalog shots: strip watermark, logo, and brand text; keep only the jewelry design vocabulary."
  );
  if (inferJewelryProductKind(prompt) === "pendant") {
    lines.push(
      "PENDANT / NECKLACE — REFERENCE OVERRIDE (strict): reference images may show a **real worn chain**; for this **product / CAD hero** you must **NOT copy or render any chain**. Reconstruct **pendant body + bail only**; bail **upright / plumb** as if pulled by off-camera tension. **FORBID** chain links, cord, or repeated links through the bail or dropping from the **top** of the frame — even if the reference clearly shows them."
    );
  }
  return lines.join("\n");
}

/** Step3 增强：每条视角后统一追加（物理 + 材质 + 负面） */
export function buildEnhanceSoftLimitSuffix(
  prompt: string,
  kind: JewelryProductKind,
  onModel: boolean
): string {
  const pl = prompt.toLowerCase();
  const is925 = /(925|sterling silver|sterling)/.test(pl);
  const physical =
    kind === "ring"
      ? buildRingPhysicalBlock("enhance", onModel)
      : buildPendantPhysicalBlock(onModel);
  const delicateRingBalance =
    kind === "ring" ? buildDelicateRingMotifScaleIntegrationBlock(prompt) : "";
  const toneLock = buildEnhanceInitToneLockBlock(onModel);
  const core = [
    physical,
    delicateRingBalance,
    buildMaterialLightingBlock(pl, is925, onModel ? "on_model" : "product_table", true),
    buildGlobalNegativePromptBlock(prompt, {
      onModel,
      pendantProductNoChain: !onModel && kind === "pendant",
    }),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (onModel) {
    return (
      core +
      "\n\nFINAL PRIORITY (on-model): If any line above conflicts with **visible human wearing context** (hand/finger or neck+chest+chain) while keeping the **SKU** from the init, **wearing wins** over generic tabletop / macro-packshot phrasing." +
      "\n\n" +
      toneLock
    );
  }
  if (kind === "pendant") {
    return (
      core +
      "\n\nFINAL PRIORITY (pendant product / table angles): **no visible necklace chain** — not through bail, not from frame top, not partial crop. **Bail-only** upper termination; upright bail OK; **do not** recreate chain from init/reference pixels unless the user text explicitly demands **on-body wearing** for this shot." +
      "\n\n" +
      toneLock
    );
  }
  return core + "\n\n" + toneLock;
}
