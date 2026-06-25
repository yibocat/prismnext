import { describe, expect, it } from "vitest";
import {
  parseFrontmatterFields,
  splitMarkdownFrontmatter,
} from "@/lib/markdown/frontmatter";
import { parseSkillMd } from "@/lib/agent/skill-config";

describe("markdown frontmatter", () => {
  it("splits YAML frontmatter from body", () => {
    const doc = `---
title: Hello
tags: demo
---

# Body heading

Paragraph.
`;
    const split = splitMarkdownFrontmatter(doc);
    expect(split.hasFrontmatter).toBe(true);
    expect(split.fields.title).toBe("Hello");
    expect(split.fields.tags).toBe("demo");
    expect(split.body.trim()).toBe("# Body heading\n\nParagraph.");
  });

  it("returns original content when no frontmatter", () => {
    const split = splitMarkdownFrontmatter("# Just markdown");
    expect(split.hasFrontmatter).toBe(false);
    expect(split.body).toBe("# Just markdown");
  });

  it("parses quoted values", () => {
    const fields = parseFrontmatterFields("name: 'my-skill'\ndescription: \"Use when\"");
    expect(fields.name).toBe("my-skill");
    expect(fields.description).toBe("Use when");
  });
});

describe("skill frontmatter via parseSkillMd", () => {
  it("round-trips skill metadata", () => {
    const doc = `---
name: demo-skill
description: Use when testing
license: MIT
---

# Instructions
`;
    const parsed = parseSkillMd(doc);
    expect(parsed.name).toBe("demo-skill");
    expect(parsed.description).toBe("Use when testing");
    expect(parsed.license).toBe("MIT");
    expect(parsed.body).toBe("# Instructions");
  });
});
