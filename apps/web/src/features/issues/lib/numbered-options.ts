/**
 * The number keys of a property menu. One rule for every menu on the issue screen, board cards and list rows:
 * `0` clears the value, `1`-`9` pick the options in the order shown (or, for estimates, the option with that
 * value). The number a menu displays and the key it handles both come from `numberedOptions`, so they never diverge.
 */

/** What numbering needs to know about an option; menus pass their own richer option objects. */
export interface NumberableOption {
    /** Picking it empties the property (no priority, unassigned, no estimate, no parent). It is `0`. */
    clears?: boolean;
    /** The property's own value; `"value"` numbering reads it. */
    value?: unknown;
}

/**
 * `positional`: the n-th option that does not clear is `n` (state, priority, assignee).
 * `value`: an option is numbered by its own numeric value (estimate: 1 2 3 5 8).
 * `none`: only `0` clears; a long searchable list (parent issue) has no numbers, so digits stay free for searching.
 */
export type NumberingMode = "positional" | "value" | "none";

/** Only a single digit can be typed, so a menu numbers at most nine options besides the one `0` clears. */
const MAX_DIGIT = 9;

export interface NumberedOptions<T extends NumberableOption> {
    options: readonly T[];
    /** The number shown next to each option, in `options` order; null where it has none. */
    numbers: ReadonlyArray<number | null>;
    numberFor: (option: T) => number | null;
    /** The option a typed digit picks; undefined for anything that is not a digit this menu numbers. */
    optionForKey: (key: string) => T | undefined;
    /** "0–4" when the numbers run without gaps, otherwise null (an estimate's 1 2 3 5 8 has no honest range). */
    hint: string | null;
}

export function numberedOptions<T extends NumberableOption>(options: readonly T[], mode: NumberingMode = "positional"): NumberedOptions<T> {
    const taken = new Set<number>();
    let position = 0;
    const numbers = options.map((option): number | null => {
        let number: number | null = null;
        if (option.clears) number = 0;
        else if (mode === "positional") number = ++position;
        else if (mode === "value" && typeof option.value === "number" && Number.isInteger(option.value)) number = option.value;
        if (number === null || number < 0 || number > MAX_DIGIT || taken.has(number)) return null;
        taken.add(number);
        return number;
    });

    const sorted = [...taken].sort((a, b) => a - b);
    const contiguous = sorted.length > 1 && sorted.every((number, index) => index === 0 || number === sorted[index - 1] + 1);

    return {
        options,
        numbers,
        numberFor: (option) => numbers[options.indexOf(option)] ?? null,
        optionForKey: (key) => {
            if (!/^[0-9]$/.test(key)) return undefined;
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
 * The digit a key event types into a menu, or null. A key only counts while the search field is empty
 * and no Ctrl, Cmd or Alt is held (Cmd/Ctrl+1 switches browser tabs), and never in the middle of IME composition.
 * Numpad digits report the same `key` as the number row.
 */
export function shortcutDigit(event: KeyLike, query = ""): string | null {
    if (query || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return null;
    return /^[0-9]$/.test(event.key) ? event.key : null;
}

/** The option a key event picks in a numbered menu, or undefined when it is not a number key of that menu. */
export function optionForKeyEvent<T extends NumberableOption>(numbered: NumberedOptions<T>, event: KeyLike, query = ""): T | undefined {
    const digit = shortcutDigit(event, query);
    return digit === null ? undefined : numbered.optionForKey(digit);
}
