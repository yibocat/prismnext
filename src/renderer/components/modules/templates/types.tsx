import {
  FileTextIcon,
  LayoutGridIcon,
  GraduationCapIcon,
  BriefcaseIcon,
  PresentationIcon,
  Columns2Icon,
  MailIcon,
  BookOpenIcon,
  ScrollTextIcon,
  MonitorIcon,
  NotebookPenIcon,
  Mic2Icon,
} from "lucide-react";

// ─── Types ───

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  documentClass: string;
  icon: string;
}

export interface TemplateFull extends TemplateMeta {
  files: { path: string; content: string }[];
}

export type TemplateCategory = string;

// ─── Template icon mapping ───

export const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "academic-paper": FileTextIcon,
  "phd-thesis": BookOpenIcon,
  "cv-resume": ScrollTextIcon,
  "beamer-presentation": MonitorIcon,
  poster: Columns2Icon,
  letter: MailIcon,
  "research-notes": NotebookPenIcon,
  "clean-talk": Mic2Icon,
};

// ─── Category config (labels via i18n) ───

export const CATEGORIES: {
  id: TemplateCategory | "all";
  labelKey: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "all",
    labelKey: "templates.center.all",
    icon: <LayoutGridIcon className="size-3.5 shrink-0 text-muted-foreground" />,
  },
  {
    id: "paper",
    labelKey: "templates.categories.paper",
    icon: <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />,
  },
  {
    id: "thesis",
    labelKey: "templates.categories.thesis",
    icon: <GraduationCapIcon className="size-3.5 shrink-0 text-muted-foreground" />,
  },
  {
    id: "cv",
    labelKey: "templates.categories.cv",
    icon: <BriefcaseIcon className="size-3.5 shrink-0 text-muted-foreground" />,
  },
  {
    id: "beamer",
    labelKey: "templates.categories.beamer",
    icon: <PresentationIcon className="size-3.5 shrink-0 text-muted-foreground" />,
  },
  {
    id: "poster",
    labelKey: "templates.categories.poster",
    icon: <Columns2Icon className="size-3.5 shrink-0 text-muted-foreground" />,
  },
  {
    id: "letter",
    labelKey: "templates.categories.letter",
    icon: <MailIcon className="size-3.5 shrink-0 text-muted-foreground" />,
  },
];
