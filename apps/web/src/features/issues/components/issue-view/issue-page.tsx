import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTranslation } from "react-i18next";
import { Sheet } from "@/components/base/sheet/sheet";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useIssueMenuRequests } from "@/features/commands/issue-menu-requests";
import { GuestShareDialog } from "@/features/projects/components/guest-share-dialog";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { useProjectPermissions } from "@/features/projects/hooks/use-project-permissions";
import type { IssueDetail } from "../../api";
import { IssueFiles } from "../issue-files";
import { IssueQuickActions } from "./issue-actions-menu";
import { IssueActivity } from "./issue-activity";
import { IssueDeleteDialog } from "./issue-delete-dialog";
import { IssueDescription } from "./issue-description";
import { IssueHeader } from "./issue-header";
import { IssueProperties } from "./issue-properties";
import { IssuePropertyChips } from "./issue-property-chips";
import { IssueRelations } from "./issue-relations";
import { IssueSubIssues } from "./issue-sub-issues";
import { IssueTitle } from "./issue-title";
import type { PropertyMenuId } from "./property-menu";
import type { DescriptionControls } from "./use-issue-description";
import { useEditActivity } from "./use-edit-activity";
import { useIssueCopyActions } from "./use-issue-copy-actions";
import { useIssueUpdater } from "./use-issue-mutations";
import { useIssueTitle } from "./use-issue-title";

/** Linear-style property shortcuts; ignored while typing in a field or the editor. */
const propertyHotkey = { enableOnFormTags: false, enableOnContentEditable: false, useKey: true, preventDefault: true } as const;

/**
 * One issue, laid out: the header, then the title, description, files, sub-issues, relations and activity in a column,
 * with the properties beside it. On a phone the properties are chips under the title and a bottom sheet; between that
 * and the side rail they sit above the description. It owns what the parts share, such as which property menu is open
 * and whether anything is unsaved, and each part owns the rest of its own state.
 */
