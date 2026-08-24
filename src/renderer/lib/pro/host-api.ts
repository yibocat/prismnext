import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { toast } from "sonner";
import type { LicenseSnapshot, ProFeatureId } from "@shared/pro";
import { isLicenseActive, licenseGrantsFeature } from "@shared/pro";
import { proContributions } from "./contributions";
import type { ProSettingsContribution } from "./contribution-types";

export type ProNotifyTone = "success" | "error" | "info";

export interface ProNotifyOptions {
  title: string;
  description?: string;
  tone?: ProNotifyTone;
}

/**
 * Minimal Pro host surface for `@prismnext/pro`.
 *
 * Grow only when a product surface is decided + Free UI is ready to consume it.
 * Today: license helpers, a few runtime doors, and registerSettings.
 */
export interface ProHostAPI {
  readonly hostApiVersion: 1;

  getLicense(): LicenseSnapshot | null;
  hasFeature(id: ProFeatureId | string): boolean;
  declareFeatures(ids: ReadonlyArray<ProFeatureId | string>): void;

  /** Current project root, or null on welcome / no project. */
  getProjectRoot(): string | null;
  /** Open Settings and select a category id (builtin or Pro contribution). */
  navigateToSettings(categoryId: string): void;
  /** Host-owned toast — prefer this over importing sonner from Pro. */
  notify(options: ProNotifyOptions): void;

  /** Settings section contributed by Pro. */
  registerSettings(contrib: ProSettingsContribution): void;
}

export interface ProModule {
  hostApiVersion: 1;
  register(api: ProHostAPI): void | Promise<void>;
}

function gate(
  getLicense: () => LicenseSnapshot | null,
  feature: ProFeatureId | string | undefined,
  action: string,
): boolean {
  const license = getLicense();
  if (!isLicenseActive(license)) {
    console.warn(`[pro] refused ${action}: license inactive`);
    return false;
  }
  if (feature && !licenseGrantsFeature(license, feature)) {
    console.warn(`[pro] refused ${action}: missing feature "${feature}"`);
    return false;
  }
  return true;
}

export function createProHostAPI(options: {
  getLicense: () => LicenseSnapshot | null;
  onFeaturesDeclared?: (ids: string[]) => void;
  onContributionsChanged?: () => void;
}): ProHostAPI {
  const bump = () => options.onContributionsChanged?.();

  return {
    hostApiVersion: 1,

    getLicense: options.getLicense,

    hasFeature(id) {
      return licenseGrantsFeature(options.getLicense(), id);
    },

    declareFeatures(ids) {
      const list = ids.map(String);
      proContributions.addDeclaredFeatures(list);
      options.onFeaturesDeclared?.(proContributions.getDeclaredFeatures());
      bump();
    },

    getProjectRoot() {
      return useDocumentStore.getState().projectRoot;
    },

    navigateToSettings(categoryId) {
      const id = String(categoryId ?? "").trim();
      if (!id) return;
      const layout = useLayoutStore.getState();
      layout.setLeftSidebarView("settings");
      layout.setSettingsCategory(id);
    },

    notify({ title, description, tone = "info" }) {
      if (tone === "success") {
        toast.success(title, description ? { description } : undefined);
        return;
      }
      if (tone === "error") {
        toast.error(title, description ? { description } : undefined);
        return;
      }
      toast.message(title, description ? { description } : undefined);
    },

    registerSettings(contrib) {
      if (!gate(options.getLicense, contrib.feature, `registerSettings("${contrib.id}")`)) {
        return;
      }
      if (proContributions.addSettings(contrib)) bump();
    },
  };
}
