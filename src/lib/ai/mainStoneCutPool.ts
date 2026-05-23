import {
  resolveStep1StyleOptionByLabelOrId,
  styleLabelById,
  type Step1StyleOption,
} from "@/lib/step1/step1StyleOptions";

export type MainStoneCutStyleRow = {
  styleId: string;
  primary: string;
  secondary: string;
  avoid: string;
  rationale: string;
};

export type MainStoneCutFusionRow = {
  styleIds: [string, string];
  primary: string;
  secondary: string;
  note: string;
};

export const MAIN_STONE_CORE_CUT_NAMES = [
  "圆形",
  "椭圆形",
  "梨形",
  "马眼形",
  "枕形",
  "祖母绿形",
  "阿斯切",
  "雷地恩",
  "公主方",
  "长阶梯形",
  "三角形",
  "风筝形",
  "六边形",
  "梯形",
  "玫瑰切",
  "蛋面",
  "棺材形",
] as const;

export const MAIN_STONE_CUT_BY_STYLE: MainStoneCutStyleRow[] = [
  { styleId: "gothic", primary: "风筝形、马眼形、三角形", secondary: "梨形、六边形、棺材形", avoid: "圆形、心形", rationale: "尖角和纵向张力强，更贴合暗黑/宗教叙事。" },
  { styleId: "celtic", primary: "梨形、马眼形、三角形", secondary: "椭圆形、祖母绿形", avoid: "公主方、心形", rationale: "结纹与符号多弧线和尖端，适配拉长切工。" },
  { styleId: "artNouveau", primary: "马眼形、梨形、椭圆形", secondary: "蛋面（椭圆/梨形）、玫瑰切", avoid: "公主方、阿斯切", rationale: "有机流线与花叶语法，偏柔性曲线切工。" },
  { styleId: "mementoMori", primary: "蛋面椭圆、玫瑰切、老矿切/枕形", secondary: "祖母绿形、老欧切", avoid: "雷地恩、公主方", rationale: "历史语境偏古切，火彩克制更高级。" },
  { styleId: "steampunk", primary: "祖母绿形、六边形、三角形", secondary: "风筝形、长阶梯形", avoid: "心形、圆形", rationale: "机械几何感强，优先棱线与阶梯切。" },
  { styleId: "brutalist", primary: "祖母绿形、阿斯切、梯形", secondary: "长阶梯形、雷地恩", avoid: "梨形、心形", rationale: "建筑体块和刀削面，更适合 step-cut 语言。" },
  { styleId: "baroque", primary: "梨形、椭圆形、枕形", secondary: "马眼形、蛋面", avoid: "阿斯切、梯形", rationale: "戏剧化但曲线主导，宜饱满体量。" },
  { styleId: "rococo", primary: "马眼形、梨形、椭圆形", secondary: "枕形、玫瑰切", avoid: "祖母绿形、阿斯切", rationale: "卷草与 S 曲线强，长水滴/马眼更融合。" },
  { styleId: "artDeco", primary: "祖母绿形、阿斯切、长阶梯形", secondary: "三角形、雷地恩", avoid: "蛋面、自由形", rationale: "几何对称 + 建筑线条，step-cut 为核心。" },
  { styleId: "avantGarde", primary: "风筝形、六边形、三角形", secondary: "非对称梨形、自由形", avoid: "仅经典圆形", rationale: "可大胆轮廓，但必须保留可佩戴连接逻辑。" },
  { styleId: "boho", primary: "蛋面椭圆、蛋面梨形、椭圆形", secondary: "自由形蛋面、马眼形", avoid: "阿斯切、梯形", rationale: "自然手工气质优先，少用过硬几何。" },
  { styleId: "edwardian", primary: "老欧切（圆）、椭圆形、枕形", secondary: "梨形、马眼形", avoid: "梯形、棺材形", rationale: "蕾丝感与铂金语法更配古典轮廓。" },
  { styleId: "midCentury", primary: "阿斯切、祖母绿形、椭圆形", secondary: "马眼形、长阶梯形", avoid: "心形、自由形蛋面", rationale: "50s-60s 现代几何，线条干净利落。" },
  { styleId: "minimalist", primary: "祖母绿形、椭圆形、圆形", secondary: "阿斯切、梨形", avoid: "复杂幻想切工", rationale: "一眼可识别主石，干净轮廓优先。" },
  { styleId: "victorian", primary: "老矿切/枕形、椭圆形、梨形", secondary: "老欧切、马眼形", avoid: "过硬锐角切工", rationale: "浪漫历史感导向，柔轮廓更稳。" },
];

