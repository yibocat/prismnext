import type { CliParser } from "../../cli/types";

export class GeminiParser implements CliParser {
  totalContextTokens: number | null = null;
  parse(_line: string): Record<string, unknown> | null { return null; }
  reset(): void { this.totalContextTokens = null; }
}
