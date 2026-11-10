import type { ReactNode } from "react";
import { InlineNotice } from "@/components/base/feedback/alert";
import { SettingsControl, SettingsGroup, SettingsPage } from "@/components/settings/settings-layout";
import { LanguageSelector } from "@/i18n/language-selector";
import { useLanguage } from "@/i18n/language-provider";
import { useDensity } from "@/providers/density";
import { DensitySelector } from "@/providers/density-selector";
import { ThemeSelector } from "@/providers/theme-selector";
import { useTranslation } from "react-i18next";

/** A row's hint, and under it the notice when its change has not reached the account yet. */
function withSyncNotice(hint: string, notice: string | false): ReactNode {
    return (
        <>
            {hint}
            {notice && <InlineNotice tone="warning" className="mt-1">{notice}</InlineNotice>}
        </>
    );
}

export function PreferencesSettingsPage() {
    const { t } = useTranslation();
    const language = useLanguage();
    const density = useDensity();
    return (
        <SettingsPage title={t("nav.preferences")} description={t("settings.preferencesDescription")}>
            <SettingsGroup title={t("settings.general")}>
                <SettingsControl title={t("common.language")} description={withSyncNotice(t("profile.languageDescription"), language.syncFailed && t("common.languageNotSynced"))}>
                    <LanguageSelector />
                </SettingsControl>
            </SettingsGroup>
            <SettingsGroup title={t("settings.interfaceAndTheme")}>
                <SettingsControl title={t("profile.theme")} description={t("profile.themeDescription")}>
                    <ThemeSelector />
                </SettingsControl>
                <SettingsControl title={t("profile.density")} description={withSyncNotice(t("profile.densityDescription"), density.syncFailed && t("profile.densityNotSynced"))}>
                    <DensitySelector />
                </SettingsControl>
            </SettingsGroup>
        </SettingsPage>
    );
}
