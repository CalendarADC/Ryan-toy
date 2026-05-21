export type Step1StyleOption = {
  id: string;
  label: string;
  labelEn: string;
  desc: string;
};

/** Step1 风格参考：15 项（3×5），与风格按钮 / 预设向导共用 */
export const STEP1_STYLE_OPTIONS: Step1StyleOption[] = [
  { id: "gothic", label: "哥特风", labelEn: "Gothic", desc: "暗黑、尖拱、神秘、宗教、冷峻、骨感、戏剧张力" },
  { id: "celtic", label: "凯尔特 / 北欧", labelEn: "Celtic & Norse", desc: "结纹、符文、自然、图腾、复古、原始力量、螺旋缠绕" },
  { id: "artNouveau", label: "新艺术", labelEn: "Art Nouveau", desc: "流动曲线、植物藤蔓、柔美、自然主义、浪漫、优雅韵律" },
  {
    id: "mementoMori",
    label: "维多利亚哀悼风",
    labelEn: "Memento Mori",
    desc: "死亡意象、暗黑浪漫、复古、忧郁、骷髅 / 棺木符号、黑色与珍珠",
  },
  { id: "steampunk", label: "蒸汽朋克", labelEn: "Steampunk", desc: "齿轮、黄铜、维多利亚复古、机械、工业革命、奇幻复古未来" },
  { id: "brutalist", label: "粗野主义", labelEn: "Brutalist", desc: "原始、几何、厚重、硬朗、无修饰、工业感、力量感" },
  { id: "baroque", label: "巴洛克", labelEn: "Baroque", desc: "华丽、繁复、动态、戏剧、奢华、光影强烈、夸张张力" },
  { id: "rococo", label: "洛可可", labelEn: "Rococo", desc: "柔美、轻盈、细腻、曲线、粉彩、装饰性极强、贵族浪漫" },
  { id: "artDeco", label: "装饰艺术风格", labelEn: "Art Deco", desc: "几何、对称、金属光泽、奢华、摩登复古" },
  { id: "avantGarde", label: "先锋派 / 前卫风格", labelEn: "Avant-garde", desc: "打破常规、实验性、反传统、大胆、未来感" },
  { id: "boho", label: "波西米亚 / 嬉皮风", labelEn: "Boho & Hippie", desc: "自由、民族纹样、流苏、自然材质、随性浪漫" },
  { id: "edwardian", label: "爱德华时代风", labelEn: "Edwardian", desc: "柔美蕾丝、轻古典、优雅精致、浪漫复古、克制奢华" },
  {
    id: "midCentury",
    label: "中世纪现代风",
    labelEn: "Mid-century",
    desc: "简约线条、有机几何、自然材质、实用主义、复古现代",
  },
  { id: "minimalist", label: "极简主义", labelEn: "Minimalist", desc: "少即是多、线条干净、无多余装饰、几何基础、克制留白" },
  { id: "victorian", label: "维多利亚风", labelEn: "Victorian", desc: "繁复蕾丝、复古宫廷、浪漫优雅、珍珠与浮雕、古典精致" },
];

const VALID_STYLE_ID_SET = new Set(STEP1_STYLE_OPTIONS.map((s) => s.id));

export function isValidStep1StyleId(id: string): boolean {
  return VALID_STYLE_ID_SET.has(id);
}

/** 过滤已下架风格（如工艺美术运动、拜占庭），兼容旧预设数据 */
export function sanitizeStep1StyleIds(styleIds: string[]): string[] {
  return styleIds.filter((id) => VALID_STYLE_ID_SET.has(id));
}

export function styleLabelById(id: string): string {
  return STEP1_STYLE_OPTIONS.find((s) => s.id === id)?.label ?? id;
}

export function resolveStep1StyleOptionByLabelOrId(key: string): Step1StyleOption | undefined {
  const t = key.trim();
  if (!t) return undefined;
  return (
    STEP1_STYLE_OPTIONS.find((s) => s.id === t) ||
    STEP1_STYLE_OPTIONS.find((s) => s.label === t) ||
    STEP1_STYLE_OPTIONS.find((s) => s.labelEn === t)
  );
}

/** 供 Step1 灯泡扩写：把所选风格转为「须用形态语言体现」的语义约束，而非套话标签 */
export function buildStep1ExpandStyleGuidanceBlock(styleKeys: string[]): string {
  if (!styleKeys.length) return "";
  const lines = [
    "用户已选风格（须在扩写正文中用造型、线条、纹样、比例、负空间与工艺气质体现；禁止仅罗列风格名或套用「XX风格，设计主体是…」旧模板）：",
  ];
  for (const key of styleKeys) {
    const opt = resolveStep1StyleOptionByLabelOrId(key);
    if (opt) {
      lines.push(
        `- ${opt.label}：${opt.desc}（把上述特征写进对主体元素与戒/坠结构的可见描述，勿单独堆「${opt.label}风格」口号）`
      );
    } else {
      lines.push(`- ${key}`);
    }
  }
  return lines.join("\n");
}
