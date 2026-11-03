import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/** Left out of the precache: source maps, the worker itself, brand originals, the link preview, and the WOFF fallbacks every service-worker browser skips for WOFF2. */
const SKIP = [/\.map$/, /^sw\.js$/, /^brand\//, /^pwa\/og-image\.png$/, /\.woff$/];

function listFiles(dir: string, base = dir): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join("/")];
    });
}

/**
 * Writes `sw.js` into the build: `service-worker/sw.js` with the files to precache and a version derived from
 * their content, so every deploy that changes the app installs a new worker and offers the reload.
 */
export function serviceWorker(): Plugin {
    let config: ResolvedConfig;
    return {
        name: "rinia:service-worker",
        apply: "build",
        configResolved(resolved) {
            config = resolved;
        },
        closeBundle() {
            const outDir = path.resolve(config.root, config.build.outDir);
            const files = listFiles(outDir)
                .filter((file) => !SKIP.some((pattern) => pattern.test(file)))
                .sort();
            const hash = createHash("sha256");
            for (const file of files) hash.update(file).update(readFileSync(path.join(outDir, file)));
            const version = hash.digest("hex").slice(0, 16);
            const template = readFileSync(path.resolve(config.root, "service-worker/sw.js"), "utf8");
            const source = template
                .replace("self.__RINIA_VERSION__", JSON.stringify(version))
                .replace("self.__RINIA_PRECACHE__", JSON.stringify(files.map((file) => `/${file}`)));
            writeFileSync(path.join(outDir, "sw.js"), source);
        },
    };
}
