import { describe, expect, test } from "bun:test";
import { numberedOptions, optionForKeyEvent, shortcutKey, type KeyLike } from "../src/features/issues/lib/numbered-options";

const key = (value: string, extra: Partial<KeyLike> = {}): KeyLike => ({ key: value, ctrlKey: false, metaKey: false, altKey: false, ...extra });

const priority = ["none", "urgent", "high", "medium", "low"].map((value) => ({ value, clears: value === "none" }));
const assignee = [{ value: null, clears: true }, ...Array.from({ length: 12 }, (_, index) => ({ value: `member-${index + 1}` }))];
const estimate = [{ value: null, clears: true }, ...[1, 2, 3, 5, 8].map((value) => ({ value }))];

describe("numberedOptions", () => {
    test("priority: 1 to 5 in the order shown, no priority first, and there is no 0", () => {
        const menu = numberedOptions(priority);
        expect(menu.numbers).toEqual([1, 2, 3, 4, 5]);
        expect(["1", "2", "3", "4", "5"].map((digit) => menu.optionForKey(digit)?.value)).toEqual(["none", "urgent", "high", "medium", "low"]);
        expect(menu.optionForKey("0")).toBeUndefined();
        expect(menu.optionForKey("6")).toBeUndefined();
        expect(menu.optionForKey("Backspace")).toBeUndefined();
        expect(menu.hint).toBe("1–5");
    });

    test("state: 1 to N", () => {
        const menu = numberedOptions(["a", "b", "c"].map((value) => ({ value })));
        expect(menu.numbers).toEqual([1, 2, 3]);
        expect(menu.optionForKey("0")).toBeUndefined();
        expect(menu.optionForKey("3")?.value).toBe("c");
    });

    test("assignee: unassigned is 1, members follow, only nine options are numbered", () => {
        const menu = numberedOptions(assignee);
        expect(menu.numbers.slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, null]);
        expect(menu.numbers[12]).toBeNull();
        expect(menu.optionForKey("1")?.value).toBeNull();
        expect(menu.optionForKey("9")?.value).toBe("member-8");
    });

    test("estimate: numbered by value, Backspace clears, 4 and 6 do nothing", () => {
        const menu = numberedOptions(estimate, "value");
        expect(menu.numbers).toEqual([null, 1, 2, 3, 5, 8]);
        expect(menu.labels).toEqual(["⌫", "1", "2", "3", "5", "8"]);
        expect(["1", "2", "3", "5", "8"].map((digit) => menu.optionForKey(digit)?.value)).toEqual([1, 2, 3, 5, 8]);
        expect(menu.optionForKey("Backspace")?.value).toBeNull();
        expect(menu.optionForKey("0")).toBeUndefined();
        expect(menu.optionForKey("4")).toBeUndefined();
        expect(menu.optionForKey("6")).toBeUndefined();
        expect(menu.hint).toBeNull();
    });

    test("parent: no numbers, digits stay free for searching, Backspace clears", () => {
        const menu = numberedOptions([{ value: "", clears: true }, { value: "a" }, { value: "b" }], "none");
        expect(menu.numbers).toEqual([null, null, null]);
        expect(menu.labels).toEqual(["⌫", null, null]);
        expect(menu.optionForKey("1")).toBeUndefined();
        expect(menu.optionForKey("Backspace")?.value).toBe("");
        expect(menu.hint).toBeNull();
    });

    test("label, number and aria key read the same assignments", () => {
        const menu = numberedOptions(estimate, "value");
        expect(menu.options.map((option) => menu.labelFor(option))).toEqual(menu.labels as string[]);
        expect(menu.options.map((option) => menu.ariaKeyFor(option))).toEqual(["Backspace", "1", "2", "3", "5", "8"]);
    });

    test("ignores keys that are not assigned", () => {
        const menu = numberedOptions(priority);
        for (const other of ["a", "Enter", "ArrowDown", "!", "10", ""]) expect(menu.optionForKey(other)).toBeUndefined();
    });
});

describe("shortcutKey", () => {
    test("a key counts only with an empty search", () => {
        expect(shortcutKey(key("1"))).toBe("1");
        expect(shortcutKey(key("1"), "RIN-")).toBeNull();
        expect(shortcutKey(key("Backspace"), "R")).toBeNull();
    });

    test("0 is not a shortcut; Delete counts as Backspace", () => {
        expect(shortcutKey(key("0"))).toBeNull();
        expect(shortcutKey(key("Backspace"))).toBe("Backspace");
        expect(shortcutKey(key("Delete"))).toBe("Backspace");
    });

    test("Ctrl, Cmd and Alt leave the key to the browser", () => {
        expect(shortcutKey(key("1", { ctrlKey: true }))).toBeNull();
        expect(shortcutKey(key("1", { metaKey: true }))).toBeNull();
        expect(shortcutKey(key("1", { altKey: true }))).toBeNull();
    });

    test("IME composition is ignored", () => {
        expect(shortcutKey(key("1", { isComposing: true }))).toBeNull();
    });

    test("numpad digits report the same key as the number row", () => {
        expect(shortcutKey(key("3"))).toBe("3");
    });

    test("optionForKeyEvent combines both", () => {
        const menu = numberedOptions(priority);
        expect(optionForKeyEvent(menu, key("3"))?.value).toBe("high");
        expect(optionForKeyEvent(menu, key("3"), "x")).toBeUndefined();
        expect(optionForKeyEvent(menu, key("3", { metaKey: true }))).toBeUndefined();
    });
});
