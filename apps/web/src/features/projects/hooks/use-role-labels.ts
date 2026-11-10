import type { AssignableProjectRole, ProjectRole } from "@rinia/shared";
import { useTranslation } from "react-i18next";

export function useRoleLabels(): Record<ProjectRole, string> {
    const { t } = useTranslation();
    return { owner: t("settings.owner"), admin: t("settings.admin"), member: t("settings.member"), viewer: t("settings.viewer"), guest: t("settings.guest") };
}

/** What each role may do, in a few words, for the role picker. */
export function useRoleHints(): Record<AssignableProjectRole, string> {
    const { t } = useTranslation();
    return { admin: t("settings.adminHint"), member: t("settings.memberHint"), viewer: t("settings.viewerHint"), guest: t("settings.guestHint") };
}
