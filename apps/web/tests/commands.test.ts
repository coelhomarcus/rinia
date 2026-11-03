import { describe, expect, test } from "bun:test";
import { matchesQuery, normalizeSearch } from "../src/features/commands/match";
import { SHORTCUT_SECTIONS, formatStep, listStep, shortcutKeys } from "../src/features/commands/shortcuts";

const key = (value: string, extra: Partial<KeyboardEvent> = {}) =>
    ({ key: value, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, ...extra }) as KeyboardEvent;

describe("matchesQuery", () => {
    test("ignores case and accents", () => {
        expect(normalizeSearch("Situação")).toBe("situacao");
        expect(matchesQuery("Mudar responsável…", "RESPONSAVEL")).toBe(true);
    });

    test("needs every word, in any order", () => {
        expect(matchesQuery("Mudar estado… status", "estado mudar")).toBe(true);
        expect(matchesQuery("Mudar estado…", "mudar prioridade")).toBe(false);
    });

    test("an empty query matches everything", () => {
        expect(matchesQuery("Inbox", "   ")).toBe(true);
    });
});

describe("listStep", () => {
    test("J and ↓ move down, K and ↑ move up", () => {
        expect([key("j"), key("ArrowDown"), key("J", { shiftKey: false })].map(listStep)).toEqual([1, 1, 1]);
        expect([key("k"), key("ArrowUp")].map(listStep)).toEqual([-1, -1]);
    });

    test("modified keys and other keys do not move", () => {
        expect(listStep(key("k", { metaKey: true }))).toBe(0);
        expect(listStep(key("k", { ctrlKey: true }))).toBe(0);
        expect(listStep(key("J", { shiftKey: true }))).toBe(0);
        expect(listStep(key("j", { isComposing: true }))).toBe(0);
        expect(listStep(key("x"))).toBe(0);
    });
});

describe("shortcuts", () => {
    test("formats modifiers per platform", () => {
        expect(formatStep("mod+k", true)).toEqual(["⌘", "K"]);
        expect(formatStep("mod+k", false)).toEqual(["Ctrl", "K"]);
        expect(formatStep("shift+d", false)).toEqual(["Shift", "D"]);
        expect(formatStep("enter", false)).toEqual(["↵"]);
    });

    test("every shortcut has a unique id and at least one key sequence", () => {
        const ids = SHORTCUT_SECTIONS.flatMap((section) => section.shortcuts.map((shortcut) => shortcut.id));
        expect(new Set(ids).size).toBe(ids.length);
        for (const section of SHORTCUT_SECTIONS) for (const shortcut of section.shortcuts) expect(shortcut.keys.length).toBeGreaterThan(0);
    });

    test("the palette's hints come from the same list as the ? panel", () => {
        expect(shortcutKeys("inbox")).toEqual(["g", "i"]);
        expect(shortcutKeys("create")).toEqual(["c"]);
        expect(shortcutKeys("missing")).toBeUndefined();
    });
});
