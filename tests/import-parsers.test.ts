import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { classify, extractCandidates, splitSentences } from "@/lib/import/extract";
import { parseUpload } from "@/lib/import/parse";
import { activePath, looksLikeChatGpt, parseChatGpt } from "@/lib/import/parsers/chatgpt";
import { looksLikeClaude, parseClaude, parseClaudeProjects } from "@/lib/import/parsers/claude";
import { parseGeminiActivity } from "@/lib/import/parsers/gemini";
import { parseMarkdownFile, parseMarkdownFiles } from "@/lib/import/parsers/markdown";
import { parsePaste } from "@/lib/import/parsers/paste";
import { isZip, unzip } from "@/lib/import/zip";

const samples = (...p: string[]) => path.join(__dirname, "..", "demo", "samples", ...p);
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8")) as unknown;

/** Build a real zip in memory (stored or deflated entries) so the reader is tested against the format, not itself. */
function buildZip(entries: { name: string; data: Buffer; deflate?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const crc32 = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const payload = e.deflate ? zlib.deflateRawSync(e.data) : e.data;
    const method = e.deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); local.writeUInt32LE(crc32(e.data), 14);
    local.writeUInt32LE(payload.length, 18); local.writeUInt32LE(e.data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14); central.writeUInt32LE(crc32(e.data), 16); central.writeUInt32LE(payload.length, 20); central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, name, payload);
    centrals.push(central, name);
    offset += local.length + name.length + payload.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}

describe("ChatGPT conversations.json", () => {
  const json = readJson(samples("chatgpt-conversations.json"));

  it("recognises the shape and mines only user messages along the active branch", () => {
    expect(looksLikeChatGpt(json)).toBe(true);
    const r = parseChatGpt(json);
    expect(r.stats.conversations).toBe(3);
    const texts = r.items.map((i) => i.text).join("\n");
    expect(texts).toContain("I prefer free tools");
    expect(texts).toContain("gravel bike");          // edited branch (current_node)
    expect(texts).not.toContain("skydiving");        // abandoned branch
    expect(texts).not.toContain("three tiers");      // assistant turn
    expect(r.items.every((i) => i.ref.includes("›"))).toBe(true);
    expect(r.items[0].at).toMatch(/^2026-02-03T/);
  });

  it("walks from the root down the last child when current_node is missing", () => {
    const mapping = {
      r: { id: "r", parent: null, children: ["a", "b"], message: null },
      a: { id: "a", parent: "r", children: [], message: { author: { role: "user" }, content: { content_type: "text", parts: ["old"] } } },
      b: { id: "b", parent: "r", children: [], message: { author: { role: "user" }, content: { content_type: "text", parts: ["new"] } } },
    };
    expect(activePath(mapping, undefined)).toEqual(["r", "b"]);
    const r = parseChatGpt([{ title: "t", mapping }]);
    expect(r.items.map((i) => i.text)).toEqual(["new"]);
  });

  it("tolerates unknown fields, non-string parts, hidden messages and junk rows", () => {
    const r = parseChatGpt([
      { title: "x", mapping: { n: { id: "n", parent: null, children: [], message: { author: { role: "user" }, content: { content_type: "multimodal_text", parts: [{ asset_pointer: "file" }, "kept this line"] }, extra_field: 1 } } }, future_field: {} },
      { title: "hidden", mapping: { n: { id: "n", parent: null, children: [], message: { author: { role: "user" }, metadata: { is_visually_hidden_from_conversation: true }, content: { content_type: "text", parts: ["secret system-ish"] } } } } },
      "not a conversation",
      { title: "no mapping" },
    ]);
    expect(r.items.map((i) => i.text)).toEqual(["kept this line"]);
    expect(r.stats.skipped).toBe(2);
  });

  it("returns a warning, not a throw, for the wrong file", () => {
    expect(parseChatGpt({ hello: "world" }).warnings[0]).toMatch(/No conversations found/);
    expect(parseChatGpt(null).items).toEqual([]);
    expect(looksLikeChatGpt([{ chat_messages: [] }])).toBe(false);
  });
});

