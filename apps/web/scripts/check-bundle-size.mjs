/**
 * Fails when the production build is heavier than `bundle-budget.json` allows. Run it after `vite build`.
 *
 * It reads `dist/` the way a browser does on a cold load: the entry chunk and everything it imports statically, then the
 * route's chunk and what it imports statically. Chunks reached only through `import()` are not counted, which is the
 * point of splitting them: the editor, drag and drop, and the syntax highlighter load when a page needs them.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const assets = join(dist, "assets");
const budget = JSON.parse(readFileSync(join(root, "bundle-budget.json"), "utf8"));

const files = readdirSync(assets);
const jsFiles = files.filter((file) => file.endsWith(".js"));
const cssFiles = files.filter((file) => file.endsWith(".css"));
const kb = (bytes) => bytes / 1024;
const read = (file) => readFileSync(join(assets, file), "utf8");
const gzipKb = (file) => kb(gzipSync(readFileSync(join(assets, file))).length);

/** `import "./x.js"`, `import { a } from "./x.js"` and `export * from "./x.js"`, but not `import("./x.js")`. */
const STATIC_IMPORT = /(?:^|[;}\n])\s*(?:import|export)\s*(?:[^'"()]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g;
const staticImports = new Map();
function importsOf(file) {
    if (!staticImports.has(file)) staticImports.set(file, [...read(file).matchAll(STATIC_IMPORT)].map((match) => match[1]).filter((name) => jsFiles.includes(name)));
    return staticImports.get(file);
}
function closure(file, seen = new Set()) {
    if (seen.has(file)) return seen;
    seen.add(file);
    for (const imported of importsOf(file)) closure(imported, seen);
    return seen;
}
const total = (set) => [...set].reduce((sum, file) => sum + gzipKb(file), 0);

const html = readFileSync(join(dist, "index.html"), "utf8");
const entryName = /<script[^>]+src="\/assets\/([^"]+\.js)"/.exec(html)?.[1];
if (!entryName) throw new Error("bundle size: no entry script in dist/index.html. Run the build first.");
const entry = closure(entryName);

const rows = [];
const failures = [];
const check = (label, actual, max) => {
    rows.push({ label, actual, max });
    if (actual > max) failures.push(`${label} is ${actual.toFixed(1)} KB gzip, over its budget of ${max} KB`);
};

check("entry (every route)", total(entry), budget.entryMaxKb);
for (const [route, { chunk, maxKb }] of Object.entries(budget.routes)) {
    const file = jsFiles.find((name) => name.startsWith(`${chunk}-`));
    if (!file) {
        failures.push(`route "${route}": no chunk named ${chunk}-*.js in the build`);
        continue;
    }
    check(`route ${route}`, total(new Set([...entry, ...closure(file)])), maxKb);
}
check("stylesheet", Math.max(...cssFiles.map(gzipKb)), budget.cssMaxKb);
check("JS files emitted", jsFiles.length, budget.jsFilesMax);

const width = Math.max(...rows.map((row) => row.label.length));
for (const { label, actual, max } of rows) {
    const unit = label === "JS files emitted" ? "" : " KB gzip";
    console.log(`${actual > max ? "FAIL" : "ok  "}  ${label.padEnd(width)}  ${actual.toFixed(label === "JS files emitted" ? 0 : 1).padStart(6)}${unit}  (budget ${max})`);
}
if (failures.length > 0) {
    console.error(`\n${failures.join("\n")}\nSee bundle-budget.json. A change that adds weight on purpose raises the number in the same pull request.`);
    process.exit(1);
}
