"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import BrandButton from "./BrandButton";
import Step1ElementPoolEditor from "./Step1ElementPoolEditor";
import Step1StyleMenuOption from "./Step1StyleMenuOption";
import {
  DICE_STRENGTH_OPTIONS,
  DESIGN_OBJECT_OPTIONS,
  MATERIAL_OPTIONS,
  RING_SIZE_ADAPTATION_OPTIONS,
  ringSizeAdaptationsLabel,
  type Step1DiceStrength,
  type Step1DesignObject,
  type Step1Material,
  type Step1Preset,
  type Step1RingSizeAdaptation,
  formatElementPool,
  parseElementPoolInput,
} from "@/lib/step1/step1Presets";
import { STEP1_STYLE_OPTIONS } from "@/lib/step1/step1StyleOptions";

export type Step1PresetWizardSavePayload = {
  id?: string;
  name: string;
  elements: string[];
  styleIds: string[];
  designObject: Step1DesignObject;
  materials: Step1Material[];
  ringSizeAdaptations: Step1RingSizeAdaptation[];
  diceStrength: Step1DiceStrength;
};

export type Step1PresetWizardProps = {
  open: boolean;
  mode: "create" | "edit";
  initial?: Step1Preset | null;
  onClose: () => void;
  onSave: (payload: Step1PresetWizardSavePayload) => void;
};

const WIZARD_STEPS = ["元素池", "风格", "设计对象", "材质", "戒指尺寸适配", "骰子强度", "确认"] as const;

