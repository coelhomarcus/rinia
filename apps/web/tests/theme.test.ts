import { afterEach, beforeEach, expect, test } from "bun:test";
import { readThemePreference, resolveTheme, subscribeToSystemTheme, THEME_STORAGE_KEY } from "../src/providers/theme";

const globals = globalThis as unknown as Record<string, unknown>;
const original = { window: globals.window, localStorage: globals.localStorage };

function setup(stored: string | null, prefersDark: boolean) {
    globals.localStorage = { getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null) };
    globals.window = { matchMedia: () => ({ matches: prefersDark }) };
}

beforeEach(() => setup(null, false));

afterEach(() => {
    globals.window = original.window;
    globals.localStorage = original.localStorage;
});

test("with nothing stored the preference is system", () => {
    expect(readThemePreference()).toBe("system");
});

test("an explicit choice is kept", () => {
    setup("light", true);
    expect(readThemePreference()).toBe("light");
    setup("dark", false);
    expect(readThemePreference()).toBe("dark");
    setup("system", false);
    expect(readThemePreference()).toBe("system");
});

test("the retired high-contrast themes map to their base", () => {
    setup("light-contrast", false);
    expect(readThemePreference()).toBe("light");
    setup("dark-contrast", false);
    expect(readThemePreference()).toBe("dark");
});

test("system resolves with the OS and explicit choices ignore it", () => {
    setup(null, true);
    expect(resolveTheme("system")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    setup(null, false);
    expect(resolveTheme("system")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
});

test("subscribers hear OS changes until they unsubscribe", () => {
    const listeners = new Set<() => void>();
    globals.window = {
        matchMedia: () => ({
            matches: false,
            addEventListener: (_: string, listener: () => void) => listeners.add(listener),
            removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
        }),
    };
    let calls = 0;
    const unsubscribe = subscribeToSystemTheme(() => calls++);
    listeners.forEach((listener) => listener());
    expect(calls).toBe(1);
    unsubscribe();
    expect(listeners.size).toBe(0);
});
