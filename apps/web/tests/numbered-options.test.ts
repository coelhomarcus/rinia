import { describe, expect, test } from "bun:test";
import { numberedOptions, optionForKeyEvent, shortcutDigit, type KeyLike } from "../src/features/issues/lib/numbered-options";

const key = (value: string, extra: Partial<KeyLike> = {}): KeyLike => ({ key: value, ctrlKey: false, metaKey: false, altKey: false, ...extra });

const priority = ["none", "urgent", "high", "medium", "low"].map((value) => ({ value, clears: value === "none" }));
const assignee = [{ value: null, clears: true }, ...Array.from({ length: 12 }, (_, index) => ({ value: `member-${index + 1}` }))];
const estimate = [{ value: null, clears: true }, ...[1, 2, 3, 5, 8].map((value) => ({ value }))];

describe("numberedOptions", () => {
    test("priority: 0 is no priority, 1 to 4 are urgent to low", () => {
        const menu = numberedOptions(priority);
        expect(menu.numbers).toEqual([0, 1, 2, 3, 4]);
        expect(["0", "1", "2", "3", "4"].map((digit) => menu.optionForKey(digit)?.value)).toEqual(["none", "urgent", "high", "medium", "low"]);
        expect(menu.optionForKey("5")).toBeUndefined();
        expect(menu.hint).toBe("0–4");
    });

    test("state: no clear option, so 1 to N and 0 does nothing", () => {
        const menu = numberedOptions(["a", "b", "c"].map((value) => ({ value })));
        expect(menu.numbers).toEqual([1, 2, 3]);
        expect(menu.optionForKey("0")).toBeUndefined();
        expect(menu.optionForKey("3")?.value).toBe("c");
        expect(menu.hint).toBe("1–3");
    });

    test("assignee: 0 unassigned, members 1 to 9, the rest unnumbered", () => {
        const menu = numberedOptions(assignee);
        expect(menu.numbers.slice(0, 11)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, null]);
        expect(menu.numbers[12]).toBeNull();
        expect(menu.optionForKey("0")?.value).toBeNull();
        expect(menu.optionForKey("9")?.value).toBe("member-9");
    });

    test("estimate: numbered by value, 0 clears, 4 and 6 do nothing", () => {
        const menu = numberedOptions(estimate, "value");
        expect(menu.numbers).toEqual([0, 1, 2, 3, 5, 8]);
        expect(["0", "1", "2", "3", "5", "8"].map((digit) => menu.optionForKey(digit)?.value)).toEqual([null, 1, 2, 3, 5, 8]);
        expect(menu.optionForKey("4")).toBeUndefined();
        expect(menu.optionForKey("6")).toBeUndefined();
        expect(menu.hint).toBeNull();
    });

    test("parent: only 0 clears, other digits stay free for searching", () => {
        const menu = numberedOptions([{ value: "", clears: true }, { value: "a" }, { value: "b" }], "none");
        expect(menu.numbers).toEqual([0, null, null]);
        expect(menu.optionForKey("0")?.value).toBe("");
        expect(menu.optionForKey("1")).toBeUndefined();
        expect(menu.hint).toBeNull();
    });

    test("numberFor reads the same numbers", () => {
        const menu = numberedOptions(estimate, "value");
        expect(menu.options.map((option) => menu.numberFor(option))).toEqual(menu.numbers as number[]);
    });

    test("ignores keys that are not digits", () => {
        const menu = numberedOptions(priority);
        for (const other of ["a", "Enter", "ArrowDown", "!", "10", ""]) expect(menu.optionForKey(other)).toBeUndefined();
    });
});

describe("shortcutDigit", () => {
    test("a digit counts only with an empty search", () => {
        expect(shortcutDigit(key("1"))).toBe("1");
        expect(shortcutDigit(key("1"), "")).toBe("1");
        expect(shortcutDigit(key("1"), "RIN-")).toBeNull();
    });

    test("Ctrl, Cmd and Alt leave the key to the browser", () => {
        expect(shortcutDigit(key("1", { ctrlKey: true }))).toBeNull();
        expect(shortcutDigit(key("1", { metaKey: true }))).toBeNull();
        expect(shortcutDigit(key("1", { altKey: true }))).toBeNull();
    });

    test("IME composition is ignored", () => {
        expect(shortcutDigit(key("1", { isComposing: true }))).toBeNull();
    });

    test("numpad digits report the same key as the number row", () => {
        expect(shortcutDigit(key("3"))).toBe("3");
    });

    test("optionForKeyEvent combines both", () => {
        const menu = numberedOptions(priority);
        expect(optionForKeyEvent(menu, key("2"))?.value).toBe("high");
        expect(optionForKeyEvent(menu, key("2"), "x")).toBeUndefined();
        expect(optionForKeyEvent(menu, key("2", { metaKey: true }))).toBeUndefined();
    });
});
