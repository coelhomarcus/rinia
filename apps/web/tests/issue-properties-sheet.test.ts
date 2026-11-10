import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const web = join(import.meta.dir, "..");
const read = (relative: string) => readFileSync(join(web, relative), "utf8");

describe("issue properties on a phone", () => {
    test("the issue page keeps the side rail on desktop and a bottom sheet below md", () => {
        const page = read("src/features/issues/components/issue-view/issue-page.tsx");
        expect(page).toContain('useBreakpoint("lg")');
        expect(page).toContain('useBreakpoint("md")');
        expect(page).toContain('side="bottom"');
        expect(page).toContain("IssuePropertyChips");
        expect(page).toContain("<aside");
        expect(page).toContain('presentation={compact ? "sheet" : "popover"}');
    });

    test("the sheet slides up from the bottom and insets the home indicator", () => {
        const sheet = read("src/components/base/sheet/sheet.tsx");
        expect(sheet).toContain('side?: "right" | "bottom"');
        expect(sheet).toContain("safe-area-inset-bottom");
        expect(sheet).toContain("translate-y");
    });
});
