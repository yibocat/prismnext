/** Read-only experiment island scan result — isomorphic DTO (main + renderer). */

export interface SnapshotFigure {
  path: string;
  kind: string;
}

export interface SnapshotTable {
  path: string;
  columns: string[];
  rowCount: number;
}

export interface SnapshotMetrics {
  path: string;
  values: Record<string, number | string>;
}

export interface ExperimentResultsSnapshot {
  id: string;
  workspacePath: string;
  figures: SnapshotFigure[];
  tables: SnapshotTable[];
  metrics: SnapshotMetrics[];
  /** Compact markdown ≤ 2KB for agent context. */
  textSummary: string;
  /** Files seen but not classified — agent may `read` them. */
  unparsed: string[];
  warnings: string[];
}

export interface SnapshotExperimentOptions {
  scanDirs?: string[];
  metricsFiles?: string[];
  maxFiles?: number;
  maxDepth?: number;
}