describe("Claude export", () => {
  const json = readJson(samples("claude-conversations.json"));

  it("mines human turns only and ignores unknown fields", () => {
    expect(looksLikeClaude(json)).toBe(true);
    const r = parseClaude(json);
    expect(r.stats.conversations).toBe(2);
    expect(r.stats.messages).toBe(3);
    const texts = r.items.map((i) => i.text).join("\n");
    expect(texts).toContain("self-host everything");
    expect(texts).not.toContain("NAS is less work");
    expect(r.items[0].ref).toBe("Self-hosting the dashboard › message 1");
  });

  it("falls back to content[] text when `text` is empty and skips malformed rows", () => {
    const r = parseClaude([
      { name: "c", chat_messages: [{ sender: "human", text: "", content: [{ type: "text", text: "from content" }, { type: "tool_use" }] }, "junk", { sender: "assistant", text: "no" }] },
      { name: "no messages" },
      42,
    ]);
    expect(r.items.map((i) => i.text)).toEqual(["from content"]);
    expect(r.stats.skipped).toBe(2);
  });

  it("mines project instructions from projects.json", () => {
    const r = parseClaudeProjects([{ uuid: "p", name: "Studio", prompt_template: "Always answer as a designer would.", docs: [{ filename: "x.md", content: "ignored" }] }, { name: "empty" }]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ kind: "instruction", ref: "project › Studio › instructions" });
  });
});

describe("Gemini activity JSON (assumed shape)", () => {
  it("keeps only Prompted rows", () => {
    const r = parseGeminiActivity([
      { header: "Gemini Apps", title: "Prompted I prefer plain answers", time: "2026-01-01T00:00:00Z", products: ["Gemini Apps"] },
      { header: "Gemini Apps", title: "Used Gemini Apps", time: "2026-01-01T00:00:00Z" },
      { nope: true },
    ]);
    expect(r.items.map((i) => i.text)).toEqual(["I prefer plain answers"]);
    expect(r.stats.skipped).toBe(1);
    expect(parseGeminiActivity({}).warnings[0]).toMatch(/No activity rows/);
  });
});

describe("Markdown notes", () => {
  it("splits paragraphs and list items, keeps heading context, skips front matter, code and tables", () => {
    const items = parseMarkdownFile({ name: "notes/Tools I pay for.md", text: fs.readFileSync(samples("notes", "Tools I pay for.md"), "utf8") });
    const texts = items.map((i) => i.text);
    expect(texts.some((t) => t.startsWith("I prefer free tools"))).toBe(true);
    expect(texts.join("\n")).not.toContain("LOCAL_LLM_BASE_URL");
    expect(texts.join("\n")).not.toContain("| Tool |");
    expect(items[0].ref).toMatch(/^Tools I pay for\.md › Tools I pay for › line \d+$/);
    const rules = parseMarkdownFile({ name: "Working rules.md", text: fs.readFileSync(samples("notes", "Working rules.md"), "utf8") });
    expect(rules.map((i) => i.text).join("\n")).not.toContain("tags:");
    expect(rules.some((i) => i.ref.includes("› Mornings ›"))).toBe(true);
  });

  it("reads only .md/.txt and warns about the rest", () => {
    const r = parseMarkdownFiles([{ name: "a.md", text: "- I always write things down first." }, { name: "b.csv", text: "x,y" }, { name: "c.txt", text: "Short." }]);
    expect(r.stats.files).toBe(2);
    expect(r.stats.skipped).toBe(1);
    expect(r.items).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/skipped/);
  });
});

describe("Paste box", () => {
  it("marks memory and instruction sections and makes one item per bullet", () => {
    const r = parsePaste(fs.readFileSync(samples("pasted-memory.txt"), "utf8"));
    const memory = r.items.filter((i) => i.kind === "memory");
    const instructions = r.items.filter((i) => i.kind === "instruction");
    expect(memory).toHaveLength(5);
    expect(instructions).toHaveLength(3);
    expect(memory[0].ref).toBe("pasted text › line 3");
    expect(parsePaste("   ").warnings[0]).toMatch(/Nothing usable/);
  });
});

describe("zip reader", () => {
  it("reads stored and deflated entries and skips junk", () => {
    const zip = buildZip([
      { name: "conversations.json", data: Buffer.from("[]"), deflate: true },
      { name: "notes/a.md", data: Buffer.from("# hi\n\nI prefer tea."), deflate: false },
      { name: "__MACOSX/._a.md", data: Buffer.from("junk") },
      { name: ".DS_Store", data: Buffer.from("junk") },
    ]);
    expect(isZip(zip)).toBe(true);
    const r = unzip(zip);
    expect(r.entries.map((e) => e.name)).toEqual(["conversations.json", "notes/a.md"]);
    expect(r.entries[1].data.toString()).toContain("I prefer tea");
    expect(r.skipped).toEqual([]);
  });

  it("refuses garbage instead of hanging", () => {
    expect(() => unzip(Buffer.from("definitely not a zip"))).toThrow(/Not a zip/);
  });
});

