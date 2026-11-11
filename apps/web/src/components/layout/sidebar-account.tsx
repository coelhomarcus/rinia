import { Menu } from "@base-ui/react/menu";
import { ChevronDown, LogOut, MonitorDown, Settings } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Avatar } from "@/components/base/avatar/avatar";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { cx } from "@/utils/cx";
import { AUTH_QUERY_KEY, logout } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useInstallPrompt } from "@/features/pwa/install-prompt";
import { clearDocumentDrafts } from "@/features/documents/session-registry";
import { issueDescriptionDrafts } from "@/features/issues/lib/issue-description-drafts";
import { useTranslation } from "react-i18next";

export function SidebarAccount({ variant = "icon" }: { variant?: "icon" | "row" | "header" }) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const installPrompt = useInstallPrompt();
    const mutation = useMutation({
        mutationFn: logout,
        onSuccess: async () => {
            if (user)
                await Promise.all([clearDocumentDrafts(user.id), issueDescriptionDrafts.clearUser(user.id)]).catch(() => {
                    // Authentication still ends if browser storage is unavailable.
                    console.warn("Could not clear local editor storage during sign out.");
                });
            queryClient.setQueryData(AUTH_QUERY_KEY, null);
            queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== AUTH_QUERY_KEY[0] });
            void navigate("/login", { replace: true });
        },
    });
    if (!user) return null;
    const initials = user.name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("");
    const item = "flex min-h-7 cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] text-secondary outline-none data-highlighted:bg-menu-hover";
    const header = variant === "header";
    return (
        <Menu.Root>
            <Menu.Trigger
                aria-label={t("nav.account")}
                className={
                    header
                        ? "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-layer-transparent-hover"
                        : variant === "row"
                          ? "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-layer-1-hover"
                          : "flex size-7 items-center justify-center rounded-md hover:bg-layer-1"
                }
            >
                <Avatar key={user.avatarUrl} src={user.avatarUrl ?? undefined} initials={initials} size="xs" />
                {header && (
                    <>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-primary">{user.name}</span>
                        <ChevronDown className="size-3 shrink-0 text-tertiary" aria-hidden="true" />
                    </>
                )}
                {variant === "row" && (
                    <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-primary">{user.name}</span>
                        <span className="block truncate text-[11px] text-tertiary">{user.email}</span>
                    </span>
                )}
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner align={variant === "icon" ? "end" : "start"} side={variant === "row" ? "top" : "bottom"} sideOffset={6} className="z-50">
                    <Menu.Popup className={cx("w-64", overlayChrome.menu)}>
                        <div className="border-b border-subtle px-2 py-2">
                            <p className="truncate text-sm font-medium text-primary">{user.name}</p>
                            <p className="truncate text-xs text-tertiary">{user.email}</p>
                        </div>
                        <Menu.Item className={`${item} mt-1`} onClick={() => navigate("/settings/preferences")}>
                            <Settings className="size-4" />
                            <span className="flex-1">{t("nav.settings")}</span>
                            <span className="text-[11px] text-placeholder">G S</span>
                        </Menu.Item>
                        {installPrompt.available && (
                            <Menu.Item className={item} onClick={() => void installPrompt.install()}>
                                <MonitorDown className="size-4" />
                                {t("pwa.installApp")}
                            </Menu.Item>
                        )}
                        <Menu.Separator className="my-1 border-t border-subtle" />
                        <Menu.Item className={item} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                            <LogOut className="size-4" />
                            {t("nav.signOut")}
                        </Menu.Item>
                        {mutation.isError && (
                            <p role="alert" className="px-2 py-1 text-xs text-danger-primary">
                                {t("errors.requestFailed")}
                            </p>
                        )}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
