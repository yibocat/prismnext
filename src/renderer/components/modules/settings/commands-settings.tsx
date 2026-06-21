import { useState, useEffect } from "react";
import { useCommandStore } from "@/stores/command-store";
import { useDocumentStore } from "@/stores/document-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import type { CommandDef } from "@commands/types";

// ── Style tokens ──

const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between py-2.5 group";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5 truncate";
const BADGE = "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide";
const SUB_HEADER = "text-[length:var(--font-size-12)] font-medium text-foreground mb-1.5";
const SUB_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mb-2";

// ── Component ──

export default function CommandsSettings() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const commands = useCommandStore((s) => s.commands);
  const loaded = useCommandStore((s) => s.loaded);
  const loadCommands = useCommandStore((s) => s.loadCommands);
  const createCommand = useCommandStore((s) => s.createCommand);
  const updateCommand = useCommandStore((s) => s.updateCommand);
  const deleteCommand = useCommandStore((s) => s.deleteCommand);
  const toggleCommand = useCommandStore((s) => s.toggleCommand);

  useEffect(() => { loadCommands(); }, [loadCommands]);

  const builtInCommands = commands.filter(
    (c) => c.source === "builtin",
  );
  const customCommands = commands.filter((c) => c.source === "user");

  // ── Form state ──
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const deleteConfirm = useInlineDeleteConfirm();

  const openCommand = (cmd: CommandDef) => {
    setExpandedId(cmd.id);
    setEditName(cmd.name);
    setEditDescription(cmd.description);
    setEditTemplate(cmd.template ?? "");
    setShowAddForm(false);
  };

  const cancelForm = () => {
    deleteConfirm.clearPending();
    setExpandedId(null);
    setShowAddForm(false);
    setEditName("");
    setEditDescription("");
    setEditTemplate("");
  };

  const handleSave = async () => {
    if (!editName.trim() || !editDescription.trim() || !editTemplate.trim()) return;
    const isNew = showAddForm;
    if (isNew) {
      await createCommand({
        name: editName.trim(),
        description: editDescription.trim(),
        template: editTemplate.trim(),
      });
    } else if (expandedId) {
      await updateCommand(expandedId, {
        name: editName.trim(),
        description: editDescription.trim(),
        template: editTemplate.trim(),
      });
    }
    cancelForm();
  };

  const confirmDelete = async (id: string) => {
    deleteConfirm.clearPending();
    if (expandedId === id) cancelForm();
    await deleteCommand(id);
  };

  // ── Inline edit/add form ──
  const renderForm = (saveLabel: string) => (
    <div className="py-3 space-y-3">
      <input
        type="text"
        className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-[length:var(--font-size-13)] outline-none focus:border-primary/40"
        placeholder="Command name (without /)"
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
      />
      <input
        type="text"
        className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-[length:var(--font-size-13)] outline-none focus:border-primary/40"
        placeholder="Short description"
        value={editDescription}
        onChange={(e) => setEditDescription(e.target.value)}
      />
      <Textarea
        className="min-h-24 font-mono !text-[length:var(--font-size-12)] resize-y"
        value={editTemplate}
        onChange={(e) => setEditTemplate(e.target.value)}
        placeholder="Command template — use $ARGUMENTS, $1..$N, @path, !`cmd`"
      />
      <div className="flex items-center gap-2">
        <Button size="xs" onClick={handleSave} disabled={!editName.trim() || !editDescription.trim() || !editTemplate.trim()}>
          {saveLabel}
        </Button>
        <Button variant="ghost" size="xs" onClick={cancelForm}>
          Cancel
        </Button>
      </div>
    </div>
  );

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Built-in commands */}
      <div>
        <p className={SUB_HEADER}>Built-in Commands</p>
        <p className={SUB_DESC}>App-wide slash commands. Toggle to enable or disable.</p>
        <div className={CARD}>
          {!loaded ? (
            <div className={cn(ROW, "!block")}>
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">Loading…</p>
            </div>
          ) : builtInCommands.length === 0 ? (
            <div className={cn(ROW, "!block")}>
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">No built-in commands available.</p>
            </div>
          ) : (
            builtInCommands.map((cmd) => (
              <div key={cmd.id} className={ROW}>
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-primary text-[length:var(--font-size-13)] font-medium">
                      /{cmd.name}
                    </span>
                    {cmd.action && (
                      <span className={cn(BADGE, "bg-primary/10 text-primary")}>Action</span>
                    )}
                    <span className={cn(BADGE, "bg-muted text-muted-foreground")}>Built-in</span>
                  </div>
                  <p className={ROW_DESC}>{cmd.description}</p>
                </div>
                <Switch
                  checked={cmd.enabled}
                  onCheckedChange={(v) => toggleCommand(cmd.id, v)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Custom commands */}
      <div>
        <p className={SUB_HEADER}>Custom Commands</p>
        {!projectRoot ? (
          <p className={SUB_DESC}>Open a project to create and manage custom commands.</p>
        ) : (
          <>
            <p className={SUB_DESC}>
              Per-project commands in{" "}
              <code className="text-[length:var(--font-size-11)] bg-muted px-1 py-0.5 rounded">
                .prismnext/agent/commands/
              </code>
            </p>
            <div className={CARD}>
              {customCommands.length === 0 && !showAddForm ? (
                <div className={cn(ROW, "!block")}>
                  <p className="text-[length:var(--font-size-12)] text-muted-foreground">No custom commands yet.</p>
                </div>
              ) : (
                customCommands.map((cmd) =>
                  expandedId === cmd.id ? (
                    <div key={cmd.id}>
                      {renderForm("Save")}
                    </div>
                  ) : (
                    <div
                      key={cmd.id}
                      className={cn(ROW, "cursor-pointer")}
                      onClick={() => openCommand(cmd)}
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="flex items-center gap-2">
                          <p className={ROW_LABEL}>/{cmd.name}</p>
                          <span className={cn(BADGE, "bg-muted text-muted-foreground")}>Custom</span>
                        </div>
                        <p className={ROW_DESC}>{cmd.description}</p>
                      </div>
                      <InlineDeleteButton
                        itemId={cmd.id}
                        pending={deleteConfirm.isPending(cmd.id)}
                        stopPropagation
                        onRequest={() => deleteConfirm.setPendingId(cmd.id)}
                        onConfirm={() => void confirmDelete(cmd.id)}
                      />
                    </div>
                  ),
                )
              )}

              {showAddForm ? (
                renderForm("Add command")
              ) : (
                <div className="py-2.5">
                  <Button variant="ghost" size="xs" onClick={() => { cancelForm(); setShowAddForm(true); }}>
                    + Add custom command
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
