import { createHash } from "node:crypto";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/** Left out of the precache: source maps, the worker itself, Vite's manifest, brand originals, the link preview, and the WOFF fallbacks every service-worker browser skips for WOFF2. */
const SKIP = [/\.map$/, /^sw\.js$/, /^\.vite\//, /^brand\//, /^pwa\/og-image\.png$/, /\.woff$/];

/** Source folder of the route-level pages: their chunks are precached so the app opens offline on any route. */
const ROUTE_SOURCE = /^src\/pages\//;

type ManifestChunk = {
    file: string;
    src?: string;
    isEntry?: boolean;
    imports?: string[];
    dynamicImports?: string[];
    css?: string[];
};

function listFiles(dir: string, base = dir): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join("/")];
    });
}

/**
 * The files of the app shell, from Vite's manifest: the entry chunk and everything it imports statically, the
 * route-level page chunks (with their own static imports) and the stylesheets of all of them. Every other lazy
 * chunk is left to the worker's runtime cache, which keeps it after its first use.
 */
function shellChunks(manifest: Record<string, ManifestChunk>): string[] {
    const files = new Set<string>();
    const seen = new Set<string>();
    const visit = (key: string) => {
        const chunk = manifest[key];
        if (!chunk || seen.has(key)) return;
        seen.add(key);
        files.add(chunk.file);
        for (const css of chunk.css ?? []) files.add(css);
        for (const imported of chunk.imports ?? []) visit(imported);
    };
    const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry);
    for (const [key] of entries) visit(key);
    for (const [key] of entries) {
        for (const dynamic of manifest[key].dynamicImports ?? []) {
            if (ROUTE_SOURCE.test(manifest[dynamic]?.src ?? "")) visit(dynamic);
        }
    }
    return [...files];
}

/**
 * Writes `sw.js` into the build: `service-worker/sw.js` with the files to precache and a version derived from
 * the content of the whole build, so every deploy that changes the app installs a new worker and offers the reload.
 */
export function serviceWorker(): Plugin {
    let config: ResolvedConfig;
    return {
        name: "rinia:service-worker",
        apply: "build",
        config() {
            return { build: { manifest: true } };
        },
        configResolved(resolved) {
            config = resolved;
        },
        closeBundle() {
            const outDir = path.resolve(config.root, config.build.outDir);
            const manifestFile = path.join(outDir, ".vite/manifest.json");
            const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as Record<string, ManifestChunk>;
            const files = listFiles(outDir).filter((file) => !SKIP.some((pattern) => pattern.test(file)));

            const chunks = new Set(shellChunks(manifest));
            const precache = files.filter((file) => (file.startsWith("assets/") ? chunks.has(file) || file.endsWith(".woff2") : true)).sort();
            if (!precache.includes("index.html")) throw new Error("service worker: index.html is missing from the build");

            const hash = createHash("sha256");
            for (const file of files) hash.update(file).update(readFileSync(path.join(outDir, file)));
            const version = hash.digest("hex").slice(0, 16);

            const template = readFileSync(path.resolve(config.root, "service-worker/sw.js"), "utf8");
            const source = template
                .replace("self.__RINIA_VERSION__", JSON.stringify(version))
                .replace("self.__RINIA_PRECACHE__", JSON.stringify(precache.map((file) => `/${file}`)));
            writeFileSync(path.join(outDir, "sw.js"), source);
            // Only the build needed the manifest; there is no reason to serve it.
            rmSync(path.dirname(manifestFile), { recursive: true });
        },
    };
}
