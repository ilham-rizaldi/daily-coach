import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCipheriv, pbkdf2Sync, randomBytes, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { demoReport } from "../src/demo.js";
import { openArchive, parseAccessInput } from "../src/archive.js";
import { encryptArchive } from "../scripts/publish-report.mjs";

const page = readFileSync(new URL("../public/open.html", import.meta.url), "utf8");
const script = page.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

function envelope() {
  const key = randomBytes(32);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = pbkdf2Sync("sample-access-code", salt, 600000, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", wrappingKey, iv);
  cipher.setAAD(Buffer.from("daily-coach-code-v1"));
  const wrapped = Buffer.concat([cipher.update(key), cipher.final(), cipher.getAuthTag()]);
  const payload = encryptArchive({ version: 1, reports: [demoReport] }, key.toString("base64url"));
  return new URLSearchParams({ salt: salt.toString("base64url"), wrapiv: iv.toString("base64url"),
    wrappedkey: wrapped.toString("base64url"), iv: payload.iv, data: payload.ciphertext });
}

function loadPage(params, storage = new Map()) {
  const elements = Object.fromEntries(["access", "open", "status", "code", "report-file"].map(id => [id,
    { value: "", textContent: "", disabled: false, focus() {} }]));
  let submit;
  let selectFile;
  let destination;
  elements.access.addEventListener = (_, callback) => { submit = callback; };
  elements["report-file"].addEventListener = (_, callback) => { selectFile = callback; };
  const location = { hash: "#" + params, href: "https://example.com/daily-coach/open.html#" + params,
    replace(url) { destination = url; } };
  runInNewContext(script, { document: { getElementById: id => elements[id] }, location,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    URL, URLSearchParams, Uint8Array, TextEncoder, atob, btoa, crypto: webcrypto });
  return { elements, destination: () => destination, async selectFile(contents) {
    elements["report-file"].files = [{ size: contents.length, text: async () => contents }];
    await selectFile();
  }, async submit(code) {
    elements.code.value = code;
    await submit({ preventDefault() {} });
  } };
}

test("a correct access code opens the intended authenticated report", async () => {
  const page = loadPage(envelope());
  await page.submit("sample-access-code");
  const target = new URL(page.destination());
  assert.equal(target.pathname, "/daily-coach/");
  const { key, incoming } = parseAccessInput(target.href);
  assert.deepEqual(await openArchive(key, incoming), { version: 1, reports: [demoReport] });
  assert.equal(page.elements.code.value, "");
});

test("the live access page imports a local encrypted report and remembers it after a successful unlock", async () => {
  const params = envelope();
  const storage = new Map();
  const page = loadPage("", storage);
  assert.equal(page.elements.open.disabled, true);
  await page.selectFile(params.toString());
  assert.equal(page.elements.open.disabled, false);
  await page.submit("incorrect-code");
  assert.equal(storage.size, 0);
  await page.submit("sample-access-code");
  assert.ok(page.destination());
  assert.deepEqual([...storage.values()], [params.toString()]);
  const reopened = loadPage("", storage);
  await reopened.submit("sample-access-code");
  assert.equal(reopened.destination(), page.destination());
});

test("invalid files or altered report ciphertext cannot replace a saved encrypted report", async () => {
  const original = envelope();
  const storage = new Map([["daily-coach-wrapped-report", original.toString()]]);
  const page = loadPage("", storage);
  await page.selectFile("not a report");
  assert.equal(page.elements.open.disabled, true);
  const changed = new URLSearchParams(original);
  const ciphertext = changed.get("data");
  changed.set("data", (ciphertext[0] === "A" ? "B" : "A") + ciphertext.slice(1));
  await page.selectFile(changed.toString());
  await page.submit("sample-access-code");
  assert.equal(page.destination(), undefined);
  assert.deepEqual([...storage.values()], [original.toString()]);
});

test("a wrong code keeps the report locked and allows another attempt", async () => {
  const page = loadPage(envelope());
  await page.submit("incorrect-code");
  assert.equal(page.destination(), undefined);
  assert.match(page.elements.status.textContent, /could not open/);
  assert.equal(page.elements.open.disabled, false);
  await page.submit("sample-access-code");
  assert.ok(page.destination());
});

test("missing envelope fields disable opening before cryptographic work", async () => {
  const page = loadPage(new URLSearchParams("iv=bad&data=bad"));
  assert.equal(page.elements.code.disabled, true);
  assert.equal(page.elements.open.disabled, true);
  await page.submit("sample-access-code");
  assert.equal(page.destination(), undefined);
});

test("tampering with a wrapped key cannot expose the report key", async () => {
  const params = envelope();
  const wrapped = params.get("wrappedkey");
  params.set("wrappedkey", (wrapped[0] === "A" ? "B" : "A") + wrapped.slice(1));
  const page = loadPage(params);
  await page.submit("sample-access-code");
  assert.equal(page.destination(), undefined);
  assert.match(page.elements.status.textContent, /could not open/);
});
