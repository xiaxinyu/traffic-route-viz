/**
 * Minimal SPEC_CODING.md §11 guardrails: fail CI if core persistence/export contracts are removed by accident.
 * Run from repo root: node tools/check-spec.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const checks = [
  {
    name: "diagramPersist manual edge marker",
    file: "web/src/diagramPersist.ts",
    ok: (s) =>
      s.includes("e.data?.manual === true") &&
      s.includes("manual: true") &&
      s.includes("export function mergeComputedEdgesKeepingManualWithNodeRemap"),
  },
  {
    name: "diagramExportPng full-graph bounds",
    file: "web/src/diagramExportPng.ts",
    ok: (s) =>
      s.includes("getNodesBounds") &&
      s.includes("getViewportForBounds") &&
      s.includes("function computePngExportFrame"),
  },
];

let failed = false;
for (const { name, file, ok } of checks) {
  const text = read(file);
  if (!ok(text)) {
    console.error(`check-spec: FAIL — ${name} (${file})`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("check-spec: OK");
