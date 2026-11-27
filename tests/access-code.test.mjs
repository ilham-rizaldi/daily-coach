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

function loadPage(params, storage = new Map(), protocol = "https:") {
  const elements = Object.fromEntries(["access", "open", "status", "code", "bookmark-access", "bookmark"].map(id => [id,
    { value: "", textContent: "", disabled: false, focus() {} }]));
  let submit;
  let submitBookmark;
  let destination;
  elements.access.addEventListener = (_, callback) => { submit = callback; };
  elements["bookmark-access"].addEventListener = (_, callback) => { submitBookmark = callback; };
  const location = { protocol, hash: "#" + params, href: "https://example.com/daily-coach/open.html#" + params,
    replace(url) { destination = url; } };
  runInNewContext(script, { document: { getElementById: id => elements[id] }, location,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    URL, URLSearchParams, Uint8Array, TextEncoder, atob, btoa, crypto: webcrypto });
  return { elements, destination: () => destination, async submit(code) {
    elements.code.value = code;
    await submit({ preventDefault() {} });
  }, pasteBookmark(value) {
    elements.bookmark.value = value;
    submitBookmark({ preventDefault() {} });
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

test("a complete private link allows later code-only access on the same browser", async () => {
  const params = envelope();
  const storage = new Map();
  const page = loadPage(params, storage);
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

test("altered report ciphertext cannot replace a saved encrypted report", async () => {
  const original = envelope();
  const storage = new Map([["daily-coach-wrapped-report", original.toString()]]);
  const changed = new URLSearchParams(original);
  const ciphertext = changed.get("data");
  changed.set("data", (ciphertext[0] === "A" ? "B" : "A") + ciphertext.slice(1));
  const page = loadPage(changed, storage);
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

test("a bare or incomplete link offers bookmark recovery instead of asking for a code", () => {
  const page = loadPage(new URLSearchParams("iv=bad&data=bad"));
  assert.equal(page.elements.access.hidden, true);
  assert.equal(page.elements["bookmark-access"].hidden, false);
  page.pasteBookmark("https://performance-desk-report.ilhamngeprint.chatgpt.site/open");
  assert.equal(page.destination(), undefined);
  assert.match(page.elements.status.textContent, /full private link/);
});

test("a private bookmark opens the live report with the token in its fragment only", () => {
  const token = "A".repeat(43);
  const fragment = "latest=" + token;
  const expected = "https://performance-desk-report.ilhamngeprint.chatgpt.site/open#" + fragment;
  assert.equal(loadPage(fragment).destination(), expected);
  const page = loadPage("");
  page.pasteBookmark("https://example.com/open#" + fragment);
  assert.equal(page.destination(), undefined);
  page.pasteBookmark("https://ilham-rizaldi.github.io/daily-coach/open.html#" + fragment);
  assert.equal(page.destination(), expected);
});

test("the bare local page opens the live access form", () => {
  const page = loadPage("", new Map(), "file:");
  assert.equal(page.destination(), "https://ilham-rizaldi.github.io/daily-coach/open.html");
  assert.doesNotMatch(readFileSync(new URL("../public/open.html", import.meta.url), "utf8"), /type="file"/);
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
