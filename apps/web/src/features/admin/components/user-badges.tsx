import { Badge } from "@/components/base/badges/badges";
import { useTranslation } from "react-i18next";

/** Marks beside a name: whether the account is an admin, suspended, or the viewer's own. */
export function UserBadges({ isAdmin, suspended, isSelf }: { isAdmin: boolean; suspended: boolean; isSelf: boolean }) {
    const { t } = useTranslation();
    return (
        <>
            {isSelf && <Badge size="sm" color="gray" className="shrink-0">{t("settings.you")}</Badge>}
            {isAdmin && <Badge size="sm" color="brand" className="shrink-0">{t("settings.adminRole")}</Badge>}
            {suspended && <Badge size="sm" color="error" className="shrink-0">{t("settings.suspended")}</Badge>}
        </>
    );
}
