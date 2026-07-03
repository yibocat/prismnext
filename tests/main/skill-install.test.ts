import { describe, expect, it, vi, afterEach } from "vitest";
import { analyzeSkillSource } from "../../src/main/services/skill-install";
import { clearDiscoveryCacheForTests } from "../../src/main/services/skill-install-discovery";

describe("skill-install analyze", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearDiscoveryCacheForTests();
  });

  it("routes registry hostnames to discovery adapter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            skills: [
              {
                name: "wrangler",
                description: "Cloudflare wrangler CLI",
                type: "skill-md",
                url: "/.well-known/agent-skills/wrangler/SKILL.md",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await analyzeSkillSource("developers.cloudflare.com");
    expect(result.adapter).toBe("discovery");
    expect(result.origin.adapter).toBe("discovery");
    expect(result.packages.some((pkg) => pkg.id === "wrangler")).toBe(true);
  });
});
