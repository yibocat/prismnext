/**
 * kind -> renderer data table. Panel dispatch (interaction-content.tsx) only
 * queries this table — it must never grow a new if/else branch per kind.
 * Adding a kind (graph.network, diagram.mermaid, instrument, ...) means
 * adding a row here.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { InteractionSpec } from "../../../shared/interaction-spec";
import { isInteractionPlotKind } from "../../../shared/interaction-plot";
import { isInteractionMathKind } from "../../../shared/interaction-math";
import { isInteractionFigureKind } from "../../../shared/interaction-figure";
import { isInteractionPlotlyKind } from "../../../shared/interaction-plotly";
import { isInteractionSceneIrKind } from "../../../shared/interaction-scene-ir";

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
    key: "math",
    matches: isInteractionMathKind,
    fillViewport: true,
    hideBindings: true,
    Component: lazy(() =>
      import("./math/interaction-math-view").then((m) => ({
        default: ((props: InteractionRendererProps) => (
          <m.InteractionMathView spec={props.spec} isActive={props.isActive} />
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
    key: "scene-ir",
    matches: isInteractionSceneIrKind,
    fillViewport: true,
    hideBindings: true,
    Component: lazy(() =>
      import("./scene/interaction-ir-view").then((m) => ({
        default: ((props: InteractionRendererProps) => (
          <m.InteractionIrView
            spec={props.spec}
            projectRoot={props.projectRoot}
            isActive={props.isActive}
          />
        )) as ComponentType<InteractionRendererProps>,
      })),
    ),
  },
  {
    key: "scene-program",
    matches: (kind) => kind.trim() === "scene.program",
    fillViewport: true,
    hideBindings: true,
    Component: lazy(() =>
      import("./scene/interaction-scene-view").then((m) => ({
        default: ((props: InteractionRendererProps) => (
          <m.InteractionSceneView
            spec={props.spec}
            projectRoot={props.projectRoot}
            isActive={props.isActive}
          />
        )) as ComponentType<InteractionRendererProps>,
      })),
    ),
  },
];

export function resolveInteractionRenderer(kind: string): InteractionRenderer | null {
  return INTERACTION_RENDERERS.find((r) => r.matches(kind)) ?? null;
}
