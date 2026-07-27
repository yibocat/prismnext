/**
 * kind -> renderer data table. Panel dispatch (interaction-content.tsx) only
 * queries this table — it must never grow a new if/else branch per kind.
 * Adding a kind (graph.network, diagram.mermaid, instrument, ...) means
 * adding a row here.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { useTranslation } from "react-i18next";
import {
  isDeprecatedInteractionKind,
  type InteractionSpec,
} from "../../../shared/interaction-spec";
import { isInteractionPlotKind } from "../../../shared/interaction-plot";
import { isInteractionFigureKind } from "../../../shared/interaction-figure";
import { isInteractionPlotlyKind } from "../../../shared/interaction-plotly";
import { isInteractionInstrumentKind } from "../../../shared/interaction-instrument";
import { isInteractionScriptKind } from "../../../shared/interaction-script";

export type InteractionRendererProps = {
  spec: InteractionSpec;
  projectRoot: string;
  isActive: boolean;
};

export type InteractionRenderer = {
  /** Stable id — used by tests and telemetry, not shown to users. */
  key: string;
  matches: (kind: string) => boolean;
  /** Canvas-like body that should stretch to fill the panel viewport. */
  fillViewport: boolean;
  /** Renderer shows bindings as part of its own chrome (sliders) — hide the generic list. */
  hideBindings?: boolean;
  /** Renderer's resource(s) ARE the visible content — hide the generic path list. */
  hideResources?: boolean;
  Component: LazyExoticComponent<ComponentType<InteractionRendererProps>>;
};

export const INTERACTION_RENDERERS: InteractionRenderer[] = [
  {
    key: "plotly",
    matches: isInteractionPlotlyKind,
    fillViewport: true,
    hideResources: true,
    Component: lazy(() =>
      import("./plotly/interaction-plotly-view").then((m) => ({
        default: ((props: InteractionRendererProps) => (
          <m.InteractionPlotlyView
            spec={props.spec}
            projectRoot={props.projectRoot}
            isActive={props.isActive}
          />
        )) as ComponentType<InteractionRendererProps>,
      })),
    ),
  },
  {
    key: "plot",
    matches: isInteractionPlotKind,
    fillViewport: true,
    Component: lazy(() =>
      import("./plot/interaction-plot-view").then((m) => ({
        default: ((props: InteractionRendererProps) => (
          <m.InteractionPlotView spec={props.spec} projectRoot={props.projectRoot} />
        )) as ComponentType<InteractionRendererProps>,
      })),
    ),
  },
  {
    key: "instrument",
    matches: isInteractionInstrumentKind,
    fillViewport: true,
    hideBindings: true,
    Component: lazy(() =>
      import("./instrument/interaction-instrument-view").then((m) => ({
        default: ((props: InteractionRendererProps) => (
          <m.InteractionInstrumentView spec={props.spec} isActive={props.isActive} />
        )) as ComponentType<InteractionRendererProps>,
      })),
    ),
  },
  {
    key: "script",
    matches: isInteractionScriptKind,
    fillViewport: true,
    hideBindings: true,
    hideResources: true,
    Component: lazy(() =>
      import("./script/interaction-script-view").then((m) => ({
        default: ((props: InteractionRendererProps) => (
          <m.InteractionScriptView spec={props.spec} projectRoot={props.projectRoot} />
        )) as ComponentType<InteractionRendererProps>,
      })),
    ),
  },
  {
    key: "figure",
    matches: isInteractionFigureKind,
    fillViewport: true,
    hideResources: true,
    Component: lazy(() =>
      import("./figure/interaction-figure-view").then((m) => ({
        default: ((props: InteractionRendererProps) => (
          <m.InteractionFigureView spec={props.spec} projectRoot={props.projectRoot} />
        )) as ComponentType<InteractionRendererProps>,
      })),
    ),
  },
  {
    key: "deprecated",
    matches: isDeprecatedInteractionKind,
    fillViewport: false,
    hideBindings: true,
    hideResources: true,
    Component: lazy(() => Promise.resolve({ default: DeprecatedKindView })),
  },
];

/**
 * Retired kinds (scene.ir/math.surface/math.field/scene.program, V4-A) no
 * longer render — this is the "not silent failure" fallback: read-only
 * model dump so the Agent has enough context to rebuild the artifact with
 * figure.plotly/instrument. See interaction-plotly-runtime-design.md §7.
 */
function DeprecatedKindView({ spec }: InteractionRendererProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-md border border-border bg-muted px-4 py-5">
      <p className="text-[length:var(--font-size-13)] text-foreground">
        {t("interaction.panel.deprecatedKindTitle")}
      </p>
      <p className="text-[length:var(--font-size-12)] text-muted-foreground">
        {t("interaction.panel.deprecatedKindBody", { kind: spec.kind })}
      </p>
      {spec.model ? (
        <pre className="max-h-64 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
          {JSON.stringify(spec.model, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export function resolveInteractionRenderer(kind: string): InteractionRenderer | null {
  return INTERACTION_RENDERERS.find((r) => r.matches(kind)) ?? null;
}
