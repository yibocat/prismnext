import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import type { ProjectFile } from "@/stores/document-store";
import {
  FileTextIcon,
  ImageIcon,
  FileCodeIcon,
  FileCode2Icon,
  BracesIcon,
  PaletteIcon,
  GlobeIcon,
  TerminalIcon,
  BookOpenIcon,
  FileIcon,
} from "lucide-react";

// ─── Types ───

export interface LanguageConfig {
  name: string;
  load: () => Promise<Extension | null>;
  icon: React.ComponentType<{ className?: string }>;
}

// ─── Registry ───

type LanguageMap = Record<string, LanguageConfig>;

const LANGUAGE_MAP: LanguageMap = {
  // ── LaTeX ──────────────────────────────────────────────
  ".tex": {
    name: "LaTeX",
    load: () => import("@/lib/tex/prism-latex-language").then((m) => m.prismLatex()),
    icon: FileTextIcon,
  },
  ".ltx": {
    name: "LaTeX",
    load: () => import("@/lib/tex/prism-latex-language").then((m) => m.prismLatex()),
    icon: FileTextIcon,
  },
  ".sty": {
    name: "TeX Style",
    load: () => import("@/lib/tex/prism-latex-language").then((m) => m.prismLatex()),
    icon: FileCodeIcon,
  },
  ".cls": {
    name: "TeX Class",
    load: () => import("@/lib/tex/prism-latex-language").then((m) => m.prismLatex()),
    icon: FileCodeIcon,
  },
  ".bst": {
    name: "BibTeX Style",
    load: () => import("@/lib/tex/prism-latex-language").then((m) => m.prismLatex()),
    icon: FileCodeIcon,
  },

  // ── Markdown ───────────────────────────────────────────
  ".md": {
    name: "Markdown",
    load: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
    icon: FileTextIcon,
  },
  ".mdx": {
    name: "MDX",
    load: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
    icon: FileTextIcon,
  },

  // ── JSON ───────────────────────────────────────────────
  ".json": {
    name: "JSON",
    load: () => import("@codemirror/lang-json").then((m) => m.json()),
    icon: BracesIcon,
  },

  // ── YAML ───────────────────────────────────────────────
  ".yaml": {
    name: "YAML",
    load: () =>
      import("@codemirror/legacy-modes/mode/yaml").then((m) =>
        StreamLanguage.define(m.yaml),
      ),
    icon: BracesIcon,
  },
  ".yml": {
    name: "YAML",
    load: () =>
      import("@codemirror/legacy-modes/mode/yaml").then((m) =>
        StreamLanguage.define(m.yaml),
      ),
    icon: BracesIcon,
  },

  // ── JavaScript / TypeScript ────────────────────────────
  ".js": {
    name: "JavaScript",
    load: () =>
      import("@codemirror/lang-javascript").then((m) => m.javascript()),
    icon: FileCode2Icon,
  },
  ".jsx": {
    name: "JavaScript JSX",
    load: () =>
      import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
    icon: FileCode2Icon,
  },
  ".mjs": {
    name: "JavaScript",
    load: () =>
      import("@codemirror/lang-javascript").then((m) => m.javascript()),
    icon: FileCode2Icon,
  },
  ".cjs": {
    name: "JavaScript",
    load: () =>
      import("@codemirror/lang-javascript").then((m) => m.javascript()),
    icon: FileCode2Icon,
  },
  ".ts": {
    name: "TypeScript",
    load: () =>
      import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
    icon: FileCode2Icon,
  },
  ".tsx": {
    name: "TypeScript JSX",
    load: () =>
      import("@codemirror/lang-javascript").then((m) =>
        m.javascript({ jsx: true, typescript: true }),
      ),
    icon: FileCode2Icon,
  },
  ".mts": {
    name: "TypeScript",
    load: () =>
      import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
    icon: FileCode2Icon,
  },
  ".cts": {
    name: "TypeScript",
    load: () =>
      import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
    icon: FileCode2Icon,
  },

  // ── CSS ────────────────────────────────────────────────
  ".css": {
    name: "CSS",
    load: () => import("@codemirror/lang-css").then((m) => m.css()),
    icon: PaletteIcon,
  },

  // ── HTML ───────────────────────────────────────────────
  ".html": {
    name: "HTML",
    load: () => import("@codemirror/lang-html").then((m) => m.html()),
    icon: GlobeIcon,
  },
  ".htm": {
    name: "HTML",
    load: () => import("@codemirror/lang-html").then((m) => m.html()),
    icon: GlobeIcon,
  },

  // ── Python ─────────────────────────────────────────────
  ".py": {
    name: "Python",
    load: () => import("@codemirror/lang-python").then((m) => m.python()),
    icon: TerminalIcon,
  },
  ".pyw": {
    name: "Python",
    load: () => import("@codemirror/lang-python").then((m) => m.python()),
    icon: TerminalIcon,
  },

  // ── Shell ──────────────────────────────────────────────
  ".sh": {
    name: "Shell",
    load: () =>
      import("@codemirror/legacy-modes/mode/shell").then((m) =>
        StreamLanguage.define(m.shell),
      ),
    icon: TerminalIcon,
  },
  ".bash": {
    name: "Bash",
    load: () =>
      import("@codemirror/legacy-modes/mode/shell").then((m) =>
        StreamLanguage.define(m.shell),
      ),
    icon: TerminalIcon,
  },
  ".zsh": {
    name: "Zsh",
    load: () =>
      import("@codemirror/legacy-modes/mode/shell").then((m) =>
        StreamLanguage.define(m.shell),
      ),
    icon: TerminalIcon,
  },

  // ── XML ────────────────────────────────────────────────
  ".xml": {
    name: "XML",
    load: () => import("@codemirror/lang-xml").then((m) => m.xml()),
    icon: FileCodeIcon,
  },
  ".svg": {
    name: "SVG",
    load: () => import("@codemirror/lang-xml").then((m) => m.xml()),
    icon: FileCodeIcon,
  },
};

