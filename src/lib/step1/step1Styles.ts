export type { Step1StyleOption } from "./step1StyleOptions";
export {
  STEP1_STYLE_OPTIONS,
  isValidStep1StyleId,
  sanitizeStep1StyleIds,
  styleLabelById,
} from "./step1StyleOptions";

/** @deprecated 使用 styleLabelById */
export { styleLabelById as step1StyleLabel } from "./step1StyleOptions";
