/**
 * The number keys of a property menu. One rule for every menu on the issue screen, board cards and list rows:
 * `1`-`9` pick the options in the order shown (estimates: the option with that value), and Backspace picks the
 * option that clears the value where it has no number of its own. There is no `0`: it is too far from `1`.
 * The key a menu displays and the key it handles both come from `numberedOptions`, so they never diverge.
 */

/** What numbering needs to know about an option; menus pass their own richer option objects. */
export interface NumberableOption {
    /** Picking it empties the property (no priority, unassigned, no estimate, no parent). */
    clears?: boolean;
    /** The property's own value; `"value"` numbering reads it. */
    value?: unknown;
}

/**
 * `positional`: the n-th option is `n`, the clearing one included (state, priority, assignee).
 * `value`: an option is numbered by its own numeric value (estimate: 1 2 3 5 8); the clearing option is Backspace.
 * `none`: a long searchable list (parent issue) has no numbers, so digits stay free for searching; only Backspace clears.
 */
export type NumberingMode = "positional" | "value" | "none";

/** Only a single digit can be typed, so a menu numbers at most nine options. */
const MAX_DIGIT = 9;

/** What a key shows as in a menu. */
export const BACKSPACE_LABEL = "⌫";

export interface NumberedOptions<T extends NumberableOption> {
    options: readonly T[];
    /** The digit shown next to each option, in `options` order; null where it has none. */
    numbers: ReadonlyArray<number | null>;
    /** What to show next to each option: its digit, "⌫" for the option Backspace picks, or null. */
    labels: ReadonlyArray<string | null>;
    numberFor: (option: T) => number | null;
    /** What to show next to one option (see `labels`). */
    labelFor: (option: T) => string | null;
    /** The option's key as `aria-keyshortcuts` names it ("3", "Backspace"), or undefined. */
    ariaKeyFor: (option: T) => string | undefined;
    /** The option a typed key picks: a digit, or "Backspace"; undefined for anything this menu does not assign. */
    optionForKey: (key: string) => T | undefined;
    /** "1–5" when the numbers run without gaps, otherwise null (an estimate's 1 2 3 5 8 has no honest range). */
    hint: string | null;
}

export function numberedOptions<T extends NumberableOption>(options: readonly T[], mode: NumberingMode = "positional"): NumberedOptions<T> {
    const taken = new Set<number>();
    const numbers = options.map((option, index): number | null => {
        let number: number | null = null;
        if (mode === "positional") number = index + 1;
        else if (mode === "value" && !option.clears && typeof option.value === "number" && Number.isInteger(option.value)) number = option.value;
        if (number === null || number < 1 || number > MAX_DIGIT || taken.has(number)) return null;
        taken.add(number);
        return number;
    });
    const backspaceIndex = mode === "positional" ? -1 : options.findIndex((option) => option.clears);
    const labels = numbers.map((number, index) => (number !== null ? String(number) : index === backspaceIndex ? BACKSPACE_LABEL : null));

    const sorted = [...taken].sort((a, b) => a - b);
    const contiguous = sorted.length > 1 && sorted.every((number, index) => index === 0 || number === sorted[index - 1] + 1);

    return {
        options,
        numbers,
        labels,
        numberFor: (option) => numbers[options.indexOf(option)] ?? null,
        labelFor: (option) => labels[options.indexOf(option)] ?? null,
        ariaKeyFor: (option) => {
            const label = labels[options.indexOf(option)];
            return label === BACKSPACE_LABEL ? "Backspace" : (label ?? undefined);
        },
        optionForKey: (key) => {
            if (key === "Backspace") return backspaceIndex < 0 ? undefined : options[backspaceIndex];
            if (!/^[1-9]$/.test(key)) return undefined;
            const index = numbers.indexOf(Number(key));
            return index < 0 ? undefined : options[index];
        },
        hint: contiguous ? `${sorted[0]}–${sorted[sorted.length - 1]}` : null,
    };
}

/** The parts of a `KeyboardEvent` that decide whether a key is a menu number. */
export interface KeyLike {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    isComposing?: boolean;
}

/**
 * The key a key event types into a menu ("1"-"9" or "Backspace"; Delete counts as Backspace), or null. A key only
 * counts while the search field is empty and no Ctrl, Cmd or Alt is held (Cmd/Ctrl+1 switches browser tabs),
 * and never in the middle of IME composition. Numpad digits report the same `key` as the number row.
 */
export function shortcutKey(event: KeyLike, query = ""): string | null {
    if (query || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return null;
    if (event.key === "Backspace" || event.key === "Delete") return "Backspace";
    return /^[1-9]$/.test(event.key) ? event.key : null;
}

/** The option a key event picks in a numbered menu, or undefined when it is not a number key of that menu. */
export function optionForKeyEvent<T extends NumberableOption>(numbered: NumberedOptions<T>, event: KeyLike, query = ""): T | undefined {
    const key = shortcutKey(event, query);
    return key === null ? undefined : numbered.optionForKey(key);
}
