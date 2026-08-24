import { describe, expect, it } from "vitest";
import {
  chordDisplayParts,
  chordMatchesEvent,
  chordToCodeMirrorKey,
  formatChord,
  listShortcuts,
  resolveChord,
} from "../../src/shared/shortcuts";

describe("formatChord", () => {
  it("formats primary+backslash on darwin", () => {
    expect(formatChord({ key: "\\", primary: true }, "darwin")).toBe("⌘\\");
  });

  it("formats primary+backslash on win32", () => {
    expect(formatChord({ key: "\\", primary: true }, "win32")).toBe("Ctrl+\\");
  });

  it("formats shift chord on darwin", () => {
    expect(formatChord({ key: "w", primary: true, shift: true }, "darwin")).toBe("⌘⇧W");
  });

  it("exposes display parts for Kbd chips", () => {
    expect(chordDisplayParts({ key: "w", primary: true, shift: true }, "darwin")).toEqual([
      "⌘",
      "⇧",
      "W",
    ]);
    expect(chordDisplayParts({ key: "\\", primary: true }, "win32")).toEqual(["Ctrl", "\\"]);
  });
});

describe("chordMatchesEvent", () => {
  it("matches primary+b on darwin via meta", () => {
    expect(
      chordMatchesEvent(
        { key: "b", primary: true },
        { key: "b", code: "KeyB", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false },
        "darwin",
      ),
    ).toBe(true);
  });

  it("matches primary+b on win32 via ctrl", () => {
    expect(
      chordMatchesEvent(
        { key: "b", primary: true },
        { key: "b", code: "KeyB", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false },
        "win32",
      ),
    ).toBe(true);
  });

  it("matches backslash via code", () => {
    expect(
      chordMatchesEvent(
        { key: "\\", primary: true },
        { key: "¥", code: "Backslash", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false },
        "darwin",
      ),
    ).toBe(true);
  });

  it("rejects wrong modifiers", () => {
    expect(
      chordMatchesEvent(
        { key: "b", primary: true },
        { key: "b", code: "KeyB", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false },
        "darwin",
      ),
    ).toBe(false);
  });

  it("matches ctrl+tab chat next on darwin (not primary)", () => {
    expect(
      chordMatchesEvent(
        { key: "Tab", ctrl: true },
        { key: "Tab", code: "Tab", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false },
        "darwin",
      ),
    ).toBe(true);
  });

  it("matches primary+shift+y accept all", () => {
    expect(
      chordMatchesEvent(
        { key: "y", primary: true, shift: true },
        { key: "y", code: "KeyY", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false },
        "darwin",
      ),
    ).toBe(true);
  });
});

