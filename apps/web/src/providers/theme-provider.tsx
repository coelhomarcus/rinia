import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { applyTheme, readThemePreference, subscribeToSystemTheme, THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference } from "./theme";

interface ThemeContextValue {
    preference: ThemePreference;
    /** The theme on screen: the preference, or what the OS asks for while it is "system". */
    resolved: ResolvedTheme;
    setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
    const [resolved, setResolved] = useState<ResolvedTheme>(() => applyTheme(preference));

    useEffect(() => {
        setResolved(applyTheme(preference));
        if (preference !== "system") return;
        return subscribeToSystemTheme(() => setResolved(applyTheme("system")));
    }, [preference]);

    const setPreference = (next: ThemePreference) => {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            // Storage can be blocked; the choice then lasts until the tab closes.
        }
        setPreferenceState(next);
    };

    return <ThemeContext.Provider value={{ preference, resolved, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error("useTheme must be used within ThemeProvider");
    return context;
}
