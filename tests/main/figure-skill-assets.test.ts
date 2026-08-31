import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SKILLS = join(
  process.cwd(),
  "resources",
  "teams",
  "prismnext.core",
  "skills",
);

const TIKZ = join(SKILLS, "figure-tikz");
const TYPST = join(SKILLS, "figure-typst");
const MPL = join(SKILLS, "figure-matplotlib");

type CatalogItem = {
  id: string;
  type: "template" | "example" | "icon";
  path: string;
  tex: string;
  meta: string;
  has_edit_contract: boolean;
};

describe("figure-tikz catalog", () => {
  const catalog = JSON.parse(
    readFileSync(join(TIKZ, "library", "catalog.json"), "utf-8"),
  ) as CatalogItem[];

  it("points the skill at the local catalog and standalone compile", () => {
    const skill = readFileSync(join(TIKZ, "SKILL.md"), "utf-8");
    expect(skill).toMatch(/^name: figure-tikz$/m);
    expect(skill).toMatch(/catalog/i);
    expect(skill).toContain("library/catalog.json");
    expect(skill).toContain("this skill");
    expect(skill).toContain("SKILL.md");
    expect(skill).toContain("latex-compile-standalone");
    expect(skill).toContain("figure-typst");
    expect(skill).toContain("latexmk");
  });

  it("ships catalog items with tex + meta and no previews", () => {
    const byType = Object.fromEntries(
      (["template", "example", "icon"] as const).map((type) => [
        type,
        catalog.filter((item) => item.type === type),
      ]),
    );
    expect(byType.template).toHaveLength(20);
    expect(byType.example).toHaveLength(3);
    expect(byType.icon).toHaveLength(20);

    const ids = catalog.map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "encoder-decoder",
        "resnet-block",
        "flowchart",
        "gan",
        "lora",
        "transformer-block",
        "unet",
        "diffusion",
        "gnn",
        "vae",
        "causal-graph",
        "prisma-flow",
        "swimlane",
        "timeline",
        "tree",
        "venn",
        "gpu",
        "dataset",
        "attention",
      ]),
    );
    expect(ids).not.toEqual(expect.arrayContaining(["claude", "github", "nvidia"]));

    for (const item of catalog) {
      const dir = join(TIKZ, "library", item.path);
      expect(existsSync(join(dir, item.tex)), item.id).toBe(true);
      expect(existsSync(join(dir, item.meta)), item.id).toBe(true);
      expect(existsSync(join(dir, "preview.svg")), item.id).toBe(false);

      const tex = readFileSync(join(dir, item.tex), "utf-8");
      expect(tex).toMatch(/\\documentclass(\[.*\])?\{standalone\}/);

      if (item.has_edit_contract) {
        const meta = JSON.parse(readFileSync(join(dir, item.meta), "utf-8")) as {
          edit_contract?: { parameters?: unknown[] };
        };
        expect(meta.edit_contract?.parameters?.length, item.id).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the three fallback templates", () => {
    for (const name of [
      "architecture-diagram.tex",
      "commutative-diagram.tex",
      "pgfplots-lines.tex",
    ]) {
      expect(existsSync(join(TIKZ, "assets", name))).toBe(true);
    }
  });

  it("records upstream license and ships ml/systems icons only", () => {
    expect(existsSync(join(TIKZ, "library", "LICENSE-CONTENT"))).toBe(true);
    expect(existsSync(join(TIKZ, "library", "UPSTREAM"))).toBe(true);
    expect(existsSync(join(TIKZ, "library", "icons", "ml", "attention", "attention.tex"))).toBe(true);
    expect(existsSync(join(TIKZ, "library", "icons", "systems", "gpu", "gpu.tex"))).toBe(true);
    expect(existsSync(join(TIKZ, "library", "icons", "brands"))).toBe(false);
    expect(
      existsSync(join(TIKZ, "library", "reference", "color-palettes", "color-palettes.md")),
    ).toBe(true);
  });
});

describe("figure-typst catalog", () => {
  const catalog = JSON.parse(
    readFileSync(join(TYPST, "library", "catalog.json"), "utf-8"),
  ) as Array<{
    id: string;
    type: string;
    path: string;
    typ: string;
    meta: string;
    has_edit_contract: boolean;
  }>;

  it("points the skill at the local catalog and standalone Typst compile", () => {
    const skill = readFileSync(join(TYPST, "SKILL.md"), "utf-8");
    expect(skill).toMatch(/^name: figure-typst$/m);
    expect(skill).toContain("library/catalog.json");
    expect(skill).toContain("typst-compile-standalone");
    expect(skill).toContain("@preview/cetz:0.3.4");
    expect(skill).toContain("fletcher:0.5.8");
    expect(skill).toContain("figure-tikz");
  });

  it("ships catalog items with typ + meta", () => {
    expect(catalog.map((item) => item.id).sort()).toEqual(
      ["architecture-boxes", "exchange-diagram"].sort(),
    );
    for (const item of catalog) {
      const dir = join(TYPST, "library", item.path);
      expect(existsSync(join(dir, item.typ)), item.id).toBe(true);
      expect(existsSync(join(dir, item.meta)), item.id).toBe(true);
      const source = readFileSync(join(dir, item.typ), "utf-8");
      expect(source).toContain("#set page(width: auto, height: auto");
      if (item.has_edit_contract) {
        const meta = JSON.parse(readFileSync(join(dir, item.meta), "utf-8")) as {
          edit_contract?: { parameters?: unknown[] };
        };
        expect(meta.edit_contract?.parameters?.length, item.id).toBeGreaterThan(0);
      }
    }
  });
});

describe("figure-matplotlib named patterns", () => {
  const scripts = [
    "plot_template.py",
    "plot_multipanel.py",
    "plot_timeseries_ci.py",
    "plot_grouped_bar.py",
    "plot_box_violin.py",
    "plot_scatter_fit.py",
    "plot_heatmap.py",
    "plot_roc_pr.py",
  ];

  it("lists the named patterns on the closed experiment-run path", () => {
    const skill = readFileSync(join(MPL, "SKILL.md"), "utf-8");
    expect(skill).toMatch(/^name: figure-matplotlib$/m);
    expect(skill).toMatch(/named pattern/i);
    expect(skill).toContain("plot_timeseries_ci.py");
    expect(skill).toContain("plot_roc_pr.py");
    expect(skill).toContain("experiment-run");
  });

  it("ships each pattern with the same save contract and a style file", () => {
    expect(existsSync(join(MPL, "assets", "prism.mplstyle"))).toBe(true);
    const shipped = readdirSync(join(MPL, "scripts")).filter((name) =>
      name.endsWith(".py"),
    );
    expect(shipped.sort()).toEqual([...scripts].sort());

    for (const name of scripts) {
      const src = readFileSync(join(MPL, "scripts", name), "utf-8");
      expect(src, name).toContain('ap.add_argument("--out"');
      expect(src, name).toContain('ap.add_argument("--name"');
      expect(src, name).toContain("prism.mplstyle");
      expect(src, name).toContain('fig.savefig(pdf)');
      expect(src, name).toContain('fig.savefig(png)');
    }
  });
});
