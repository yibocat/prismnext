/**
 * The single declarative contract for agent-authored Interaction kinds.
 *
 * This is intentionally about observable capabilities, not implementation
 * examples. Main-process validation, tool guidance, and tests consume the
 * same definitions so the agent is never taught behavior the runtime lacks.
 */

export type InteractionTimeBehavior =
  | "static"
  | "precomputed-frames"
  | "live-bindings"
  | "step-state";

export type InteractionResourceBehavior = "none" | "versioned";

export type InteractionCapability = {
  kind: string;
  dataSource: string;
  timeBehavior: InteractionTimeBehavior;
  interaction: InteractionTimeBehavior;
  renderingCapability: string;
  boundResources: InteractionResourceBehavior;
  modelShape: string;
};

export const INTERACTION_CAPABILITIES: readonly InteractionCapability[] = [
  {
    kind: "plot.line",
    dataSource: "small local series or a versioned CSV resource",
    timeBehavior: "static",
    interaction: "static",
    renderingCapability: "2D line plot",
    boundResources: "versioned",
    modelShape: '{ columns?: { x, y } }',
  },
  {
    kind: "plot.series",
    dataSource: "small local series or a versioned CSV resource",
    timeBehavior: "static",
    interaction: "static",
    renderingCapability: "2D multi-series plot",
    boundResources: "versioned",
    modelShape: '{ columns?: { x, y } }',
  },
  {
    kind: "plot.scatter",
    dataSource: "small local series or a versioned CSV resource",
    timeBehavior: "static",
    interaction: "static",
    renderingCapability: "2D scatter plot",
    boundResources: "versioned",
    modelShape: '{ columns?: { x, y } }',
  },
  {
    kind: "figure.static",
    dataSource: "a generated PNG, SVG, or HTML resource",
    timeBehavior: "static",
    interaction: "static",
    renderingCapability: "file preview",
    boundResources: "versioned",
    modelShape: "resources: [{ role: 'figure', path }]",
  },
  {
    kind: "figure.plotly",
    dataSource: "host-computed declarative Plotly JSON or a generated figure JSON resource",
    timeBehavior: "precomputed-frames",
    interaction: "precomputed-frames",
    renderingCapability: "2D/3D Plotly figure and precomputed frames",
    boundResources: "versioned",
    modelShape: '{ figure: { data, layout?, frames? }, domain?, params? }',
  },
  {
    kind: "instrument",
    dataSource: "host-computed expressions and declared live bindings",
    timeBehavior: "live-bindings",
    interaction: "live-bindings",
    renderingCapability: "live Plotly recompute and optional step state",
    boundResources: "none",
    modelShape: '{ runtimeVersion: 1, figureTemplate, domain?, params?, step? }',
  },
  {
    kind: "figure.script",
    dataSource: "a sandboxed script and initial resource snapshots",
    timeBehavior: "static",
    interaction: "static",
    renderingCapability: "custom one-shot canvas",
    boundResources: "versioned",
    modelShape: "resources: [{ role: 'script', path }]",
  },
  {
    kind: "diagram.mermaid",
    dataSource: "inline Mermaid/DOT text or a versioned text resource",
    timeBehavior: "static",
    interaction: "static",
    renderingCapability: "structural diagram",
    boundResources: "versioned",
    modelShape: "{ engine: 'mermaid' | 'dot', source? }",
  },
];

export function getInteractionCapability(kind: string): InteractionCapability | undefined {
  return INTERACTION_CAPABILITIES.find((capability) => capability.kind === kind.trim());
}

/**
 * Runtime agent guidance. Keep the contract conceptual: syntactic details and
 * field-level repair come from schema validation diagnostics.
 */
export function buildInteractionWriteGuidance(): string {
  const capabilityLines = INTERACTION_CAPABILITIES.map(
    (capability) =>
      `- ${capability.kind}: source=${capability.dataSource}; ` +
      `time=${capability.timeBehavior}; rendering=${capability.renderingCapability}; ` +
      `shape=${capability.modelShape}`,
  );

  return [
    "Choose an Interaction by capability, not by a remembered example.",
    "1. Identify the data source: host-computable formula, generated resource, or structural text.",
    "2. Identify time behavior: static, precomputed frames, live bindings, or step state.",
    "3. Identify rendering capability: Plotly figure, simple plot, file preview, diagram, or one-shot custom canvas.",
    "A bound resource is a versioned resource: the host records its identity at write time. If it changes, rewrite the Interaction to acknowledge the new revision; it does not auto-refresh.",
    "Only instrument supports live bindings. Only instrument supports host step state. figure.plotly supports precomputed Plotly frames, not live recomputation.",
    "instrument requires at least one entry in spec.bindings — live bindings are its defining capability, not optional decoration. If nothing needs to be adjustable, use figure.plotly instead.",
    "Kinds:",
    ...capabilityLines,
    "Write the minimal envelope { id, title, kind }; local is the default compute mode and revision defaults to 1. On validation failure, use the returned field-level diagnostic and same-kind sample.",
  ].join("\n");
}
