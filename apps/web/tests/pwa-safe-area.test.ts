import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const web = join(import.meta.dir, "..");

function read(relative: string) {
    return readFileSync(join(web, relative), "utf8");
}

describe("iOS PWA safe area", () => {
    test("the viewport covers the notch and the status bar is translucent", () => {
        const html = read("index.html");
        expect(html).toContain("viewport-fit=cover");
        expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
    });

    test("the shell, overlays and bulk bar inset with env(safe-area-inset-*)", () => {
        const shell = read("src/components/layout/app-shell.tsx");
        expect(shell).toContain("pt-safe");
        expect(shell).toContain("pr-safe");
        expect(shell).toContain("pl-safe");
        // Pinned to the screen, not sized with viewport units, which an iOS home-screen app can get wrong on launch.
        expect(shell).toContain("fixed inset-0");
        expect(shell).not.toMatch(/className=\{?[`"][^`"]*\bh-dvh\b/);
        // The bottom inset belongs to the shell from md up, and to the tab bar on phones, which sits on the bottom edge.
        expect(shell).toContain("md:pb-safe");
        expect(read("src/components/layout/mobile-tab-bar.tsx")).toContain("pb-safe");

        expect(read("src/components/feedback/toaster.tsx")).toContain("safe-area-inset-bottom");
        expect(read("src/components/base/sheet/sheet.tsx")).toContain("safe-area-inset-bottom");
        expect(read("src/components/application/modals/modal.tsx")).toContain("p-safe-modal");
        expect(read("src/features/issues/components/bulk-action-bar.tsx")).toContain("safe-area-inset-bottom");
    });
});
