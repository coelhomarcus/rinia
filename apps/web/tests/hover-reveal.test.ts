import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const web = join(import.meta.dir, "..");
const src = join(web, "src");

function walk(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? walk(path) : path;
    });
}

describe("hover-revealed actions", () => {
    test("can-hover matches devices that actually hover", () => {
        const css = readFileSync(join(web, "src/styles/globals.css"), "utf8");
        expect(css).toContain("@custom-variant can-hover");
        expect(css).toContain("@media (hover: hover) and (pointer: fine)");
    });

    test("actions are not hidden behind hover alone", () => {
        const leftovers: string[] = [];
        for (const path of walk(src)) {
            if (!/\.(tsx|css)$/.test(path)) continue;
            const source = readFileSync(path, "utf8");
            const quoted = source.matchAll(/["'`]([^"'`]*opacity-0[^"'`]*)["'`]/g);
            for (const match of quoted) {
                const classes = match[1];
                if (!/group-hover/.test(classes)) continue;
                if (/\bcan-hover:opacity-0\b/.test(classes)) continue;
                leftovers.push(`${path.slice(src.length + 1)}: ${classes}`);
            }
        }
        expect(leftovers).toEqual([]);
    });
});
