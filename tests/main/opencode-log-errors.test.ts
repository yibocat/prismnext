import { describe, it, expect } from "vitest";
import {
  parseOpenCodeStreamErrorLine,
  isPrimaryOpenCodeStreamError,
  cleanProviderErrorMessage,
} from "../../src/main/acp/opencode-log-errors";

describe("parseOpenCodeStreamErrorLine", () => {
  it("extracts weekly usage limit from a primary stream error line", () => {
    const line =
      'timestamp=2026-07-31T17:24:33.274Z level=ERROR run=c4f51b9a message="stream error" providerID=opencode-go modelID=grok-4.5 session.id=ses_046cb3bb4ffezq6hxuRj02bcyu small=false agent=build mode=primary error.error="AI_APICallError: Weekly usage limit reached. Resets in 2 days. To continue using this model now, enable usage from your available balance: https://opencode.ai/workspace/wrk_01KH0KJJQ5J4W6A700PPJSPK90/go"';
    const err = parseOpenCodeStreamErrorLine(line);
    expect(err).toMatchObject({
      sessionId: "ses_046cb3bb4ffezq6hxuRj02bcyu",
      small: false,
      mode: "primary",
    });
    expect(err?.message).toContain("Weekly usage limit reached");
    expect(err?.message).not.toMatch(/^AI_APICallError/);
    expect(isPrimaryOpenCodeStreamError(err!)).toBe(true);
  });

  it("ignores title / small helper stream errors", () => {
    const line =
      'message="stream error" session.id=ses_abc small=true agent=title mode=primary error.error="AI_RetryError: Failed after 3 attempts. Last error: Weekly usage limit reached."';
    const err = parseOpenCodeStreamErrorLine(line);
    expect(err?.small).toBe(true);
    expect(isPrimaryOpenCodeStreamError(err!)).toBe(false);
    expect(err?.message).toBe("Weekly usage limit reached.");
  });

  it("returns null for unrelated lines", () => {
    expect(parseOpenCodeStreamErrorLine("timestamp=… message=loop session.id=ses_x")).toBeNull();
  });
});

describe("cleanProviderErrorMessage", () => {
  it("strips AI SDK error wrappers", () => {
    expect(
      cleanProviderErrorMessage(
        "AI_RetryError: Failed after 3 attempts. Last error: Provider rate limit exceeded",
      ),
    ).toBe("Provider rate limit exceeded");
  });
});
