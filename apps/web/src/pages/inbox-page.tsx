import { useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { TFunction } from "i18next";
import { MailCheck, MailOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { Presence, usePresence } from "@/components/base/presence";
import { SwipeRow } from "@/components/base/swipe-row";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { Topbar } from "@/components/layout/topbar";
import { IssueAvatar, StateIcon } from "@/features/board/components/issue-property-icons";
import type { InboxNotification } from "@/features/notifications/api";
import { useMarkAllNotificationsRead, useNotifications, useSetNotificationRead } from "@/features/notifications/hooks/use-notifications";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { translateStatusName } from "@/i18n/status-label";
import { urls } from "@/lib/urls";
import { issueTransitionProps } from "@/lib/view-transition";
import { useDensity } from "@/providers/density";
import { cx } from "@/utils/cx";
import { preloadWhenIdle } from "@/lib/preload";

export const InboxPage = () => {
    const { t } = useTranslation();
    const { density } = useDensity();
    const [searchParams, setSearchParams] = useSearchParams();
    const unreadOnly = searchParams.get("show") === "unread";
    const { data: notifications, isLoading, isError } = useNotifications();
    const setRead = useSetNotificationRead();
    const markAll = useMarkAllNotificationsRead();
    // In the unread view, what you read while looking stays listed until you switch views, so rows do not vanish under the pointer.
    const [readHere, setReadHere] = useState<Set<string>>(new Set());
    const unreadCount = notifications?.filter((notification) => !notification.readAt).length ?? 0;
    const visible = useMemo(
        () => (unreadOnly ? notifications?.filter((notification) => !notification.readAt || readHere.has(notification.id)) : notifications),
        [notifications, readHere, unreadOnly],
    );
    const rows = usePresence(visible, (notification) => notification.id);
    const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollElement,
        estimateSize: () => 72,
        overscan: 8,
        getItemKey: (index) => rows[index]?.key ?? index,
    });
    useEffect(() => {
        virtualizer.measure();
    }, [density, virtualizer]);

    function show(next: "all" | "unread") {
        setReadHere(new Set());
        setSearchParams(
            (current) => {
                if (next === "unread") current.set("show", "unread");
                else current.delete("show");
                return current;
            },
            { replace: true },
        );
    }

    function markRead(notification: InboxNotification, read: boolean) {
        if (!!notification.readAt === read) return;
        if (unreadOnly && read) setReadHere((current) => new Set(current).add(notification.id));
        setRead.mutate({ id: notification.id, read });
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-surface-1">
            <Topbar
                title={t("inbox.title")}
                actions={
                    <Button
                        size="xs"
                        color="secondary"
                        iconLeading={MailCheck}
                        isDisabled={unreadCount === 0 || markAll.isPending}
                        onClick={() => markAll.mutate()}
                    >
                        {t("inbox.markAllRead")}
                    </Button>
                }
            />
            <div role="group" aria-label={t("inbox.filter")} className="flex h-10 shrink-0 items-center gap-1 border-b border-subtle px-3">
                <button type="button" aria-pressed={!unreadOnly} className={tab(!unreadOnly)} onClick={() => show("all")}>
                    {t("inbox.all")}
                </button>
                <button type="button" aria-pressed={unreadOnly} className={tab(unreadOnly)} onClick={() => show("unread")}>
                    {t("inbox.unread")}
                    {unreadCount > 0 && <span className="text-tertiary">{unreadCount}</span>}
                </button>
            </div>
            <main ref={setScrollElement} className="min-h-0 flex-1 overflow-y-auto">
                {isLoading && <InboxSkeleton />}
                {isError && <ErrorMessage message={t("inbox.couldNotLoad")} />}
                {visible && rows.length > 0 && (
                    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                        {virtualizer.getVirtualItems().map((virtual) => {
                            const row = rows[virtual.index];
                            if (!row) return null;
                            return (
                                <div
                                    key={virtual.key}
                                    data-index={virtual.index}
                                    ref={virtualizer.measureElement}
                                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtual.start}px)` }}
                                >
                                    <Presence leaving={row.leaving} entering={row.entering}>
                                        <NotificationRow notification={row.item} onRead={(read) => markRead(row.item, read)} />
                                    </Presence>
                                </div>
                            );
                        })}
                    </div>
                )}
                {visible?.length === 0 &&
                    (unreadOnly && notifications?.length ? (
                        <EmptyState
                            framed={false}
                            className="py-16"
                            illustration="check"
                            title={t("inbox.emptyUnreadTitle")}
                            description={t("inbox.emptyUnread")}
                            action={
                                <Button size="sm" color="secondary" onClick={() => show("all")}>
                                    {t("inbox.showAll")}
                                </Button>
                            }
                        />
                    ) : (
                        <EmptyState framed={false} className="py-16" illustration="mail" title={t("inbox.emptyTitle")} description={t("inbox.empty")} />
                    ))}
            </main>
        </div>
    );
};

/** A tab in the bar under the title, matching the issue list's scopes. */
const tab = (active: boolean) =>
    cx(
        "flex h-[var(--sidebar-height)] items-center gap-2 rounded-md px-2 text-[13px]",
        active ? "bg-layer-1-selected text-primary" : "text-tertiary hover:bg-layer-transparent-hover hover:text-primary",
    );

function NotificationRow({ notification, onRead }: { notification: InboxNotification; onRead: (read: boolean) => void }) {
    const { t, i18n } = useTranslation();
    const unread = !notification.readAt;
    const { issue, actor } = notification;
    const action = unread ? t("inbox.markRead") : t("inbox.markUnread");
    return (
        // On touch screens, swiping the row left marks it read or unread; the hover button does the same with a pointer.
        <SwipeRow action={{ label: action, icon: unread ? <MailOpen className="size-4" /> : <MailCheck className="size-4" />, onTrigger: () => onRead(unread) }} className="border-b border-subtle">
        <div className="group/notification relative">
            <Link
                viewTransition
                to={urls.issue(issue.identifier, issue.title)}
                state={{ issueTitle: issue.title }}
                onClick={() => onRead(true)}
                className="flex min-h-[var(--row-height)] items-center gap-3 py-[var(--card-pad-y)] pr-12 pl-3 max-md:items-start max-md:py-3 max-md:pr-4 max-md:pl-2 transition-colors duration-150 hover:bg-layer-transparent-hover focus-visible:bg-layer-transparent-hover focus-visible:outline-none hover:duration-0"
            >
                <span
                    aria-hidden="true"
                    className={cx(
                        "size-1.5 shrink-0 rounded-full bg-accent-primary transition-[opacity,scale] duration-200",
                        unread ? "scale-100 opacity-100" : "scale-50 opacity-0",
                    )}
                />
                <IssueAvatar name={actor.name} avatarUrl={actor.avatarUrl} className="size-7 text-[12px] max-md:size-8" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-2 text-[13px] max-md:text-[15px]">
                        <ProjectIcon icon={notification.project.iconAppearance ?? notification.project.icon} className="size-3.5 shrink-0" />
                        <span className="shrink-0 font-mono text-xs text-tertiary" {...issueTransitionProps(issue.identifier, "id")}>
                            {issue.identifier}
                        </span>
                        <span
                            className={cx("truncate", unread ? "font-medium text-primary" : "text-secondary")}
                            {...issueTransitionProps(issue.identifier, "title")}
                        >
                            {issue.title}
                        </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2 text-xs text-tertiary">
                        {notification.status?.to && (
                            <StateIcon name={notification.status.to.name} color={notification.status.to.color} className="size-3 shrink-0" />
                        )}
                        <span className="shrink-0">{describe(notification, t)}</span>
                        {notification.excerpt && <span className="min-w-0 truncate text-placeholder">{notification.excerpt}</span>}
                    </span>
                </span>
                <time dateTime={notification.createdAt} className="shrink-0 text-xs text-tertiary max-md:pt-0.5">
                    {formatAge(notification.createdAt, i18n.language)}
                </time>
            </Link>
            <Tooltip title={action}>
                <button
                    type="button"
                    aria-label={action}
                    onClick={() => onRead(unread)}
                    className="absolute top-1/2 right-3 grid size-6 -translate-y-1/2 place-items-center rounded text-tertiary can-hover:opacity-0 transition-opacity duration-150 can-hover:group-hover/notification:opacity-100 can-hover:group-focus-within/notification:opacity-100 hover:bg-layer-1-hover hover:text-primary focus-visible:opacity-100 max-md:hidden"
                >
                    {unread ? <MailOpen className="size-3.5" /> : <MailCheck className="size-3.5" />}
                </button>
            </Tooltip>
        </div>
        </SwipeRow>
    );
}

function describe(notification: InboxNotification, t: TFunction) {
    const actor = notification.actor.name;
    if (notification.type === "assigned") return t("inbox.assigned", { actor });
    if (notification.type === "mentioned") return t("inbox.mentioned", { actor });
    if (notification.type === "replied") return t("inbox.replied", { actor });
    if (notification.type === "commented") return t("inbox.commented", { actor });
    const to = notification.status?.to;
    return to ? t("inbox.statusChanged", { actor, status: translateStatusName(to.name, t) }) : t("inbox.statusChangedUnknown", { actor });
}

/** "5 min ago", "yesterday", and a date after a week. */
function formatAge(value: string, locale: string) {
    const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
    if (minutes < 60) return relative.format(-minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (hours < 24) return relative.format(-hours, "hour");
    const days = Math.round(hours / 24);
    if (days < 7) return relative.format(-days, "day");
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(value));
}

preloadWhenIdle(() => import("@/features/issues/components/issue-view/issue-view"));

function InboxSkeleton() {
    const { t } = useTranslation();
    return (
        <div className="divide-y divide-subtle" aria-label={t("common.loading")} role="status">
            {["one", "two", "three", "four"].map((key) => (
                <div key={key} className="flex h-[58px] items-center gap-3 px-3">
                    <Skeleton className="size-7 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Skeleton className="h-3 w-3/5" />
                        <Skeleton className="h-3 w-2/5" />
                    </div>
                </div>
            ))}
        </div>
    );
}
