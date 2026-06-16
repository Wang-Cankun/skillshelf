// Metadata shape for the provider-icons library (powers the custom-agent icon
// picker, delta 4). Mirrors the records authored in
// `src/assets/provider-icons/metadata.ts`; kept here under the `@/types/*`
// path alias that metadata.ts imports.

export interface IconMetadata {
  /** filename stem under provider-icons/ (the picker key). */
  name: string;
  /** human label shown in the picker. */
  displayName: string;
  category: "ai-provider" | "cloud" | "tool" | "other" | string;
  /** search terms the picker matches against. */
  keywords: string[];
  /** brand hex (or "currentColor"); used as the chip tint when chosen. */
  defaultColor?: string;
}
