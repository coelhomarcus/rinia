import { SettingsPage } from "@/components/settings/settings-layout";
import { UserProfilePanel } from "@/features/auth/components/user-profile-panel";
import { useTranslation } from "react-i18next";

export function ProfileSettingsPage() {
    const { t } = useTranslation();
    return (
        <SettingsPage title={t("nav.profile")}>
            <UserProfilePanel />
        </SettingsPage>
    );
}
