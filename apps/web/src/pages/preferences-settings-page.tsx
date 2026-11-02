import { SettingsControl, SettingsGroup, SettingsPage } from "@/components/settings/settings-layout";
import { LanguageSelector } from "@/i18n/language-selector";
import { useLanguage } from "@/i18n/language-provider";
import { ThemeSelector } from "@/providers/theme-selector";
import { useTranslation } from "react-i18next";

export function PreferencesSettingsPage() {
    const { t } = useTranslation();
    const { syncFailed } = useLanguage();
    return (
        <SettingsPage title={t("nav.preferences")}>
            <SettingsGroup title={t("settings.general")}>
                <SettingsControl title={t("common.language")} description={t("profile.languageDescription")}>
                    <LanguageSelector />
                </SettingsControl>
            </SettingsGroup>
            {syncFailed && <p role="status" className="mt-3 px-4 text-[13px] text-warning-primary">{t("common.languageNotSynced")}</p>}
            <SettingsGroup title={t("settings.interfaceAndTheme")}>
                <SettingsControl title={t("profile.theme")} description={t("profile.themeDescription")}>
                    <ThemeSelector />
                </SettingsControl>
            </SettingsGroup>
        </SettingsPage>
    );
}
