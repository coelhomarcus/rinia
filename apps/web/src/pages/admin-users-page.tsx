import { useState } from "react";
import { Avatar } from "@/components/base/avatar/avatar";
import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { SettingsCard, SettingsLinkRow, SettingsPage } from "@/components/settings/settings-layout";
import type { AdminUserSummary } from "@/features/admin/api";
import { AdminSearch } from "@/features/admin/components/admin-search";
import { UserBadges } from "@/features/admin/components/user-badges";
import { useAdminUsers } from "@/features/admin/hooks/use-admin";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { memberInitials } from "@/features/projects/components/members-panel";
import { urls } from "@/lib/urls";
import { cx } from "@/utils/cx";
import { useTranslation } from "react-i18next";
import { NotFound } from "./not-found";

type UserFilter = "all" | "admins" | "suspended";

const FILTERS: Record<UserFilter, (user: AdminUserSummary) => boolean> = {
    all: () => true,
    admins: (user) => user.isAdmin,
    suspended: (user) => user.suspendedAt !== null,
};

/** Every account on the instance. Opening one shows its projects and what an admin can do about it. */
export function AdminUsersPage() {
    const { t } = useTranslation();
    const { user: viewer } = useAuth();
    const { data: users, isLoading, isError } = useAdminUsers(viewer?.isAdmin === true);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<UserFilter>("all");
    if (!viewer?.isAdmin) return <NotFound />;

    const needle = query.trim().toLowerCase().replace(/^@/, "");
    const shown = users?.filter((user) => FILTERS[filter](user) && (!needle || [user.name, user.username, user.email].some((value) => value.toLowerCase().includes(needle))));
    const counts = { all: users?.length ?? 0, admins: users?.filter(FILTERS.admins).length ?? 0, suspended: users?.filter(FILTERS.suspended).length ?? 0 };

    return (
        <SettingsPage title={t("nav.adminUsers")} description={t("settings.adminUsersDescription")}>
            {users && users.length > 0 && (
                <AdminSearch value={query} onChange={setQuery} placeholder={t("settings.searchAdminUsers")}>
                    <div role="group" aria-label={t("settings.filterUsers")} className="flex h-8 items-center gap-0.5 rounded-md border border-subtle p-0.5">
                        {(Object.keys(FILTERS) as UserFilter[]).map((key) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={filter === key}
                                onClick={() => setFilter(key)}
                                className={cx(
                                    "flex h-6 items-center gap-2 rounded px-2 text-[12px] font-medium whitespace-nowrap transition-colors",
                                    filter === key ? "bg-layer-2 text-primary" : "text-tertiary hover:text-secondary",
                                )}
                            >
                                {t(`settings.userFilters.${key}`)}
                                <span className="text-placeholder tabular-nums">{counts[key]}</span>
                            </button>
                        ))}
                    </div>
                </AdminSearch>
            )}
            <SettingsCard>
                {isLoading && <LoadingState className="py-6" />}
                {isError && (
                    <div className="py-3">
                        <ErrorMessage message={t("settings.couldNotLoadAdminUsers")} />
                    </div>
                )}
                {users && shown?.length === 0 && <p className="py-4 text-[13px] text-tertiary">{t("settings.noAdminMatches")}</p>}
                {shown?.map((user) => (
                    <SettingsLinkRow
                        key={user.id}
                        to={urls.adminUser(user.id)}
                        leading={<Avatar src={user.avatarUrl ?? undefined} initials={memberInitials(user.name)} size="sm" className={user.suspendedAt ? "opacity-50" : undefined} />}
                        title={
                            <>
                                <span className="truncate">{user.name}</span>
                                <UserBadges isAdmin={user.isAdmin} suspended={user.suspendedAt !== null} isSelf={user.id === viewer.id} />
                            </>
                        }
                        description={`@${user.username} · ${user.email}`}
                        value={<span className="hidden sm:inline">{t("settings.projectCount", { count: user.projectCount })}</span>}
                    />
                ))}
            </SettingsCard>
        </SettingsPage>
    );
}
