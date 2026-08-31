import { describe, expect, it } from "vitest";
import { PI_PROVIDERS } from "../../src/shared/providers/pi-catalog";
import { isAllowedModelProxyUrl, piModelProxyHosts, providerIdForModelProxyUrl } from "../../src/shared/remote";

describe("model gateway allowlist", () => {
  it("derives official hosts from the Pi provider catalog", () => {
    const hosts = piModelProxyHosts();
    expect(hosts).toContain("api.anthropic.com");
    expect(hosts).toContain("opencode.ai");
    expect(hosts.length).toBe(
      new Set(
        PI_PROVIDERS
          .map((provider) => provider.baseUrl)
          .filter(Boolean)
          .map((url) => new URL(url!).hostname.toLowerCase()),
      ).size,
    );
    expect(isAllowedModelProxyUrl("https://api.anthropic.com/v1/messages")).toBe(true);
    expect(isAllowedModelProxyUrl("https://opencode.ai/zen/v1/chat/completions")).toBe(true);
    expect(providerIdForModelProxyUrl("https://api.anthropic.com/v1/messages")).toBe("anthropic");
  });

  it("rejects link-local, file, and raw IPs", () => {
    expect(isAllowedModelProxyUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedModelProxyUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedModelProxyUrl("https://1.2.3.4/v1/chat/completions")).toBe(false);
    expect(isAllowedModelProxyUrl("https://localhost/v1")).toBe(false);
  });

  it("allows a user-configured base URL host", () => {
    expect(isAllowedModelProxyUrl(
      "https://llm.example.edu/v1/chat/completions",
      ["https://llm.example.edu/v1"],
    )).toBe(true);
  });
});