export default function Step1PresetWizard({ open, mode, initial, onClose, onSave }: Step1PresetWizardProps) {
  const [step, setStep] = useState(0);
  const [elementRaw, setElementRaw] = useState("");
  const elementTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [styleIds, setStyleIds] = useState<string[]>([]);
  const [designObject, setDesignObject] = useState<Step1DesignObject>("ring");
  const [materials, setMaterials] = useState<Step1Material[]>(["s925"]);
  const [ringSizeAdaptations, setRingSizeAdaptations] = useState<Step1RingSizeAdaptation[]>([
    "thick_male",
    "thin_female",
    "medium_unisex",
  ]);
  const [diceStrength, setDiceStrength] = useState<Step1DiceStrength>("single_element_single_style");

  useEffect(() => {
    if (!open) return;
    setStep(0);
    if (initial) {
      setElementRaw(formatElementPool(initial.elements));
      setStyleIds([...initial.styleIds]);
      setDesignObject(initial.designObject);
      setMaterials(initial.materials.length ? [...initial.materials] : ["s925"]);
      setRingSizeAdaptations(
        initial.ringSizeAdaptations.length
          ? [...initial.ringSizeAdaptations]
          : ["thick_male", "thin_female", "medium_unisex"]
      );
      setDiceStrength(initial.diceStrength);
    } else {
      setElementRaw("");
      setStyleIds([]);
      setDesignObject("ring");
      setMaterials(["s925"]);
      setRingSizeAdaptations(["thick_male", "thin_female", "medium_unisex"]);
      setDiceStrength("single_element_single_style");
    }
  }, [open, initial]);

  const elements = useMemo(() => parseElementPoolInput(elementRaw), [elementRaw]);

  const summary = useMemo(() => {
    const styleLabels = styleIds
      .map((id) => STEP1_STYLE_OPTIONS.find((s) => s.id === id)?.label)
      .filter(Boolean)
      .join("、");
    return {
      elements: elements.join("、"),
      styles: styleLabels || "—",
      object: DESIGN_OBJECT_OPTIONS.find((o) => o.id === designObject)?.label ?? "—",
      mat:
        materials
          .map((id) => MATERIAL_OPTIONS.find((o) => o.id === id)?.label)
          .filter(Boolean)
          .join("、") || "—",
      ringSize:
        designObject === "ring" ? ringSizeAdaptationsLabel(ringSizeAdaptations) : "（吊坠无需配置）",
      dice: DICE_STRENGTH_OPTIONS.find((o) => o.id === diceStrength)?.label ?? "—",
    };
  }, [elements, styleIds, designObject, materials, ringSizeAdaptations, diceStrength]);

  if (!open) return null;

  const canNext = () => {
    if (step === 0) return elements.length > 0;
    if (step === 1) return styleIds.length > 0;
    if (step === 3) return materials.length > 0;
    if (step === 4) return designObject === "pendant" || ringSizeAdaptations.length > 0;
    return true;
  };

  const handleConfirm = () => {
    if (!elements.length || !styleIds.length) return;
    onSave({
      id: initial?.id,
      name: initial?.name ?? "",
      elements,
      styleIds,
      designObject,
      materials,
      ringSizeAdaptations,
      diceStrength,
    });
    onClose();
  };

  const toggleStyle = (id: string) => {
    setStyleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleMaterial = (id: Step1Material) => {
    setMaterials((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleRingSizeAdaptation = (id: Step1RingSizeAdaptation) => {
    setRingSizeAdaptations((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <PresetWizardOverlay onClose={onClose}>
      <div
        className="max-h-[min(90vh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-wizard-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="preset-wizard-title" className="shrink-0 text-base font-semibold text-gray-900">
            {mode === "edit" ? "修改预设" : "新建预设"}
          </h2>
        </div>

        <div className="mb-4 flex flex-wrap gap-1">
          {WIZARD_STEPS.map((label, i) => (
            <span
              key={label}
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                i === step ? "bg-amber-100 text-amber-900" : "bg-gray-100 text-gray-500",
              ].join(" ")}
            >
              {i + 1}.{label}
            </span>
          ))}
        </div>

        {step === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              多个独立元素用逗号分隔；同一组合主题内的子元素用 + 连接（仍算 1 个元素）。
            </p>
            <Step1ElementPoolEditor
              elementRaw={elementRaw}
              setElementRaw={setElementRaw}
              elements={elements}
              textareaRef={elementTextareaRef}
            />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid max-h-[320px] grid-cols-3 gap-1 overflow-y-auto overflow-x-visible rounded-xl border border-[rgba(94,111,130,0.12)] p-2">
            {STEP1_STYLE_OPTIONS.map((style) => (
              <Step1StyleMenuOption
                key={style.id}
                style={style}
                selected={styleIds.includes(style.id)}
                onToggle={() => toggleStyle(style.id)}
                compact
              />
            ))}
          </div>
        ) : null}

        {step === 2 ? (
          <OptionGrid
            options={DESIGN_OBJECT_OPTIONS}
            selected={designObject}
            onSelect={(id) => setDesignObject(id as Step1DesignObject)}
          />
        ) : null}

        {step === 3 ? (
          <div>
            <p className="mb-2 text-sm text-gray-600">可多选；骰子每次从中随机选一种材质。</p>
            <div className="flex flex-col gap-2">
              {MATERIAL_OPTIONS.map((opt, index) => (
                <button
                  key={opt.id}
                  type="button"
                  className={[
                    "rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md",
                    materials.includes(opt.id)
                      ? "border-amber-300 bg-amber-50 font-semibold text-amber-900"
                      : "border-[rgba(94,111,130,0.15)] bg-white text-[#363028]",
                  ].join(" ")}
                  style={{ zIndex: 20 - index }}
                  onClick={() => toggleMaterial(opt.id)}
                >
                  <span className="flex items-center justify-between gap-2">
                    {opt.label}
                    {materials.includes(opt.id) ? <span className="text-amber-700">✓</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            {designObject === "pendant" ? (
              <p className="text-sm text-gray-600">
                当前设计对象为吊坠/项链，无需配置戒指尺寸适配，可直接下一步。
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-gray-600">
                  可多选；骰子每次随机抽取一条，写入「设计一个…的戒指」与「以…为设计主题」之间。
                </p>
                <div className="flex flex-col gap-2">
                  {RING_SIZE_ADAPTATION_OPTIONS.map((opt, index) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={[
                        "rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md",
                        ringSizeAdaptations.includes(opt.id)
                          ? "border-amber-300 bg-amber-50 font-semibold text-amber-900"
                          : "border-[rgba(94,111,130,0.15)] bg-white text-[#363028]",
                      ].join(" ")}
                      style={{ zIndex: 20 - index }}
                      onClick={() => toggleRingSizeAdaptation(opt.id)}
                    >
                      <span className="flex items-center justify-between gap-2">
                        {opt.label}
                        {ringSizeAdaptations.includes(opt.id) ? (
                          <span className="text-amber-700">✓</span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {step === 5 ? (
          <OptionGrid
            options={DICE_STRENGTH_OPTIONS}
            selected={diceStrength}
            onSelect={(id) => setDiceStrength(id as Step1DiceStrength)}
          />
        ) : null}

        {step === 6 ? (
          <div className="space-y-2 rounded-xl bg-[#f8f9fa] p-4 text-sm text-gray-700">
            <p>
              <span className="font-medium">元素池：</span>
              {summary.elements}
            </p>
            <p>
              <span className="font-medium">风格：</span>
              {summary.styles}
            </p>
            <p>
              <span className="font-medium">设计对象：</span>
              {summary.object}
            </p>
            <p>
              <span className="font-medium">材质：</span>
              {summary.mat}
            </p>
            <p>
              <span className="font-medium">戒指尺寸适配：</span>
              {summary.ringSize}
            </p>
            <p>
              <span className="font-medium">骰子强度：</span>
              {summary.dice}
            </p>
            <p className="text-xs text-gray-500">
              {mode === "edit" ? "确认后将更新该预设方案。" : "确认后将保存为新预设方案。"}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex justify-between gap-2">
          <BrandButton type="button" variant="outline" shape="full" onClick={onClose} className="h-[34px] px-4 text-sm">
            取消
          </BrandButton>
          <div className="flex gap-2">
            {step > 0 ? (
              <BrandButton
                type="button"
                variant="outline"
                shape="full"
                onClick={() => setStep((s) => s - 1)}
                className="h-[34px] px-4 text-sm"
              >
                上一步
              </BrandButton>
            ) : null}
            {step < WIZARD_STEPS.length - 1 ? (
              <BrandButton
                type="button"
                variant="outline"
                shape="full"
                disabled={!canNext()}
                onClick={() => setStep((s) => s + 1)}
                className="h-[34px] px-4 text-sm"
              >
                下一步
              </BrandButton>
            ) : (
              <BrandButton
                type="button"
                shape="full"
                onClick={handleConfirm}
                disabled={!canNext()}
                className="h-[34px] px-4 text-sm"
              >
                确认{mode === "edit" ? "修改" : "新建"}
              </BrandButton>
            )}
          </div>
        </div>
      </div>
    </PresetWizardOverlay>
  );
}

function PresetWizardOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      {children}
    </div>
  );
}

function OptionGrid<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt, index) => (
        <button
          key={opt.id}
          type="button"
          className={[
            "rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md",
            selected === opt.id
              ? "border-amber-300 bg-amber-50 font-semibold text-amber-900"
              : "border-[rgba(94,111,130,0.15)] bg-white text-[#363028]",
          ].join(" ")}
          style={{ zIndex: 20 - index }}
          onClick={() => onSelect(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
