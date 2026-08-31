import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { CheckCircle2Icon, FileTextIcon, XCircleIcon } from "lucide-react";
import { ToolCard, param } from "./shared";
import { ChatFileLink } from "../chat-file-link";
import { ChatArtifactGallery } from "@/lib/markdown/chat-artifact-block";
import {
  extractCompileToolErrors,
  extractCompileArtifactPaths,
} from "@/lib/chat/experiment-run-figures";

const LABELS: Record<string, string> = {
  "latex-root": "LaTeX root",
  "latex-compile": "LaTeX compile",
  "latex-compile-standalone": "Figure compile",
  "typst-root": "Typst root",
  "typst-compile": "Typst compile",
  "typst-compile-standalone": "Typst figure compile",
};

const ROOT_TOOLS = new Set(["latex-root", "typst-root"]);
const COMPILE_TOOLS = new Set([
  "latex-compile",
  "latex-compile-standalone",
  "typst-compile",
  "typst-compile-standalone",
]);

function parseToolJson(content: unknown): Record<string, unknown> | null {
  if (content == null) return null;
  if (typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (typeof parsed === "string") {
      try {
        const inner = JSON.parse(parsed) as unknown;
        if (typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
          return inner as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function unwrapPayload(content: unknown): Record<string, unknown> | null {
  const outer = parseToolJson(content);
  if (!outer) return null;
  if (typeof outer.output === "string") {
    return parseToolJson(outer.output) ?? outer;
  }
  return outer;
}

function CompileResultSummary({
  toolName,
  data,
}: {
  toolName: string;
  data: Record<string, unknown>;
}) {
  if (data.error && typeof data.error === "string") {
    return (
      <p className="text-[length:var(--font-chat-meta)] text-destructive">{data.error}</p>
    );
  }

  if (ROOT_TOOLS.has(toolName)) {
    const mainFile = typeof data.mainFile === "string" ? data.mainFile : "—";
    const engine = typeof data.engine === "string" ? data.engine : null;
    const bibTool = data.bibTool != null ? String(data.bibTool) : "none";
    return (
      <div className="space-y-0.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
        <p>
          {typeof data.mainFile === "string" ? (
            <ChatFileLink path={data.mainFile} className="font-normal" />
          ) : (
            <span className="text-foreground font-medium">{mainFile}</span>
          )}
          {engine ? ` · ${engine}` : ""}
          {bibTool !== "none" ? ` · ${bibTool}` : ""}
        </p>
        {typeof data.buildDir === "string" ? <p>Build: {data.buildDir}</p> : null}
      </div>
    );
  }

  if (COMPILE_TOOLS.has(toolName)) {
    const nested = data.result;
    const inner =
      nested && typeof nested === "object" && !Array.isArray(nested)
        ? (nested as Record<string, unknown>)
        : data;
    const ok = inner.success === true || data.success === true;
    const mainFile = typeof inner.mainFile === "string" ? inner.mainFile : data.mainFile;
    const pdfPath = typeof inner.pdfPath === "string" ? inner.pdfPath : data.pdfPath;
    const errorSummary =
      typeof inner.errorSummary === "string" ? inner.errorSummary : data.errorSummary;
    const errors = extractCompileToolErrors(data);
    return (
      <div className="space-y-1 text-[length:var(--font-chat-meta)]">
        <p className="flex items-center gap-1.5">
          {ok ? (
            <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600" />
          ) : (
            <XCircleIcon className="size-3.5 shrink-0 text-destructive" />
          )}
          <span className={ok ? "text-foreground" : "text-destructive"}>
            {ok ? "Compile succeeded" : "Compile failed"}
          </span>
        </p>
        {typeof mainFile === "string" ? (
          <p className="text-muted-foreground truncate">
            <ChatFileLink path={mainFile} className="font-normal" />
          </p>
        ) : null}
        {typeof pdfPath === "string" && ok ? (
          <p className="text-muted-foreground">PDF: {pdfPath}</p>
        ) : null}
        {!ok && errors.length > 0 ? (
          <ul className="space-y-0.5 text-destructive">
            {errors.map((err, i) => (
              <li key={`${i}:${err.file ?? ""}:${err.line ?? ""}:${err.message}`} className="break-words">
                {err.file ? (
                  <ChatFileLink path={err.file} line={err.line} className="font-normal" />
                ) : null}
                {err.file && err.line != null ? (
                  <span className="text-muted-foreground">:{err.line}</span>
                ) : null}
                {err.file ? " " : null}
                <span>{err.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {!ok && errors.length === 0 && typeof errorSummary === "string" && errorSummary ? (
          <p className="text-destructive whitespace-pre-wrap">{errorSummary}</p>
        ) : null}
      </div>
    );
  }

  return null;
}

export const ManuscriptCompileToolWidget = memo(function ManuscriptCompileToolWidget({
  toolUse,
  toolResult,
  toolName,
  suppressArtifactPaths,
  nestedInActivity,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
  suppressArtifactPaths?: readonly string[];
  nestedInActivity?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const mainFile = param(toolUse.input, "mainFile");
  const bibPath = param(toolUse.input, "bibPath");
  const useTexlive = param(toolUse.input, "useTexlive");
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;
  const parsed = toolResult?.content != null ? unwrapPayload(toolResult.content) : null;

  const detail = mainFile
    ? mainFile
    : bibPath
      ? bibPath
      : useTexlive === "true"
        ? "TeX Live"
        : "";

  const previewPaths = nestedInActivity
    ? []
    : extractCompileArtifactPaths(toolUse, toolResult);

  return (
    <>
    <ToolCard
      toolName={toolName}
      icon={<FileTextIcon className="size-3.5 text-info" />}
      label={<span className="truncate font-medium">{LABELS[toolName] ?? toolName}</span>}
      meta={mainFile ? (
        <ChatFileLink path={mainFile} className="font-normal" />
      ) : detail ? (
        <span
          className="text-muted-foreground/70 min-w-0 truncate text-[length:var(--font-chat-meta)]"
          title={detail}
        >
          {detail}
        </span>
      ) : undefined}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="font-mono text-muted-foreground max-h-80 overflow-y-auto"
    >
      {() => (
        <>
          {parsed ? (
            <div className="mb-2 font-sans">
              <CompileResultSummary toolName={toolName} data={parsed} />
            </div>
          ) : null}
          <pre className="whitespace-pre-wrap break-all">
            {(() => {
              const raw = typeof toolResult!.content === "string"
                ? toolResult!.content
                : JSON.stringify(toolResult!.content, null, 2);
              return raw.length > 4000
                ? raw.slice(0, 4000) + `\n\n··· ${raw.length - 4000} more chars`
                : raw;
            })()}
          </pre>
        </>
      )}
    </ToolCard>
    {previewPaths.length > 0 ? (
      <ChatArtifactGallery
        paths={previewPaths}
        suppressPaths={suppressArtifactPaths}
      />
    ) : null}
    </>
  );
});
