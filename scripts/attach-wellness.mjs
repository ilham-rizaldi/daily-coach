import { readFile, writeFile, rename, chmod } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { attachWellnessHistory } from "../src/wellnessHistory.js";
import { validateReport } from "../src/report.js";

const [reportPath, capturePath] = process.argv.slice(2);
if (!reportPath || !capturePath || !basename(reportPath).endsWith(".private.json")) throw new Error("Use a .private.json report path and validated wellness capture path.");
const path = resolve(reportPath);
const original = JSON.parse(await readFile(path, "utf8"));
const report = validateReport(attachWellnessHistory(original, JSON.parse(await readFile(resolve(capturePath), "utf8"))));
const temporary = `${path}.wellness.tmp`;
await writeFile(temporary, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
await rename(temporary, path);
await chmod(path, 0o600);
console.log(JSON.stringify({ status: "attached", date: report.date, wellnessDates: report.wellnessHistory.rows.length, capturedAtPreserved: report.capturedAt === original.capturedAt }));
