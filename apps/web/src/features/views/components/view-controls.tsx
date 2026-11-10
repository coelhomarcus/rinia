import { type ReactNode, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import type { SavedViewFilters } from "@rinia/shared";
import { Check, Copy, Layers, type LucideIcon, MoreHorizontal, Pencil, RotateCcw, Trash2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { Reveal } from "@/components/base/presence";
import { useToast } from "@/components/feedback/toaster";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ApiError } from "@/lib/api-client";
import { urls } from "@/lib/urls";
import { cx } from "@/utils/cx";
import type { SavedView } from "../api";
import { useCreateView, useDeleteView, useDuplicateView, useUpdateView } from "../hooks/use-views";
import { filtersFromParams, hasActiveFilters, paramsFromFilters, sameFilters } from "../lib/view-filters";
import { SaveViewDialog, type ViewDetails } from "./save-view-dialog";

/** Buttons whose label gives way to the icon on narrow screens stay square there, like the icon-only ones. */
export const COLLAPSE = "max-sm:w-7 max-sm:px-0";

/** Room left in a view's name for the " (copy)" suffix. */
const COPY_NAME_ROOM = 64;

/**
 * Everything the issues page needs to save and manage views, as pieces it places itself: `saveButton` (round, in
 * the pill row), `filterActions` (Reset and Save, in the filter row), `menu` (the view's actions, in the header),
 * and `dialogs`. `filters` is the screen as it is now; it is null until the layout is known.
 */
export function useViewActions({
    projectId,
    projectKey,
    filters,
    savedView,
}: {
    projectId: string;
    projectKey: string;
    filters: SavedViewFilters | null;
    savedView?: SavedView;
}) {
    const { t } = useTranslation();
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [, setSearchParams] = useSearchParams();
    const showToast = useToast();
    const createView = useCreateView(projectId);
    const updateView = useUpdateView(projectId);
    const duplicateView = useDuplicateView(projectId);
    const deleteView = useDeleteView(projectId);
    const [dialog, setDialog] = useState<"create" | "rename" | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const saved = savedView ? filtersFromParams(paramsFromFilters(savedView.filters)) : null;
    // A view saved without a layout (through the API) follows the person's own layout choice.
    if (saved && filters && !saved.view) saved.view = filters.view;
    const dirty = !!(saved && filters && !sameFilters(filters, saved));
    const isOwner = !!savedView && savedView.ownerId === user?.id;
    const message = (reason: unknown) => (reason instanceof ApiError ? reason.message : t("errors.requestFailed"));
    const openView = (view: SavedView, options?: { replace?: boolean }) =>
        navigate(`${urls.view(projectKey, view)}?${paramsFromFilters(view.filters)}`, options);

    function closeDialog() {
        setDialog(null);
        setError(null);
    }

    function create(details: ViewDetails) {
        if (!filters) return;
        setError(null);
        createView.mutate(
            { ...details, filters },
            {
                onSuccess: (view) => {
                    closeDialog();
                    showToast({ title: t("views.saved") });
                    void openView(view);
                },
                onError: (reason) => setError(message(reason)),
            },
        );
    }

    function rename(details: ViewDetails) {
        if (!savedView) return;
        setError(null);
        updateView.mutate(
            { viewId: savedView.id, input: { name: details.name, ...(isOwner && details.shared !== savedView.shared && { shared: details.shared }) } },
            {
                onSuccess: (view) => {
                    closeDialog();
                    // The name is part of the address, so keep the link tidy without leaving the screen as it is.
                    void navigate({ pathname: urls.view(projectKey, view), search: location.search }, { replace: true });
                },
                onError: (reason) => setError(message(reason)),
            },
        );
    }

    function saveChanges() {
        if (!savedView || !filters) return;
        updateView.mutate(
            { viewId: savedView.id, input: { filters } },
            { onSuccess: () => showToast({ title: t("views.updated") }), onError: (reason) => showToast({ tone: "error", title: message(reason) }) },
        );
    }

    function toggleShared() {
        if (!savedView) return;
        updateView.mutate(
            { viewId: savedView.id, input: { shared: !savedView.shared } },
            {
                onSuccess: (view) => showToast({ title: view.shared ? t("views.shared") : t("views.madePrivate") }),
                onError: (reason) => showToast({ tone: "error", title: message(reason) }),
            },
        );
    }

    function duplicate() {
        if (!savedView) return;
        duplicateView.mutate(
            { viewId: savedView.id, name: t("views.copyName", { name: savedView.name.slice(0, COPY_NAME_ROOM) }) },
            {
                onSuccess: (view) => {
                    showToast({ title: t("views.duplicated") });
                    void openView(view);
                },
                onError: (reason) => showToast({ tone: "error", title: message(reason) }),
            },
        );
    }

    function remove() {
        if (!savedView) return;
        deleteView.mutate(
            {
                viewId: savedView.id,
                name: savedView.name,
                onDeleted: () => navigate(urls.issues(projectKey), { replace: true }),
                onRestored: () => openView(savedView),
            },
            { onError: (reason) => showToast({ tone: "error", title: message(reason) }) },
        );
    }

    const saveButton = (
        <Tooltip title={savedView ? t("views.saveAsNew") : t("views.saveAsView")}>
            <Button
                size="xs"
                color="tertiary"
                className="rounded-full"
                iconLeading={Layers}
                isDisabled={!filters}
                aria-label={savedView ? t("views.saveAsNew") : t("views.saveAsView")}
                onClick={() => setDialog("create")}
            />
        </Tooltip>
    );

    // On a plain page, Save names the filters as a new view. On a view, Reset and Save show once the screen differs.
    const filterActions = savedView ? (
        <Reveal axis="x" show={dirty}>
            <div className="flex items-center gap-1">
                <Button
                    size="md"
                    color="tertiary"
                    className="rounded-full"
                    iconLeading={RotateCcw}
                    onClick={() => setSearchParams(paramsFromFilters(savedView.filters), { replace: true })}
                >
                    {t("views.reset")}
                </Button>
                {savedView.canEdit ? (
                    <Button size="md" className="rounded-full" iconLeading={Check} isLoading={updateView.isPending} onClick={saveChanges}>
                        {t("common.save")}
                    </Button>
                ) : (
                    <Button size="md" color="secondary" className="rounded-full" iconLeading={Layers} onClick={() => setDialog("create")}>
                        {t("views.saveAsNew")}
                    </Button>
                )}
            </div>
        </Reveal>
    ) : (
        <Reveal axis="x" show={!!filters && hasActiveFilters(filters)}>
            <Button size="md" color="secondary" className="rounded-full" onClick={() => setDialog("create")}>
                {t("common.save")}
            </Button>
        </Reveal>
    );

    const menu = savedView && (
        <Menu.Root>
            <Tooltip title={t("views.actions")}>
                <Menu.Trigger
                    render={
                        <Button
                            size="xs"
                            color="tertiary"
                            iconLeading={MoreHorizontal}
                            aria-label={t("views.actions")}
                            className="rounded-full data-[popup-open]:bg-layer-1-hover"
                        />
                    }
                />
            </Tooltip>
            <Menu.Portal>
                <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
                    <Menu.Popup className={cx("w-56", overlayChrome.menu)}>
                        {savedView.canEdit && (
                            <ViewMenuItem icon={Pencil} onClick={() => setDialog("rename")}>
                                {t("views.rename")}
                            </ViewMenuItem>
                        )}
                        {isOwner && (
                            <ViewMenuItem icon={Users} onClick={toggleShared}>
                                {savedView.shared ? t("views.makePrivate") : t("views.share")}
                            </ViewMenuItem>
                        )}
                        <ViewMenuItem icon={Copy} onClick={duplicate}>
                            {t("views.duplicate")}
                        </ViewMenuItem>
                        {dirty && savedView.canEdit && (
                            <ViewMenuItem icon={Layers} onClick={() => setDialog("create")}>
                                {t("views.saveAsNew")}
                            </ViewMenuItem>
                        )}
                        {savedView.canEdit && (
                            <>
                                <div role="separator" className="my-1 border-t border-subtle" />
                                <ViewMenuItem icon={Trash2} destructive onClick={() => setConfirmingDelete(true)}>
                                    {t("views.delete")}
                                </ViewMenuItem>
                            </>
                        )}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );

    const dialogs = (
        <>
            <SaveViewDialog
                open={dialog === "create"}
                onOpenChange={(open) => !open && closeDialog()}
                mode="create"
                initial={{ name: "", shared: false }}
                isPending={createView.isPending}
                error={error}
                onSubmit={create}
            />
            {savedView && (
                <>
                    <SaveViewDialog
                        open={dialog === "rename"}
                        onOpenChange={(open) => !open && closeDialog()}
                        mode="rename"
                        initial={{ name: savedView.name, shared: savedView.shared }}
                        canShare={isOwner}
                        isPending={updateView.isPending}
                        error={error}
                        onSubmit={rename}
                    />
                    <ConfirmDialog
                        open={confirmingDelete}
                        onOpenChange={setConfirmingDelete}
                        title={t("views.deleteTitle")}
                        description={t(savedView.shared ? "views.deleteSharedDescription" : "views.deleteDescription", { name: savedView.name })}
                        confirmLabel={t("views.delete")}
                        isPending={deleteView.isPending}
                        onConfirm={remove}
                    />
                </>
            )}
        </>
    );

    return { dirty, saveButton, filterActions, menu, dialogs };
}

/** Button text that gives way to the icon on narrow screens, so the header keeps its room for the breadcrumb. */
export const Label = ({ children }: { children: ReactNode }) => <span className="max-sm:sr-only">{children}</span>;

function ViewMenuItem({
    icon: Icon,
    destructive = false,
    onClick,
    children,
}: {
    icon: LucideIcon;
    destructive?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Menu.Item
            onClick={onClick}
            className={cx(
                "flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[13px] outline-none data-highlighted:bg-layer-2-hover",
                destructive ? "text-danger-primary" : "text-secondary data-highlighted:text-primary",
            )}
        >
            <Icon aria-hidden="true" className={cx("size-4", !destructive && "text-tertiary")} />
            {children}
        </Menu.Item>
    );
}