export const MAIN_STONE_CUT_FUSION_RULES: MainStoneCutFusionRow[] = [
  { styleIds: ["artDeco", "brutalist"], primary: "祖母绿形 / 阿斯切", secondary: "长阶梯形、梯形", note: "都偏建筑几何，统一 step-cut 语言。" },
  { styleIds: ["rococo", "artNouveau"], primary: "马眼形 / 梨形", secondary: "椭圆形、玫瑰切", note: "曲线优先，避免过硬方正切工。" },
  { styleIds: ["gothic", "victorian"], primary: "马眼形 / 枕形", secondary: "梨形、玫瑰切", note: "保暗黑叙事同时加历史感。" },
  { styleIds: ["celtic", "steampunk"], primary: "六边形 / 三角形", secondary: "风筝形、祖母绿形", note: "符号感与机械感用棱线切工统一。" },
  { styleIds: ["minimalist", "midCentury"], primary: "祖母绿形 / 椭圆形", secondary: "阿斯切、圆形", note: "先保干净轮廓，再引入少量复古几何。" },
  { styleIds: ["boho", "artNouveau"], primary: "蛋面椭圆 / 蛋面梨形", secondary: "马眼形、自由形", note: "自然流动优先，减少镜面感过强切工。" },
];

const STYLE_ROW_BY_ID = new Map(MAIN_STONE_CUT_BY_STYLE.map((r) => [r.styleId, r]));

function resolveStyleKeys(styleKeys: string[]): Step1StyleOption[] {
  const seen = new Set<string>();
  const out: Step1StyleOption[] = [];
  for (const key of styleKeys) {
    const opt = resolveStep1StyleOptionByLabelOrId(key);
    if (!opt || seen.has(opt.id)) continue;
    seen.add(opt.id);
    out.push(opt);
  }
  return out;
}

function formatStyleRow(row: MainStoneCutStyleRow, label: string): string {
  return `${label}｜主选：${row.primary}｜备选：${row.secondary}｜慎用：${row.avoid}`;
}

function findFusionRulesForStyles(styles: Step1StyleOption[]): MainStoneCutFusionRow[] {
  if (styles.length < 2) return [];
  const ids = new Set(styles.map((s) => s.id));
  return MAIN_STONE_CUT_FUSION_RULES.filter((rule) => {
    const [a, b] = rule.styleIds;
    return ids.has(a) && ids.has(b);
  });
}

export function buildMainStoneCutExpandSystemBlock(styleKeys: string[] = []): string {
  const resolved = resolveStyleKeys(styleKeys);
  const poolLines = MAIN_STONE_CUT_BY_STYLE.map((row) =>
    formatStyleRow(row, styleLabelById(row.styleId))
  );
  const fusionHits = findFusionRulesForStyles(resolved);
  const fusionLines = fusionHits.map((rule) => {
    const a = styleLabelById(rule.styleIds[0]);
    const b = styleLabelById(rule.styleIds[1]);
    return `${a} + ${b} → 优先 ${rule.primary}；次选 ${rule.secondary}（${rule.note}）`;
  });
  const focusLines =
    resolved.length > 0
      ? resolved
          .map((opt) => {
            const row = STYLE_ROW_BY_ID.get(opt.id);
            return row ? `- ${formatStyleRow(row, opt.label)}` : `- ${opt.label}`;
          })
          .join("\n")
      : "";

  return [
    "=== 主石切工（硬性 — 与风格语法一致）===",
    "正文须为主石写明一种切工中文名（须来自下方词表），并与设计风格的线条/体量/时代气质匹配；禁止无依据默认「圆形主石」。",
    "主石描述建议写法：「爪镶/包镶/钉镶 + 商品色锆 + 切工 + 主石 + 颗数」，如「爪镶香槟锆马眼形主石 1 颗」。",
    "",
    "【应用规则 — 必须遵守】",
    "1) 单风格：从该风格「主选」池取 1 种主切工写入正文。",
    "2) 多风格：按主风格约 70% + 辅风格约 30% 权重决定主切工；若命中下方混搭表则优先遵循混搭表。",
    "3) 全文固定 1 种主石切工，至多再写 1 种副石/点缀切工；禁止同段堆砌 3 种以上不同切工名。",
    "4) 戒指优先纵向中心锚点切工（马眼、梨形、风筝形等）；吊坠可适度放宽体量与轮廓自由度。",
    "5) 先定主石切工再写配石；配石切工不得落在该风格「慎用」列表内。",
    "",
    ...(focusLines ? ["【本次已选风格 — 优先遵循】", focusLines, ""] : []),
    ...(fusionLines.length ? ["【本次命中风格混搭 — 优先切工】", ...fusionLines, ""] : []),
    "【15 风格 → 主石切工池】",
    ...poolLines,
    "",
    "【6 组常见风格混搭 → 优先主切工】",
    ...MAIN_STONE_CUT_FUSION_RULES.map((rule) => {
      const a = styleLabelById(rule.styleIds[0]);
      const b = styleLabelById(rule.styleIds[1]);
      return `${a} + ${b} → ${rule.primary}；次选 ${rule.secondary}（${rule.note}）`;
    }),
    "",
    `【可用切工词表（${MAIN_STONE_CORE_CUT_NAMES.length} 项）】`,
    MAIN_STONE_CORE_CUT_NAMES.join("、"),
  ].join("\n");
}

export function getMainStoneCutRowForStyle(styleId: string): MainStoneCutStyleRow | undefined {
  return STYLE_ROW_BY_ID.get(styleId);
}
