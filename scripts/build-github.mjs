import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function checkPublicFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name === ".local" || /(?:\.enc\.json|\.private\.json|\.email\.(?:html|txt))$/.test(entry.name)) {
      throw new Error(`Private report material cannot be published: ${path}`);
    }
    if (entry.isDirectory()) await checkPublicFiles(path);
  }
}
await checkPublicFiles("dist/client");
await rm("docs", { recursive: true, force: true });
await mkdir("docs", { recursive: true });
await cp("dist/client", "docs", { recursive: true });
await writeFile("docs/.nojekyll", "");
console.log("GitHub Pages output is ready in docs/.");
