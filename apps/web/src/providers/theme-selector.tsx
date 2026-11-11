import { useTranslation } from "react-i18next";
import { Select } from "@/components/base/select/select";
import { cx } from "@/utils/cx";
import { themePreferences, type ThemePreference } from "./theme";
import { useTheme } from "./theme-provider";

/**
 * A small preview of a theme: its page color, its accent as a dot, and "Aa" in its text color. These are the
 * themes' own values, not the current theme's tokens, so every option previews itself whichever theme is on.
 */
const swatches = {
    light: { background: "#f9f9fa", border: "rgb(0 0 0 / 12%)", text: "#1b1b1c", accent: "#6d78d5" },
    dark: { background: "#121213", border: "rgb(255 255 255 / 14%)", text: "#f7f8f8", accent: "#5e6ad2" },
} as const;

/** "System" previews whichever theme the system is showing now. */
export function ThemeSwatch({ theme, className }: { theme: ThemePreference; className?: string }) {
    const { resolved } = useTheme();
    const look = swatches[theme === "system" ? resolved : theme];
    return (
        <span
            aria-hidden="true"
            className={cx("inline-flex h-5 w-8 shrink-0 items-center justify-center gap-0.5 overflow-hidden rounded-md text-[10px] leading-none font-medium", className)}
            style={{ background: look.background, color: look.text, boxShadow: `inset 0 0 0 1px ${look.border}` }}
        >
            <span className="size-1 rounded-full" style={{ background: look.accent }} />
            <span>Aa</span>
        </span>
    );
}

export function ThemeSelector() {
    const { t } = useTranslation();
    const { preference, setPreference } = useTheme();
    const labels: Record<ThemePreference, string> = {
        system: t("profile.themeSystem"),
        light: t("profile.themeLight"),
        dark: t("profile.themeDark"),
    };

    return (
        <Select
            size="md"
            aria-label={t("profile.theme")}
            selectedKey={preference}
            onSelectionChange={(value) => {
                if (typeof value === "string") setPreference(value as ThemePreference);
            }}
            items={themePreferences.map((id) => ({ id, label: labels[id], icon: <ThemeSwatch theme={id} /> }))}
        >
            {(item) => (
                <Select.Item id={item.id} icon={item.icon}>
                    {item.label}
                </Select.Item>
            )}
        </Select>
    );
}
