// src/main/agents/tokenizer.ts
// Tokenizer implementations with 3-tier degradation:
//   Tier 1: Model-specific library (Anthropic WASM, OpenAI JS)
//   Tier 2: Char-ratio fallback (~4 chars/token English, ~1.5 CJK)
//   Tier 3: Return 0 on file read failure

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Tokenizer } from "./context-calculator";

// ─── Shared helper: walk a directory and sum counted tokens ───

function countDirEntries(
  dirPath: string,
  countContent: (content: string) => number,
  pattern?: RegExp
): number {
  try {
    if (!existsSync(dirPath)) return 0;
    const re = pattern ?? /\.(md|tex|txt)$/i;
    let total = 0;
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && re.test(entry.name)) {
        total += countContent(readFileSync(join(dirPath, entry.name), "utf-8"));
      }
    }
    return total;
  } catch {
    return 0;
  }
}

// ─── Tier 2: Char-Ratio Fallback ───

class CharRatioTokenizer implements Tokenizer {
  countText(text: string): number {
    if (!text) return 0;
    const cjkIdeographChars = (text.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length;
    const otherChars = text.length - cjkIdeographChars;
    // CJK ideographs: ~1.5 chars/token (covers CJK Unified Ideographs, not Hiragana/Katakana/Hangul);
    // English/LaTeX: ~4 chars/token
    return Math.ceil(cjkIdeographChars / 1.5 + otherChars / 4);
  }

  countDir(dirPath: string, pattern?: RegExp): number {
    return countDirEntries(dirPath, (c) => this.countText(c), pattern);
  }
}

// ─── Factory ───

const warnedTokenizers = new Set<string>();

export function createTokenizer(agentId: string, _modelId?: string): Tokenizer {
  switch (agentId) {
    case "claude":
      return createAnthropicTokenizer();
    case "opencode":
      return createOpenAITokenizer();
    default:
      return new CharRatioTokenizer();
  }
}

function createAnthropicTokenizer(): Tokenizer {
  try {
    // @anthropic-ai/tokenizer — official WASM-based tokenizer
    const anthropic = require("@anthropic-ai/tokenizer");
    return {
      countText(text: string): number {
        if (!text) return 0;
        return anthropic.countTokens(text);
      },
      countDir(dirPath: string, pattern?: RegExp): number {
        return countDirEntries(dirPath, (c) => anthropic.countTokens(c), pattern);
      },
    };
  } catch {
    if (!warnedTokenizers.has("anthropic")) {
      console.warn("[tokenizer] @anthropic-ai/tokenizer not available, using char-ratio fallback for Claude");
      warnedTokenizers.add("anthropic");
    }
    return new CharRatioTokenizer();
  }
}

function createOpenAITokenizer(): Tokenizer {
  try {
    // gpt-tokenizer — pure JS, ~50KB, no native deps
    const { encode } = require("gpt-tokenizer");
    return {
      countText(text: string): number {
        if (!text) return 0;
        return encode(text).length;
      },
      countDir(dirPath: string, pattern?: RegExp): number {
        return countDirEntries(dirPath, (c) => encode(c).length, pattern);
      },
    };
  } catch {
    if (!warnedTokenizers.has("openai")) {
      console.warn("[tokenizer] gpt-tokenizer not available, using char-ratio fallback for OpenCode");
      warnedTokenizers.add("openai");
    }
    return new CharRatioTokenizer();
  }
}
