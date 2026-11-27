import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

const privateSettings = ".local/global-access/publish.private.json";
const publisherFormat = /^[A-Za-z0-9_-]{43}$/;
const linkDigest = (context, token) => createHash("sha256").update(`${context}:${token}`).digest();

async function wrapArchiveKey(config, archiveKey) {
  const wrapiv = randomBytes(12);
  let mode = {};
  let context = "daily-coach-code-v1";
  let key;
  if (config.linkToken != null) {
    if (!publisherFormat.test(config.linkToken)) throw new Error("The private report link is invalid.");
    context = "daily-coach-link-v1";
    key = linkDigest(context, config.linkToken);
    mode = { mode: "link-v1", linkDigest: linkDigest("daily-coach-link-id-v1", config.linkToken).toString("base64url") };
  } else {
    const { passcode } = JSON.parse(await readFile(".local/report-access.private.json", "utf8"));
    if (typeof passcode !== "string" || !passcode.trim()) throw new Error("The shared report access code is missing.");
    const salt = randomBytes(16);
    key = pbkdf2Sync(passcode.trim(), salt, 600000, 32, "sha256");
    mode = { salt: salt.toString("base64url") };
  }
  const cipher = createCipheriv("aes-256-gcm", key, wrapiv);
  cipher.setAAD(Buffer.from(context));
  const wrapped = Buffer.concat([cipher.update(Buffer.from(archiveKey, "base64url")), cipher.final(), cipher.getAuthTag()]);
  return { ...mode, wrapiv: wrapiv.toString("base64url"), wrappedkey: wrapped.toString("base64url") };
}

export async function publishSharedReport(report, payload, archiveKey) {
  let config;
  try {
    config = JSON.parse(await readFile(privateSettings, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (!config.enabled) return null;
  const site = new URL(config.url);
  if (site.protocol !== "https:" || !site.hostname.endsWith(".chatgpt.site") || site.username || site.password
    || !publisherFormat.test(config.publisher || "")) throw new Error("The shared report destination is invalid.");
  if (payload.ciphertext.length > 2_000_000) throw new Error("The encrypted report exceeds the shared viewer limit.");
  const revision = Date.parse(report.revisedAt || report.compiledAt || report.capturedAt);
  const body = {
    date: report.date, revision,
    envelope: { ...await wrapArchiveKey(config, archiveKey),
      iv: payload.iv, data: payload.ciphertext },
  };
  let response;
  try {
    response = await fetch(new URL("/api/latest", site), {
      method: "PUT", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.publisher}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("The local report is saved. The shared site could not be reached.");
  }
  if (!response.ok) throw new Error(`The local report is saved. The shared site did not accept this update (HTTP ${response.status}).`);
  const result = await response.json();
  if (result.date !== report.date) throw new Error("The shared site returned a different report date.");
  return result.date;
}
