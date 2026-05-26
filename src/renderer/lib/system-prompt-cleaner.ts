// ─── System prompt removal ───
// ACP delivers Claude's system prompt wrapped in XML tags.
// Strategy: strip known system blocks by tag FIRST, then remove
// any remaining preamble text that starts like a system directive.

const SYSTEM_TAG_RE = /<[^>]+>/g;

function stripSystemBlocks(text: string): string {
  let result = text;
  // System prompt blocks
  result = result.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "");
  result = result.replace(/<EXTREMELY_IMPORTANT>[\s\S]*?<\/EXTREMELY_IMPORTANT>/g, "");
  result = result.replace(/<instructions>[\s\S]*?<\/instructions>/g, "");
  result = result.replace(/<function>[\s\S]*?<\/function>/g, "");
  result = result.replace(/<role>[\s\S]*?<\/role>/g, "");
  // Claude CLI local command blocks (saved in JSONL, should never be shown)
  result = result.replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, "");
  result = result.replace(/<command-name>[\s\S]*?<\/command-name>/g, "");
  result = result.replace(/<command-message>[\s\S]*?<\/command-message>/g, "");
  result = result.replace(/<command-args>[\s\S]*?<\/command-args>/g, "");
  result = result.replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, "");
  return result;
}

function stripSystemPreamble(text: string): string {
  const lines = text.split("\n");
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { start = i + 1; continue; }
    // Stop stripping when we hit something that looks like a real response
    if (/^(Hey|Hi|Hello|Sure|OK|Okay|Let me|I'll|I will|Here|The|This|That|Alright|Great|Thanks|Based on|Looking at|First|Let's|I can|I see|I found|I notice|I've|Certainly|Indeed|Ah|Good|Interesting|Right|Well|Yes|No|Actually|Hmm|Hmm,|I think|You're|Your)/i.test(line)) {
      start = i;
      break;
    }
    // Keep stripping system-like lines
    if (/^(You are|IMPORTANT|System|Rules|Instructions|Tools|Environment|Working|Current|Available|When|Always|Never|Your|The user|\[|#|```)/i.test(line)) {
      start = i + 1;
      continue;
    }
    // Unknown line → might be real content, stop here
    start = i;
    break;
  }
  return lines.slice(start).join("\n").trim();
}

export function cleanTextForDisplay(raw: string): string {
  let text = stripSystemBlocks(raw);
  text = stripSystemPreamble(text);
  // Remove remaining XML tags for display
  text = text.replace(SYSTEM_TAG_RE, "").trim();
  return text;
}
