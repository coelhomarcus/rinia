import { Moon, Sun } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@/components/base/select/select";
import { themePreferences, type ThemePreference } from "./theme";
import { useTheme } from "./theme-provider";

const themeIcons: Record<ThemePreference, FC> = {
    light: Sun,
    dark: Moon,
};

export function ThemeSelector() {
    const { t } = useTranslation();
    const { preference, setPreference } = useTheme();
    const labels: Record<ThemePreference, string> = {
        light: t("profile.themeLight"),
        dark: t("profile.themeDark"),
    };

    return (
        <Select
            size="sm"
            className="w-48"
            aria-label={t("profile.theme")}
            selectedKey={preference}
            onSelectionChange={(value) => {
                if (typeof value === "string") setPreference(value as ThemePreference);
            }}
            items={themePreferences.map((id) => ({ id, label: labels[id], icon: themeIcons[id] }))}
        >
            {(item) => <Select.Item id={item.id} icon={item.icon}>{item.label}</Select.Item>}
        </Select>
    );
}
