/**
 * kind → renderer table. Panel dispatch only queries this table.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { isFigureStaticKind } from "../../../shared/interaction/figure";
import { isInteractionPlotKind } from "../../../shared/interaction/plot";
import type { InteractionSpec } from "../../../shared/interaction/spec";

export type InteractionRendererProps = {
  spec: InteractionSpec;
  projectRoot: string;
  isActive: boolean;
};

export type InteractionRenderer = {
  key: string;
  matches: (kind: string) => boolean;
  /** Canvas-like body that should stretch to fill the panel viewport. */
  fillViewport: boolean;
  Component: LazyExoticComponent<ComponentType<InteractionRendererProps>>;
};

export const INTERACTION_RENDERERS: InteractionRenderer[] = [
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
    key: "figure",
    matches: isFigureStaticKind,
    fillViewport: true,
    Component: lazy(() =>
      import("./figure/interaction-figure-view").then((m) => ({
        default: ((props: InteractionRendererProps) => (
          <m.InteractionFigureView spec={props.spec} />
        )) as ComponentType<InteractionRendererProps>,
      })),
    ),
  },
];

export function resolveInteractionRenderer(kind: string): InteractionRenderer | null {
  return INTERACTION_RENDERERS.find((r) => r.matches(kind)) ?? null;
}
