import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, rename, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { validateReport } from "../src/report.js";
import { assertReportReady } from "../src/report-readiness.js";
import { renderEmail } from "./email.mjs";

export function encryptArchive(archive, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64url"), iv);
  cipher.setAAD(Buffer.from("daily-coach-v1"));
  const compressed = gzipSync(Buffer.from(JSON.stringify(archive)));
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final(), cipher.getAuthTag()]);
  return { version: 1, algorithm: "AES-256-GCM", compression: "gzip", iv: iv.toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}

export function decryptArchive(payload, key) {
  const bytes = Buffer.from(payload.ciphertext, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64url"), Buffer.from(payload.iv, "base64url"));
  cipher.setAAD(Buffer.from("daily-coach-v1"));
  cipher.setAuthTag(bytes.subarray(-16));
  const plaintext = Buffer.concat([cipher.update(bytes.subarray(0, -16)), cipher.final()]);
  return JSON.parse((payload.compression === "gzip" ? gunzipSync(plaintext) : plaintext).toString("utf8"));
}

async function atomicWrite(path, content, mode = 0o600) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, content, { mode });
  await rename(temporary, path);
  await chmod(path, mode);
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Run node scripts/publish-report.mjs .local/report.private.json");
  const report = validateReport(JSON.parse(await readFile(resolve(input), "utf8")));
  assertReportReady(report);
  const configPath = resolve(process.env.COACH_CONFIG || ".local/config.private.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (!/^[A-Za-z0-9_-]{43}$/.test(config.archiveKey || "")) throw new Error("A 32-byte base64url archive key is required in the private config.");
  const output = resolve(".local/archive.enc.json");
  let archive = { version: 1, reports: [] };
  try {
    archive = decryptArchive(JSON.parse(await readFile(output, "utf8")), config.archiveKey);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  archive.reports = [...archive.reports.filter(existing => existing.date !== report.date), report].sort((a, b) => b.date.localeCompare(a.date));
  const payload = encryptArchive(archive, config.archiveKey);
  const encrypted = JSON.stringify(payload) + "\n";
  await atomicWrite(output, encrypted);
  const reportPayload = encryptArchive({ version: 1, reports: [report] }, config.archiveKey);
  const privateUrl = `${config.siteUrl}#key=${config.archiveKey}&iv=${reportPayload.iv}&data=${reportPayload.ciphertext}`;
  await atomicWrite(resolve(".local/report-link.private.json"), JSON.stringify({ url: privateUrl, date: report.date }));
  const email = renderEmail(report, privateUrl);
  await atomicWrite(resolve(".local/report.email.html"), email.html);
  await atomicWrite(resolve(".local/report.email.txt"), email.text);
  await atomicWrite(resolve(".local/email.private.json"), JSON.stringify({ to: config.email, subject: email.subject, payload: { mime_type: "multipart/alternative", parts: [{ mime_type: "text/plain", body: { content: email.text } }, { mime_type: "text/html", body: { content: email.html } }] } }));
  await atomicWrite(resolve(".local/last-report.private.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status: "prepared", date: report.date, archiveReports: archive.reports.length, emailBytes: Buffer.byteLength(email.html), privateLinkCharacters: privateUrl.length, encryptedBytes: Buffer.byteLength(encrypted), emailFile: ".local/email.private.json", privateArchiveFile: ".local/archive.enc.json" }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
