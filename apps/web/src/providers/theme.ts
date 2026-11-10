export const THEME_STORAGE_KEY = "rinia-theme";

export const themePreferences = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof themePreferences)[number];

export type ResolvedTheme = Exclude<ThemePreference, "system">;

const DARK_QUERY = "(prefers-color-scheme: dark)";

const themePreferenceSet = new Set<string>(themePreferences);

export function isThemePreference(value: string | null): value is ThemePreference {
    return value !== null && themePreferenceSet.has(value);
}

/** With nothing stored the interface follows the OS. Older builds also stored high-contrast themes; those map to their light or dark base. */
export function readThemePreference(): ThemePreference {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (isThemePreference(stored)) return stored;
        if (stored === "light-contrast") return "light";
        if (stored === "dark-contrast") return "dark";
    } catch {
        // Storage can be blocked; follow the OS.
    }
    return "system";
}

function systemTheme(): ResolvedTheme {
    return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
    return preference === "system" ? systemTheme() : preference;
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
    const resolved = resolveTheme(preference);
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    root.style.colorScheme = resolved;
    root.classList.toggle("dark-mode", resolved === "dark");
    // Code highlighted by twinkleplop switches its theme on `.dark`.
    root.classList.toggle("dark", resolved === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#090909" : "#f4f4f5");
    return resolved;
}

/** Calls `onChange` whenever the OS switches between light and dark. Returns the unsubscribe function. */
export function subscribeToSystemTheme(onChange: () => void): () => void {
    if (typeof window.matchMedia !== "function") return () => {};
    const query = window.matchMedia(DARK_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}
