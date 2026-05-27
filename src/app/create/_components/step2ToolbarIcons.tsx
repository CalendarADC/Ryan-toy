/** Step2/Step3 共用：`public/icons/step2-*.png` */

export function IconStep2Favorites({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step2-favorites.png"
      alt=""
      width={18}
      height={18}
      decoding="async"
      draggable={false}
      className={["pointer-events-none h-[18px] w-[18px] shrink-0 object-contain select-none", className].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}

export function IconStep2History({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step2-history.png"
      alt=""
      width={18}
      height={18}
      decoding="async"
      draggable={false}
      className={["pointer-events-none h-[18px] w-[18px] shrink-0 object-contain select-none", className].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}

export function IconStep2SelectAll({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step2-select-all.png"
      alt=""
      width={18}
      height={18}
      decoding="async"
      draggable={false}
      className={["pointer-events-none h-[18px] w-[18px] shrink-0 object-contain select-none", className].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}

/** 复用 Step1 预设齿轮图标：`public/icons/step1-preset.png` */
export function IconStep1PresetGear({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step1-preset.png"
      alt=""
      width={18}
      height={18}
      decoding="async"
      draggable={false}
      className={["pointer-events-none h-[18px] w-[18px] shrink-0 object-contain select-none", className].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}

/** 复用 Step1 生成按钮图标：`public/icons/step1-sparkles.png` */
export function IconStep1Sparkles({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step1-sparkles.png"
      alt=""
      width={18}
      height={18}
      decoding="async"
      draggable={false}
      className={["pointer-events-none h-[18px] w-[18px] shrink-0 object-contain select-none", className].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}

/** Step4 历史档案入口：简约“档”字 icon。 */
export function IconArchiveFile({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={[
        "pointer-events-none inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-[#2f2a23] bg-white text-[10px] font-semibold leading-none text-[#2f2a23] shadow-[inset_0_0_0_1px_rgba(47,42,35,0.04)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      档
    </span>
  );
}
