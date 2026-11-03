import { useEffect } from "react";
import { useUnreadNotificationCount } from "@/features/notifications/hooks/use-notifications";

type BadgeNavigator = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/** Shows the unread inbox count on the installed app's icon, where the platform supports badges. */
export function AppBadge() {
    const { data: unread = 0 } = useUnreadNotificationCount();
    useEffect(() => {
        const badge = navigator as BadgeNavigator;
        if (!badge.setAppBadge) return;
        void (unread > 0 ? badge.setAppBadge(unread) : badge.clearAppBadge?.())?.catch(() => undefined);
    }, [unread]);
    useEffect(() => () => void (navigator as BadgeNavigator).clearAppBadge?.()?.catch(() => undefined), []);
    return null;
}
