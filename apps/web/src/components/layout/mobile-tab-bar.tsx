import type { ComponentType, ReactNode } from "react";
import { House, Plus } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { AppIcons } from "@/components/foundations/icons";
import { useAppCommands } from "@/features/commands/app-commands";
import { useUnreadNotificationCount } from "@/features/notifications/hooks/use-notifications";
import { urls } from "@/lib/urls";
import { cx } from "@/utils/cx";

/**
 * The phone's navigation: a bar along the bottom edge, within reach of the thumb. Home holds everything the desktop
 * sidebar does (projects, favorites, settings); My issues and the inbox are one tap away; the middle button creates
 * an issue in the current project; Search opens the command palette. Hidden from `md` up, where the sidebar returns.
 */
export function MobileTabBar() {
    const { t } = useTranslation();
    const location = useLocation();
    const commands = useAppCommands();
    const { data: unread = 0 } = useUnreadNotificationCount();
    const path = location.pathname;
    const onHome = path === urls.home() || path.startsWith("/project/") || path.startsWith("/settings") || path.startsWith("/issue/");

    return (
        <nav aria-label={t("nav.navigation")} data-print-hide className="relative z-30 shrink-0 border-t border-subtle bg-canvas/90 pb-safe backdrop-blur-xl backdrop-saturate-150 md:hidden">
            <div className="mx-auto grid h-13 max-w-md grid-cols-5 items-stretch px-2">
                <Tab to={urls.home()} label={t("nav.home")} icon={House} active={onHome} />
                <Tab to={urls.myIssues()} label={t("nav.myIssues")} icon={AppIcons.MyIssues} active={path.startsWith(urls.myIssues())} />
                <div className="flex items-center justify-center">
                    <button
                        type="button"
                        aria-label={t("nav.newIssue")}
                        onClick={() => commands.createIssue()}
                        className="grid size-10 place-items-center rounded-full bg-accent-primary text-white shadow-raised-100 transition-[background-color,transform] duration-150 hover:bg-accent-primary-hover motion-safe:active:scale-95"
                    >
                        <Plus className="size-5" strokeWidth={2.25} aria-hidden="true" />
                    </button>
                </div>
                <Tab to={urls.inbox()} label={t("nav.inbox")} icon={AppIcons.Inbox} active={path === urls.inbox()} badge={unread > 0 ? <span className="absolute -top-0.5 right-0 size-2 rounded-full bg-accent-primary ring-2 ring-[var(--bg-canvas)]" role="status" aria-label={`${t("nav.unreadInbox")}: ${unread}`} /> : null} />
                <TabButton label={t("nav.search")} icon={AppIcons.Search} onPress={commands.openPalette} />
            </div>
        </nav>
    );
}

const tabClass = "flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium leading-none outline-none focus-visible:bg-layer-transparent-hover";

function Tab({ to, label, icon: Icon, active, badge }: { to: string; label: string; icon: ComponentType<{ className?: string }>; active: boolean; badge?: ReactNode }) {
    return (
        <Link to={to} aria-current={active ? "page" : undefined} className={cx(tabClass, active ? "text-primary" : "text-tertiary")}>
            <span className="relative">
                <Icon className="size-5" />
                {badge}
            </span>
            <span className="max-w-full truncate">{label}</span>
        </Link>
    );
}

function TabButton({ label, icon: Icon, onPress }: { label: string; icon: ComponentType<{ className?: string }>; onPress: () => void }) {
    return (
        <button type="button" onClick={onPress} className={cx(tabClass, "text-tertiary")}>
            <Icon className="size-5" />
            <span className="max-w-full truncate">{label}</span>
        </button>
    );
}
