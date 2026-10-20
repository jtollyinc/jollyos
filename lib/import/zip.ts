/**
 * lib/import/zip — read a .zip in memory with no dependency.
 * ────────────────────────────────────────────────────────────────────────────
 * Export archives (ChatGPT, Claude, Notion, a zipped notes folder) are plain
 * ZIPs with stored or deflated entries. Node's zlib handles deflate; the rest
 * is the central directory, which this file walks from the end of the buffer.
 * Deliberately small: no ZIP64, no encryption, no spanned archives — those
 * entries are reported in `skipped` instead of crashing the import.
 */
import zlib from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Buffer;
}

export interface UnzipResult {
  entries: ZipEntry[];
  skipped: string[];
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

/** Entries nobody wants from an export archive. */
export function isJunkEntry(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  return name.endsWith("/") || name.startsWith("__MACOSX/") || base.startsWith(".") || base === "Thumbs.db";
}

export function unzip(buf: Buffer, opts: { maxTotalBytes?: number; maxEntries?: number } = {}): UnzipResult {
  const maxTotal = opts.maxTotalBytes ?? 300 * 1024 * 1024;
  const maxEntries = opts.maxEntries ?? 5000;
  const entries: ZipEntry[] = [];
  const skipped: string[] = [];

  // End of central directory: scan backwards (the comment can be up to 64 KiB).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a zip file (no end-of-central-directory record).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw new Error("ZIP64 archives are not supported; unzip it and upload the files inside.");

  let total = 0;
  for (let n = 0; n < count && n < maxEntries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) throw new Error("Corrupt zip: bad central directory entry.");
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const uncompressed = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const flags = buf.readUInt16LE(p + 8);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;

    if (isJunkEntry(name)) continue;
    if (flags & 0x1) { skipped.push(`${name} (encrypted)`); continue; }
    if (compressed === 0xffffffff || uncompressed === 0xffffffff) { skipped.push(`${name} (zip64 entry)`); continue; }
    if (method !== 0 && method !== 8) { skipped.push(`${name} (compression method ${method})`); continue; }
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOC_SIG) { skipped.push(`${name} (bad local header)`); continue; }
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    if (start + compressed > buf.length) { skipped.push(`${name} (truncated)`); continue; }
    total += uncompressed;
    if (total > maxTotal) throw new Error(`Archive expands past ${Math.round(maxTotal / 1024 / 1024)} MB; upload the files you need instead.`);
    const raw = buf.subarray(start, start + compressed);
    try {
      const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
      entries.push({ name, data });
    } catch {
      skipped.push(`${name} (could not inflate)`);
    }
  }
  return { entries, skipped };
}

export const isZip = (buf: Buffer) => buf.length > 4 && buf.readUInt32LE(0) === LOC_SIG;
