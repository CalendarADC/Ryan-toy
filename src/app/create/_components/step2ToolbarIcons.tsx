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

/** Step4 历史档案入口：`public/icons/step4-archive.png` */
export function IconArchiveFile({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step4-archive.png"
      alt=""
      width={18}
      height={18}
      decoding="async"
      draggable={false}
      className={[
        "pointer-events-none h-[18px] w-[18px] shrink-0 object-contain select-none invert",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    />
  );
}
