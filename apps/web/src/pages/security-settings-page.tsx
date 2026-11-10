import { SettingsPage } from "@/components/settings/settings-layout";
import { ActiveSessionsPanel } from "@/features/auth/components/active-sessions-panel";
import { ChangePasswordPanel } from "@/features/auth/components/change-password-panel";
import { useTranslation } from "react-i18next";

/** The account's password and the browsers signed in to it. */
export function SecuritySettingsPage() {
    const { t } = useTranslation();
    return (
        <SettingsPage title={t("nav.security")} description={t("security.description")}>
            <ChangePasswordPanel />
            <ActiveSessionsPanel />
        </SettingsPage>
    );
}
