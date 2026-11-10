import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTranslation } from "react-i18next";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useIssueMenuRequests } from "@/features/commands/issue-menu-requests";
import type { IssueDetail } from "../../api";
import { IssueFiles } from "../issue-files";
import { IssueQuickActions } from "./issue-actions-menu";
import { IssueActivity } from "./issue-activity";
import { IssueDeleteDialog } from "./issue-delete-dialog";
import { IssueDescription } from "./issue-description";
import { IssueHeader } from "./issue-header";
import { IssueProperties } from "./issue-properties";
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
 * with the properties beside it (above the description on a narrow screen). It owns what the parts share, such as which
 * property menu is open and whether anything is unsaved, and each part owns the rest of its own state.
 */
export function IssuePage({ issue }: { issue: IssueDetail }) {
    const { t } = useTranslation();
    const wide = useBreakpoint("lg");
    const updater = useIssueUpdater(issue.projectId);
    const [openMenu, setOpenMenu] = useState<PropertyMenuId | null>(null);
    const [relationsOpen, setRelationsOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    useHotkeys("s", () => setOpenMenu("state"), propertyHotkey);
    useHotkeys("p", () => setOpenMenu("priority"), propertyHotkey);
    useHotkeys("a", () => setOpenMenu("assignee"), propertyHotkey);
    useHotkeys("e", () => setOpenMenu("estimate"), propertyHotkey);
    useHotkeys("l", () => setOpenMenu("label"), propertyHotkey);
    useHotkeys("shift+d", () => setOpenMenu("due"), propertyHotkey);
    // The command palette opens the same menus.
    useIssueMenuRequests((menu) => setOpenMenu(menu));

    const edit = useEditActivity();
    const title = useIssueTitle({ issue, updater, onDirtyChange: edit.setTitleDirty });
    const currentTitle = useRef(title.currentTitle);
    useEffect(() => {
        currentTitle.current = title.currentTitle;
    });
    const getTitle = useCallback(() => currentTitle.current, []);
    const description = useRef<DescriptionControls>(null);
    const copyActions = useIssueCopyActions(issue, title.currentTitle, description);

    const properties = <IssueProperties issue={issue} updater={updater} openMenu={openMenu} onOpenMenuChange={setOpenMenu} />;
    const menuActions = {
        onAddRelation: () => setRelationsOpen(true),
        onSetParent: () => {
            window.setTimeout(() => setOpenMenu("parent"), 0);
        },
        onOpenHistory: () => setHistoryOpen(true),
        onDelete: () => setDeleteOpen(true),
    };

    return (
        <main className="flex h-full min-h-0 flex-col bg-surface-1">
            <IssueHeader issue={issue} currentTitle={title.currentTitle} saving={updater.isPending || edit.descriptionSaving} unsaved={edit.unsaved} copyActions={copyActions} actions={menuActions} />

            <div className="flex min-h-0 flex-1 overflow-hidden">
                <div className="min-w-0 flex-1 overflow-y-auto">
                    <div className="mx-auto w-full max-w-[48rem] px-6 pt-10 pb-24 lg:px-12">
                        <IssueTitle identifier={issue.identifier} value={title.title} error={title.error} onChange={title.onChange} onBlur={title.save} />

                        {!wide && <div className="mt-6 rounded-xl border border-subtle bg-layer-1 p-2">{properties}</div>}

                        <IssueDescription
                            issue={issue}
                            updater={updater}
                            getTitle={getTitle}
                            controls={description}
                            historyOpen={historyOpen}
                            onHistoryOpenChange={setHistoryOpen}
                            onDirtyChange={edit.setDescriptionDirty}
                            onSavingChange={edit.setDescriptionSaving}
                        />

                        <IssueFiles projectId={issue.projectId} issueId={issue.id} />

                        <IssueSubIssues issue={issue} />

                        <IssueRelations projectId={issue.projectId} issueId={issue.id} identifier={issue.identifier} open={relationsOpen} onOpenChange={setRelationsOpen} />

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
        </main>
    );
}
