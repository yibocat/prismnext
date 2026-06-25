import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { CodeIcon } from "lucide-react";
import { ToolCard, param } from "./shared";
import { ChatFileLink } from "../chat-file-link";

/** Human-readable labels for LSP operations */
const LSP_OP_LABELS: Record<string, string> = {
  gotodefinition: "Go to Definition",
  findreferences: "Find References",
  hover: "Hover Info",
  diagnostics: "Diagnostics",
  documentsymbol: "Document Symbols",
  workspacesymbol: "Workspace Symbols",
  gotoimplementation: "Go to Implementation",
  callhierarchy: "Call Hierarchy",
  preparerename: "Prepare Rename",
  rename: "Rename",
};

export const LspWidget = memo(function LspWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const lspName = toolUse.name || "";
  const opKey = lspName.replace(/^lsp_?/, "").replace(/_/g, "").toLowerCase();
  const opLabel = LSP_OP_LABELS[opKey] || lspName.replace(/^lsp_?/, "LSP ").replace(/_/g, " ");
  const symbol = param(toolUse.input, "symbol") || param(toolUse.input, "query") || param(toolUse.input, "text") || "";
  const filePath = param(toolUse.input, "file_path", "filePath") || param(toolUse.input, "path") || "";

  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  return (
    <ToolCard
      toolName={toolName}
      icon={<CodeIcon className="size-3.5 text-primary" />}
      label={<span className="font-medium">{opLabel}</span>}
      meta={
        <>
          {symbol && (
            <span className="font-mono text-muted-foreground truncate">{symbol.slice(0, 40)}</span>
          )}
          {filePath && (
            <span className="text-muted-foreground/50 truncate text-[length:var(--font-chat-meta)] hidden sm:inline">
              <ChatFileLink path={filePath} className="font-normal inline" />
            </span>
          )}
        </>
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="font-mono max-h-80 overflow-y-auto"
    >
      {() => (
        <>
          <div className="text-[length:var(--font-chat-meta)] text-muted-foreground/70 mb-1">
            {opLabel}{symbol ? `: ${symbol}` : ""}
            {filePath ? (
              <>
                {" in "}
                <ChatFileLink path={filePath} className="font-normal inline" />
              </>
            ) : null}
          </div>
          <pre className="whitespace-pre-wrap break-all text-muted-foreground">
            {(() => {
              const content = toolResult!.content;
              const raw = typeof content === "string"
                ? content
                : JSON.stringify(content, null, 2);
              return raw.length > 3000 ? raw.slice(0, 3000) + `\n\n··· ${raw.length - 3000} more chars` : raw;
            })()}
          </pre>
        </>
      )}
    </ToolCard>
  );
});
