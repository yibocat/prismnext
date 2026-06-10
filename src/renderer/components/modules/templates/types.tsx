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
};

// ─── Category config ───

export const CATEGORIES: { id: TemplateCategory | "all"; label: string; icon: React.ReactNode }[] = [
  { id: "all", label: "All Templates", icon: <LayoutGridIcon className="size-3.5 shrink-0 text-muted-foreground" /> },
  { id: "paper", label: "Academic Paper", icon: <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" /> },
  { id: "thesis", label: "Thesis", icon: <GraduationCapIcon className="size-3.5 shrink-0 text-muted-foreground" /> },
  { id: "cv", label: "CV / Resume", icon: <BriefcaseIcon className="size-3.5 shrink-0 text-muted-foreground" /> },
  { id: "beamer", label: "Beamer Slides", icon: <PresentationIcon className="size-3.5 shrink-0 text-muted-foreground" /> },
  { id: "poster", label: "Poster", icon: <Columns2Icon className="size-3.5 shrink-0 text-muted-foreground" /> },
  { id: "letter", label: "Letter", icon: <MailIcon className="size-3.5 shrink-0 text-muted-foreground" /> },
];