// ─── Primary lookup by extension ─────────────────────────

export function getLanguageLoader(ext: string): (() => Promise<Extension | null>) | null {
  const config = LANGUAGE_MAP[ext.toLowerCase()];
  return config?.load ?? null;
}

export function getLanguageName(ext: string): string {
  const config = LANGUAGE_MAP[ext.toLowerCase()];
  return config?.name ?? "Plain Text";
}

export function getExtensionIcon(ext: string): React.ReactElement {
  const config = LANGUAGE_MAP[ext.toLowerCase()];
  if (config) {
    const Icon = config.icon;
    return <Icon className="size-3.5 shrink-0" />;
  }
  return <FileIcon className="size-3.5 shrink-0" />;
}

// ─── Composite lookup for ProjectFile (ext → type fallback) ──

/** Image file extensions that aren't covered by LANGUAGE_MAP */
const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp",
]);

export function getFileIconForFile(file: ProjectFile): React.ReactElement {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  // 1) Extension-based lookup first
  if (LANGUAGE_MAP[ext]) {
    const Icon = LANGUAGE_MAP[ext].icon;
    return <Icon className="size-3.5 shrink-0" />;
  }

  // 2) Image extension
  if (IMAGE_EXTENSIONS.has(ext)) {
    return <ImageIcon className="size-3.5 shrink-0" />;
  }

  // 3) Type-based fallback
  if (file.type === "image") return <ImageIcon className="size-3.5 shrink-0" />;
  if (file.type === "pdf") return <FileTextIcon className="size-3.5 shrink-0" />;
  if (file.type === "bib") return <BookOpenIcon className="size-3.5 shrink-0" />;
  if (file.type === "style") return <FileCodeIcon className="size-3.5 shrink-0" />;

  // 4) Generic fallback
  return <FileIcon className="size-3.5 shrink-0" />;
}

// ─── Re-export for convenience ───────────────────────────

export { LANGUAGE_MAP };
