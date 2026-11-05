export async function openArchive(key, payload) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error("Use the complete private link from your coaching email.");
  if (payload.version !== 1 || payload.algorithm !== "AES-256-GCM") throw new Error("This archive format is unsupported.");
  const decode = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("raw", decode(key), "AES-GCM", false, ["decrypt"]);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(payload.iv), additionalData: new TextEncoder().encode("daily-coach-v1") }, cryptoKey, decode(payload.ciphertext));
  } catch {
    throw new Error("The access key could not unlock this archive. Open the latest private link from your coaching email.");
  }
  if (payload.compression === "gzip") {
    const stream = new Blob([plaintext]).stream().pipeThrough(new DecompressionStream("gzip"));
    plaintext = await new Response(stream).arrayBuffer();
  }
  const archive = JSON.parse(new TextDecoder().decode(plaintext));
  if (!Array.isArray(archive.reports) || !archive.reports.length) throw new Error("The archive has no reports yet.");
  return archive;
}

export function payloadFromFragment(fragment) {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const ciphertext = params.get("data");
  const iv = params.get("iv");
  if (!ciphertext || !iv) return null;
  if (ciphertext.length > 2000000 || !/^[A-Za-z0-9_-]+$/.test(ciphertext) || !/^[A-Za-z0-9_-]{16}$/.test(iv)) {
    throw new Error("This private report link is incomplete or invalid.");
  }
  return { version: 1, algorithm: "AES-256-GCM", compression: "gzip", iv, ciphertext };
}
