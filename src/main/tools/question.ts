/**
 * # prism-question — Custom "ask the user" tool
 *
 * Replaces OpenCode's built-in `question` tool which is unavailable in ACP
 * mode.  Uses a file‑based bridge so the AI genuinely pauses and waits for
 * the user's response before continuing.
 *
 * ## How it works
 *
 * 1. AI calls question({ question, options })
 * 2. Tool writes the question to `<userData>/opencode-server/bridges/questions/<id>.json`
 * 3. Tool polls for `<id>.answer.json` (200 ms interval)
 * 4. prism‑next's renderer shows AskUserQuestionWidget
 * 5. User selects an option → IPC handler writes the answer file
 * 6. Tool reads the answer, cleans up, returns it
 * 7. AI continues with the user's answer as the tool result
 *
 * The polling uses `await setTimeout()` — non‑blocking to OpenCode's event
 * loop but blocking to the conversation turn.  The AI truly waits.
 *
 * ## File locations
 *
 *   Questions: <userData>/opencode-server/bridges/questions/<id>.json
 *   Answers:   <userData>/opencode-server/bridges/questions/<id>.answer.json
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { questionsBridgeRoot } from "./bridge-paths";

/** Single-tick async sleep — avoids burning CPU while polling. */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default tool({
  description:
    "Ask the user a question and wait for their answer before continuing. " +
    "Use this when you need clarification, a choice between options, or " +
    "confirmation before proceeding. The user can select from the provided " +
    "options or type a custom response.",

  args: {
    question: tool.schema
      .string()
      .describe("The question to ask the user"),
    options: tool.schema
      .array(tool.schema.string())
      .describe("Available choices for the user to pick from")
      .optional(),
    multiSelect: tool.schema
      .boolean()
      .describe("Allow the user to select multiple options")
      .optional()
      .default(false),
  },

  async execute(args, context) {
    const question = typeof args.question === "string" ? args.question : "";
    const options = Array.isArray(args.options)
      ? args.options.filter((o): o is string => typeof o === "string")
      : [];
    const multiSelect = args.multiSelect === true;

    // Use session ID as question ID so the renderer can find the answer
    // file without needing a separate discovery mechanism.  Only one
    // question can be active per session at a time.
    const sessionId =
      (context as { sessionID?: string; sessionId?: string }).sessionID
      || (context as { sessionID?: string; sessionId?: string }).sessionId
      || "unknown";
    const qDir = questionsBridgeRoot();
    fs.mkdirSync(qDir, { recursive: true });

    const qFile = path.join(qDir, `${sessionId}.json`);
    const aFile = path.join(qDir, `${sessionId}.answer.json`);

    // Write question — prism‑next renderer reads this to show the UI
    fs.writeFileSync(
      qFile,
      JSON.stringify({ question, options, multiSelect, sessionId }),
      "utf-8",
    );

    // Poll for answer every 200 ms.  Non‑blocking async wait — OpenCode's
    // event loop stays responsive but the conversation turn is paused.
    const deadline = Date.now() + 5 * 60 * 1000;
    while (!context.abort.aborted && Date.now() < deadline) {
      await delay(200);
      try {
        if (fs.existsSync(aFile)) {
          const raw = fs.readFileSync(aFile, "utf-8");
          const answer = JSON.parse(raw);
          try { fs.unlinkSync(qFile); } catch {}
          try { fs.unlinkSync(aFile); } catch {}
          return { output: answer.answer || raw };
        }
      } catch {
        // File appeared but not fully written yet — keep polling
      }
    }

    try { fs.unlinkSync(qFile); } catch {}
    return { output: context.abort?.aborted ? "Cancelled" : "Timed out" };
  },
});
