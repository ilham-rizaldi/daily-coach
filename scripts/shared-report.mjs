import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

const privateSettings = ".local/global-access/publish.private.json";
const publisherFormat = /^[A-Za-z0-9_-]{43}$/;

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
  const { passcode } = JSON.parse(await readFile(".local/report-access.private.json", "utf8"));
  if (typeof passcode !== "string" || !passcode.trim()) throw new Error("The shared report access code is missing.");
  if (payload.ciphertext.length > 2_000_000) throw new Error("The encrypted report exceeds the shared viewer limit.");
  const salt = randomBytes(16);
  const wrapiv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pbkdf2Sync(passcode.trim(), salt, 600000, 32, "sha256"), wrapiv);
  cipher.setAAD(Buffer.from("daily-coach-code-v1"));
  const wrapped = Buffer.concat([cipher.update(Buffer.from(archiveKey, "base64url")), cipher.final(), cipher.getAuthTag()]);
  const revision = Date.parse(report.revisedAt || report.compiledAt || report.capturedAt);
  const body = {
    date: report.date, revision,
    envelope: { salt: salt.toString("base64url"), wrapiv: wrapiv.toString("base64url"), wrappedkey: wrapped.toString("base64url"),
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