describe("parseUpload (dispatcher)", () => {
  it("sniffs JSON by shape, expands zips and merges notes + paste", () => {
    const zip = buildZip([
      { name: "export/conversations.json", data: fs.readFileSync(samples("chatgpt-conversations.json")), deflate: true },
      { name: "export/chat.html", data: Buffer.from("<html></html>") },
      { name: "export/user.json", data: Buffer.from('{"id":"user-x","email":"alex@example.com"}') },
    ]);
    const r = parseUpload({ source: "claude", files: [{ name: "export.zip", data: zip }, { name: "Reading list.md", data: fs.readFileSync(samples("notes", "Reading list.md")) }], paste: "Saved memories\n- User likes tea." });
    expect(r.detected).toEqual(["ChatGPT conversations", "notes", "pasted text"]);
    expect(r.warnings.some((w) => /looks like a ChatGPT export/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /user\.json.*not a shape/.test(w))).toBe(true);
    expect(r.stats.conversations).toBe(3);
    expect(r.items.some((i) => i.kind === "memory")).toBe(true);
  });

  it("reports invalid JSON and empty input as warnings", () => {
    const r = parseUpload({ source: "chatgpt", files: [{ name: "broken.json", data: Buffer.from("{nope") }] });
    expect(r.warnings[0]).toMatch(/not valid JSON/);
    expect(parseUpload({ source: "paste" }).warnings[0]).toMatch(/Nothing to import/);
  });
});

describe("rule-based extractor", () => {
  it("classifies the common shapes", () => {
    expect(classify("I prefer free tools until the paid plan saves two hours a month.")).toBe("preference");
    expect(classify("Never add a feature the week a client deadline lands.")).toBe("rule");
    expect(classify("I'm a product designer at a four-person studio.")).toBe("fact");
    expect(classify("I decided to keep streaks optional after user interviews.")).toBe("decision-pattern");
    expect(classify("I'm into design systems and accessibility.")).toBe("interest");
    expect(classify("Don't show me crypto news, I'm not interested in it at all.")).toBe("avoid");
    expect(classify("Quality first, then learning, then cost, then speed.")).toBe("value");
    expect(classify("User prefers short, direct answers.")).toBe("preference");
    expect(classify("Here is a draft of the pricing page.")).toBeNull();
  });

  it("drops requests, questions and URLs; trusts memory bullets; dedupes", () => {
    const r = extractCandidates([
      { text: "Can you help me think through a pricing page? I prefer free tools until a paid plan saves me two hours a month. What do you think?", ref: "c › 1", kind: "message" },
      { text: "I prefer free tools until a paid plan saves me two hours a month.", ref: "c › 2", kind: "message" },
      { text: "Look at https://example.com/x I always read it.", ref: "c › 3", kind: "message" },
      { text: "User is a product designer who splits the week between client work and a side project.", ref: "memory › 1", kind: "memory" },
      { text: "Always answer in plain language.", ref: "instructions › 1", kind: "instruction" },
    ]);
    const texts = r.items.map((i) => i.text);
    expect(texts.filter((t) => t.startsWith("I prefer free tools"))).toHaveLength(1);
    expect(texts.some((t) => /Can you help/.test(t))).toBe(false);
    expect(texts.some((t) => /What do you think/.test(t))).toBe(false);
    expect(texts.some((t) => /https/.test(t))).toBe(false);
    const memory = r.items.find((i) => i.text.startsWith("User is a product designer"))!;
    expect(memory.category).toBe("fact");
    expect(memory.confidence).toBeGreaterThanOrEqual(0.7);
    expect(r.items.find((i) => i.text === "Always answer in plain language.")?.category).toBe("rule");
    expect(r.items[0].confidence).toBeGreaterThanOrEqual(r.items[r.items.length - 1].confidence);
  });

  it("splits sentences sensibly", () => {
    expect(splitSentences("I like tea. I hate coffee! Really? Yes.\nNew line")).toEqual(["I like tea.", "I hate coffee!", "Really?", "Yes.", "New line"]);
  });

  it("mines the whole fictional sample set into a sensible queue", () => {
    const upload = parseUpload({
      source: "chatgpt",
      files: [
        { name: "chatgpt-conversations.json", data: fs.readFileSync(samples("chatgpt-conversations.json")) },
        { name: "claude-conversations.json", data: fs.readFileSync(samples("claude-conversations.json")) },
        ...fs.readdirSync(samples("notes")).map((n) => ({ name: `notes/${n}`, data: fs.readFileSync(samples("notes", n)) })),
      ],
      paste: fs.readFileSync(samples("pasted-memory.txt"), "utf8"),
    });
    const r = extractCandidates(upload.items);
    const cats = new Set(r.items.map((i) => i.category));
    for (const c of ["preference", "rule", "fact", "interest", "avoid", "decision-pattern"]) expect(cats.has(c as never)).toBe(true);
    expect(r.items.length).toBeGreaterThan(15);
    expect(r.items.length).toBeLessThan(80);
    expect(r.items.some((i) => /skydiving/.test(i.text))).toBe(false);
  });
});