describe("resolveChord", () => {
  it("returns defaults", () => {
    const r = resolveChord("shell.toggleRightArea");
    expect(r?.chord).toEqual({ key: "b", primary: true, alt: true });
    expect(r?.isCustom).toBe(false);
  });

  it("resolves RightArea maximize as primary+ctrl+b", () => {
    const r = resolveChord("shell.toggleRightAreaMaximize");
    expect(r?.chord).toEqual({ key: "b", primary: true, ctrl: true });
  });

  it("matches ⌥⌘B and ⌃⌘B on darwin", () => {
    const toggle = resolveChord("shell.toggleRightArea")!.chord;
    const maximize = resolveChord("shell.toggleRightAreaMaximize")!.chord;
    expect(formatChord(toggle, "darwin")).toBe("⌘⌥B");
    expect(formatChord(maximize, "darwin")).toBe("⌘⌃B");
    expect(
      chordMatchesEvent(
        toggle,
        { key: "∫", code: "KeyB", metaKey: true, ctrlKey: false, shiftKey: false, altKey: true },
        "darwin",
      ),
    ).toBe(true);
    expect(
      chordMatchesEvent(
        maximize,
        { key: "b", code: "KeyB", metaKey: true, ctrlKey: true, shiftKey: false, altKey: false },
        "darwin",
      ),
    ).toBe(true);
    expect(
      chordMatchesEvent(
        toggle,
        { key: "b", code: "KeyB", metaKey: true, ctrlKey: true, shiftKey: false, altKey: false },
        "darwin",
      ),
    ).toBe(false);
  });

  it("resolves mode shortcuts as Ctrl+1–6 and Ctrl+`", () => {
    expect(resolveChord("workspace.openTexWorkspace")?.chord).toEqual({
      key: "1",
      ctrl: true,
    });
    expect(resolveChord("workspace.openTexWorkspaceMaximize")?.chord).toEqual({
      key: "1",
      ctrl: true,
      shift: true,
    });
    expect(resolveChord("workspace.openLiterature")?.chord).toEqual({
      key: "2",
      ctrl: true,
    });
    expect(resolveChord("workspace.openExperiments")?.chord).toEqual({
      key: "3",
      ctrl: true,
    });
    expect(resolveChord("workspace.openFiles")?.chord).toEqual({
      key: "4",
      ctrl: true,
    });
    expect(resolveChord("workspace.openGit")?.chord).toEqual({
      key: "5",
      ctrl: true,
    });
    expect(resolveChord("workspace.openBrowser")?.chord).toEqual({
      key: "6",
      ctrl: true,
    });
    expect(resolveChord("workspace.openTerminal")?.chord).toEqual({
      key: "`",
      ctrl: true,
    });
    expect(resolveChord("workspace.openTerminalMaximize")?.chord).toEqual({
      key: "`",
      ctrl: true,
      shift: true,
    });
    expect(resolveChord("workspace.openTemplates")).toBeNull();
  });

  it("matches Ctrl+` terminal on darwin and win32", () => {
    const chord = { key: "`", ctrl: true };
    expect(
      chordMatchesEvent(
        chord,
        {
          key: "`",
          code: "Backquote",
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
        "darwin",
      ),
    ).toBe(true);
    expect(
      chordMatchesEvent(
        chord,
        {
          key: "`",
          code: "Backquote",
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
        "win32",
      ),
    ).toBe(true);
  });

  it("matches Ctrl+Shift+digit via code when key is shifted glyph", () => {
    // US layout: Shift+2 → "@", Shift+6 → "^"
    expect(
      chordMatchesEvent(
        { key: "2", ctrl: true, shift: true },
        {
          key: "@",
          code: "Digit2",
          metaKey: false,
          ctrlKey: true,
          shiftKey: true,
          altKey: false,
        },
        "darwin",
      ),
    ).toBe(true);
    expect(
      chordMatchesEvent(
        { key: "6", ctrl: true, shift: true },
        {
          key: "^",
          code: "Digit6",
          metaKey: false,
          ctrlKey: true,
          shiftKey: true,
          altKey: false,
        },
        "darwin",
      ),
    ).toBe(true);
  });

  it("matches alt+p on darwin when Option remaps key to π", () => {
    expect(
      chordMatchesEvent(
        { key: "p", alt: true },
        { key: "π", code: "KeyP", metaKey: false, ctrlKey: false, shiftKey: false, altKey: true },
        "darwin",
      ),
    ).toBe(true);
  });

  it("formats alt+p as ⌥P on darwin", () => {
    expect(formatChord({ key: "p", alt: true }, "darwin")).toBe("⌥P");
  });

  it("registers product.togglePlanMode", () => {
    expect(listShortcuts().some((d) => d.id === "product.togglePlanMode")).toBe(true);
    expect(resolveChord("product.togglePlanMode")?.chord).toEqual({ key: "p", alt: true });
  });

  it("registers product.openModelPicker as ⌥K / Alt+K", () => {
    expect(listShortcuts().some((d) => d.id === "product.openModelPicker")).toBe(true);
    expect(resolveChord("product.openModelPicker")?.chord).toEqual({ key: "k", alt: true });
  });

  it("registers product.cycleMessageWidth as ⌘L and workspace.insertToChat as ⌥L", () => {
    expect(resolveChord("product.cycleMessageWidth")?.chord).toEqual({ key: "l", primary: true });
    expect(resolveChord("workspace.insertToChat")?.chord).toEqual({ key: "l", alt: true });
    expect(formatChord({ key: "l", primary: true }, "darwin")).toBe("⌘L");
    expect(formatChord({ key: "l", primary: true }, "win32")).toBe("Ctrl+L");
    expect(formatChord({ key: "l", primary: true }, "linux")).toBe("Ctrl+L");
    expect(formatChord({ key: "l", alt: true }, "darwin")).toBe("⌥L");
    expect(formatChord({ key: "l", alt: true }, "win32")).toBe("Alt+L");
    expect(formatChord({ key: "l", alt: true }, "linux")).toBe("Alt+L");
  });

  it("registers appearance cycle shortcuts as Alt+T and Alt+B", () => {
    expect(resolveChord("product.cycleThemePack")?.chord).toEqual({ key: "t", alt: true });
    expect(resolveChord("product.cycleChatBackdrop")?.chord).toEqual({ key: "b", alt: true });
    expect(formatChord({ key: "t", alt: true }, "darwin")).toBe("⌥T");
    expect(formatChord({ key: "b", alt: true }, "darwin")).toBe("⌥B");
  });

  it("matches alt+l on darwin when Option remaps key", () => {
    expect(
      chordMatchesEvent(
        { key: "l", alt: true },
        { key: "¬", code: "KeyL", metaKey: false, ctrlKey: false, shiftKey: false, altKey: true },
        "darwin",
      ),
    ).toBe(true);
  });

  it("matches Ctrl+L cycle width and Alt+L insert on win32/linux", () => {
    const width = { key: "l", primary: true };
    const insert = { key: "l", alt: true };
    const ctrlL = {
      key: "l",
      code: "KeyL",
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
    };
    const altL = {
      key: "l",
      code: "KeyL",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    };
    for (const platform of ["win32", "linux"] as const) {
      expect(chordMatchesEvent(width, ctrlL, platform)).toBe(true);
      expect(chordMatchesEvent(insert, altL, platform)).toBe(true);
      // Crossed modifiers must not match.
      expect(chordMatchesEvent(width, altL, platform)).toBe(false);
      expect(chordMatchesEvent(insert, ctrlL, platform)).toBe(false);
    }
  });

  it("ignores overrides for non-remappable shell/editor", () => {
    const r = resolveChord("shell.toggleLeftSidebar", {
      "shell.toggleLeftSidebar": { key: "k", primary: true },
    });
    expect(r?.chord).toEqual({ key: "b", primary: true });
    expect(r?.isCustom).toBe(false);
  });

  it("applies overrides for remappable workspace ids", () => {
    const r = resolveChord("workspace.gitRefresh", {
      "workspace.gitRefresh": { key: "g", primary: true },
    });
    expect(r?.chord).toEqual({ key: "g", primary: true });
    expect(r?.isCustom).toBe(true);
  });

  it("lists editor entries as non-remappable", () => {
    const editor = listShortcuts().filter((d) => d.category === "editor");
    expect(editor.length).toBeGreaterThan(0);
    expect(editor.every((d) => d.remappable === false)).toBe(true);
  });
});

describe("chordToCodeMirrorKey", () => {
  it("maps primary+f to Mod-f", () => {
    expect(chordToCodeMirrorKey({ key: "f", primary: true })).toBe("Mod-f");
  });

  it("maps primary+shift+f to Mod-Shift-f", () => {
    expect(chordToCodeMirrorKey({ key: "f", primary: true, shift: true })).toBe("Mod-Shift-f");
  });

  it("maps Escape", () => {
    expect(chordToCodeMirrorKey({ key: "Escape" })).toBe("Escape");
  });

  it("maps primary+/ to Mod-/", () => {
    expect(chordToCodeMirrorKey({ key: "/", primary: true })).toBe("Mod-/");
  });
});