export function IssuePage({ issue }: { issue: IssueDetail }) {
    const { t } = useTranslation();
    const compact = !useBreakpoint("md");
    const wide = useBreakpoint("lg");
    const updater = useIssueUpdater(issue.projectId);
    const { can } = useProjectPermissions(issue.projectId);
    // A viewer or guest reads the issue: nothing on it is editable, and guests may still comment below.
    const canEdit = can("issues.write");
    const { data: members } = useProjectMembers(issue.projectId);
    const hasGuests = !!members?.some((member) => member.role === "guest");
    const [shareOpen, setShareOpen] = useState(false);
    const [openMenu, setOpenMenu] = useState<PropertyMenuId | null>(null);
    const [propertiesOpen, setPropertiesOpen] = useState(false);
    const [relationsOpen, setRelationsOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const openProperty = useCallback((menu: PropertyMenuId | null = null) => {
        if (compact) setPropertiesOpen(true);
        setOpenMenu(canEdit ? menu : null);
    }, [compact, canEdit]);
    useHotkeys("s", () => openProperty("state"), propertyHotkey);
    useHotkeys("p", () => openProperty("priority"), propertyHotkey);
    useHotkeys("a", () => openProperty("assignee"), propertyHotkey);
    useHotkeys("e", () => openProperty("estimate"), propertyHotkey);
    useHotkeys("l", () => openProperty("label"), propertyHotkey);
    useHotkeys("shift+d", () => openProperty("due"), propertyHotkey);
    // The command palette opens the same menus.
    useIssueMenuRequests((menu) => openProperty(menu));
    useEffect(() => {
        setPropertiesOpen(false);
        setOpenMenu(null);
    }, [issue.id]);

    const edit = useEditActivity();
    const title = useIssueTitle({ issue, updater, onDirtyChange: edit.setTitleDirty });
    const currentTitle = useRef(title.currentTitle);
    useEffect(() => {
        currentTitle.current = title.currentTitle;
    });
    const getTitle = useCallback(() => currentTitle.current, []);
    const description = useRef<DescriptionControls>(null);
    const copyActions = useIssueCopyActions(issue, title.currentTitle, description);

    // A disabled fieldset turns every control inside it off at once, so what a role cannot change reads as plain values.
    const readOnly = (children: React.ReactNode) => <fieldset disabled={!canEdit} className="contents">{children}</fieldset>;
    const properties = readOnly(<IssueProperties issue={issue} updater={updater} openMenu={openMenu} onOpenMenuChange={setOpenMenu} presentation={compact ? "sheet" : "popover"} />);
    const menuActions = {
        onAddRelation: canEdit ? () => setRelationsOpen(true) : undefined,
        onSetParent: canEdit
            ? () => {
                  window.setTimeout(() => openProperty("parent"), 0);
              }
            : undefined,
        onOpenHistory: () => setHistoryOpen(true),
        onDelete: canEdit ? () => setDeleteOpen(true) : undefined,
        onShare: can("shares.manage") && hasGuests ? () => setShareOpen(true) : undefined,
    };

    return (
        <main className="flex h-full min-h-0 flex-col bg-surface-1">
            <IssueHeader issue={issue} currentTitle={title.currentTitle} saving={updater.isPending || edit.descriptionSaving} unsaved={edit.unsaved} copyActions={copyActions} actions={menuActions} />

            <div className="flex min-h-0 flex-1 overflow-hidden">
                <div className="min-w-0 flex-1 overflow-y-auto">
                    <div className="mx-auto w-full max-w-[48rem] px-6 pt-10 pb-24 lg:px-12">
                        <IssueTitle identifier={issue.identifier} value={title.title} error={title.error} onChange={title.onChange} onBlur={title.save} readOnly={!canEdit} />

                        {compact && <IssuePropertyChips issue={issue} onOpen={(menu) => openProperty(menu ?? null)} />}
                        {!wide && !compact && <div className="mt-6 rounded-xl border border-subtle bg-layer-1 p-2">{properties}</div>}

                        <IssueDescription
                            issue={issue}
                            updater={updater}
                            getTitle={getTitle}
                            controls={description}
                            historyOpen={historyOpen}
                            onHistoryOpenChange={setHistoryOpen}
                            onDirtyChange={edit.setDescriptionDirty}
                            onSavingChange={edit.setDescriptionSaving}
                            editable={canEdit}
                        />

                        {readOnly(
                            <>
                                <IssueFiles projectId={issue.projectId} issueId={issue.id} />
                                <IssueSubIssues issue={issue} />
                                <IssueRelations projectId={issue.projectId} issueId={issue.id} identifier={issue.identifier} open={relationsOpen} onOpenChange={setRelationsOpen} />
                            </>,
                        )}

                        <div className="mt-10 border-t border-subtle pt-8">
                            <IssueActivity issueId={issue.id} identifier={issue.identifier} projectId={issue.projectId} onCommentFilledChange={edit.setCommentFilled} />
                        </div>
                    </div>
                </div>

                {wide && (
                    <aside aria-label={t("issue.properties")} className="w-[17.5rem] shrink-0 overflow-y-auto px-4 pt-3 pb-10">
                        <IssueQuickActions {...copyActions} />
                        <div className="mt-5">{properties}</div>
                    </aside>
                )}
            </div>

            <IssueDeleteDialog issue={issue} open={deleteOpen} onOpenChange={setDeleteOpen} />
            {menuActions.onShare && <GuestShareDialog projectId={issue.projectId} base={`/issues/${issue.identifier}`} open={shareOpen} onOpenChange={setShareOpen} />}

            {compact && (
                <Sheet
                    open={propertiesOpen}
                    onOpenChange={(open) => {
                        setPropertiesOpen(open);
                        if (!open) setOpenMenu(null);
                    }}
                    title={t("issue.properties")}
                    side="bottom"
                >
                    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4">
                        <h2 className="text-[13px] font-medium text-primary">{t("issue.properties")}</h2>
                        <button type="button" aria-label={t("common.close")} onClick={() => { setPropertiesOpen(false); setOpenMenu(null); }} className="grid size-11 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary">
                            <X className="size-4" />
                        </button>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{properties}</div>
                </Sheet>
            )}
        </main>
    );
}
