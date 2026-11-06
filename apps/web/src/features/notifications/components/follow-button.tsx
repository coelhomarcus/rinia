import { Bell, BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { useIssueSubscription, useToggleIssueSubscription } from "../hooks/use-notifications";

/** Follows or unfollows an issue. Followers hear about its comments and state changes in their inbox. */
export function FollowButton({ identifier, className = "" }: { identifier: string; className?: string }) {
    const { t } = useTranslation();
    const { data } = useIssueSubscription(identifier);
    const toggle = useToggleIssueSubscription(identifier);
    const following = data?.following ?? false;
    const label = following ? t("inbox.unfollow") : t("inbox.follow");
    return (
        <Tooltip title={label} description={following ? t("inbox.unfollowHint") : t("inbox.followHint")}>
            <button
                type="button"
                aria-pressed={following}
                aria-label={label}
                disabled={!data || toggle.isPending}
                className={`flex size-6 shrink-0 items-center justify-center rounded transition-colors duration-150 hover:bg-layer-transparent-hover ${following ? "text-secondary hover:text-primary" : "text-placeholder hover:text-secondary"} ${className}`}
                onClick={() => toggle.mutate(!following)}
            >
                {following ? <Bell className="size-3.5 transition-transform duration-150 active:scale-90" /> : <BellOff className="size-3.5 transition-transform duration-150 active:scale-90" />}
            </button>
        </Tooltip>
    );
}
