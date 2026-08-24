import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
import {
  PROMPT_TOKEN_ENCODING,
  type PromptTokenEstimate,
} from "../../shared/providers/token-estimate";

let encoder: Tiktoken | null = null;

/** Lazy-init on first count — rank ships in node_modules / app bundle, not fetched at runtime. */
function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = new Tiktoken(o200k_base);
  }
  return encoder;
}

/** Count tokens for prompt preview / breakdown (o200k_base BPE — estimate, not billing). */
export function countPromptTokens(text: string): PromptTokenEstimate {
  const charCount = text.length;
  if (!text) {
    return { tokenCount: 0, charCount: 0, encoding: PROMPT_TOKEN_ENCODING };
  }
  const tokenCount = getEncoder().encode(text).length;
  return { tokenCount, charCount, encoding: PROMPT_TOKEN_ENCODING };
}

/** @internal */
export function _resetPromptTokenEncoderForTests(): void {
  encoder = null;
}
