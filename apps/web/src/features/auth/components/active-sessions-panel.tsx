import { Monitor, Smartphone } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/base/feedback/alert";
import { LoadingState } from "@/components/feedback/loading-state";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { SettingsGroup, SettingsItemRow, SettingsRowIcon } from "@/components/settings/settings-layout";
import { type ActiveSession, fetchSessions, revokeOtherSessions, revokeSession, SESSIONS_QUERY_KEY } from "@/features/auth/api";
import { formatDistanceToNow } from "@/features/issues/lib/relative-time";
import { ApiError } from "@/lib/api-client";
import { describeUserAgent } from "@/lib/user-agent";
import { useTranslation } from "react-i18next";

/** A session used within this long reads as active now. */
const ACTIVE_NOW_MS = 2 * 60 * 1000;

/** Every browser signed in to this account, with a way to sign any of them out. */
export function ActiveSessionsPanel() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { data: sessions, isLoading, isError } = useQuery({ queryKey: SESSIONS_QUERY_KEY, queryFn: fetchSessions });
    const drop = (ids: (session: ActiveSession) => boolean) => queryClient.setQueryData<ActiveSession[]>(SESSIONS_QUERY_KEY, (current) => current?.filter((session) => !ids(session)));
    const revokeOne = useMutation({ mutationFn: revokeSession, onSuccess: (_result, id) => drop((session) => session.id === id) });
    const revokeOthers = useMutation({ mutationFn: revokeOtherSessions, onSuccess: () => drop((session) => !session.current) });
    const others = sessions?.filter((session) => !session.current).length ?? 0;
    const failed = revokeOne.error ?? revokeOthers.error;

    return (
        <SettingsGroup
            title={t("security.activeSessions")}
            description={t("security.activeSessionsDescription")}
            action={
                <ConfirmDialog
                    trigger={<Button size="sm" color="secondary" isDisabled={others === 0} isLoading={revokeOthers.isPending}>{t("security.signOutOthers")}</Button>}
                    title={t("security.signOutOthers")}
                    description={t("security.signOutOthersDescription", { count: others })}
                    confirmLabel={t("security.signOutOthers")}
                    onConfirm={() => revokeOthers.mutate()}
                />
            }
        >
            {failed && (
                <div className="py-4">
                    <Alert tone="error">{failed instanceof ApiError ? failed.message : t("security.couldNotSignOut")}</Alert>
                </div>
            )}
            {isLoading && <LoadingState className="py-6" />}
            {isError && (
                <div className="py-4">
                    <Alert tone="error">{t("security.couldNotLoadSessions")}</Alert>
                </div>
            )}
            {sessions?.map((session) => <SessionRow key={session.id} session={session} isRevoking={revokeOne.isPending && revokeOne.variables === session.id} onRevoke={() => revokeOne.mutate(session.id)} />)}
        </SettingsGroup>
    );
}

function SessionRow({ session, isRevoking, onRevoke }: { session: ActiveSession; isRevoking: boolean; onRevoke: () => void }) {
    const { t, i18n } = useTranslation();
    const device = describeUserAgent(session.userAgent);
    const name =
        device.browser && device.os ? t("security.browserOn", { browser: device.browser, os: device.os }) : (device.browser ?? device.os ?? t("security.unknownDevice"));
    const lastSeen = Date.now() - new Date(session.lastSeenAt).getTime() < ACTIVE_NOW_MS ? t("security.activeNow") : t("security.lastSeen", { when: formatDistanceToNow(session.lastSeenAt, i18n.language) });
    const signedIn = t("security.signedInOn", { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(session.createdAt)) });
    return (
        <SettingsItemRow
            leading={<SettingsRowIcon icon={device.mobile ? Smartphone : Monitor} />}
            title={
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{name}</span>
                    {session.current && <Badge size="sm" color="brand" className="shrink-0">{t("security.thisDevice")}</Badge>}
                </span>
            }
            description={[session.current ? t("security.activeNow") : lastSeen, session.ip, signedIn].filter(Boolean).join(" · ")}
        >
            {!session.current && (
                <ConfirmDialog
                    trigger={<Button size="sm" color="secondary" isLoading={isRevoking}>{t("security.signOut")}</Button>}
                    title={t("security.signOutSession")}
                    description={t("security.signOutSessionDescription", { device: name })}
                    confirmLabel={t("security.signOut")}
                    onConfirm={onRevoke}
                />
            )}
        </SettingsItemRow>
    );
}
