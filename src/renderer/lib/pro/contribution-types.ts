/**
 * Pro contribution types — only surfaces that are wired in the Free host today.
 * Add new kinds when a product decision lands, not in advance.
 */

import type { ComponentType } from "react";
import type { ProFeatureId } from "@shared/pro";

/** Extra row / panel under Settings (Pro owns the React tree). */
export interface ProSettingsContribution {
  id: string;
  /** Settings sidebar section label (English fallback). */
  sectionLabel: string;
  sectionLabelKey?: string;
  /** Order within Pro settings cluster. */
  order?: number;
  feature?: ProFeatureId | string;
  /** Render the settings body when the section is selected. */
  Content: ComponentType;
}

export interface ProContributionsSnapshot {
  settings: ProSettingsContribution[];
  declaredFeatures: string[];
}

export type ProContributionKind = "settings";
