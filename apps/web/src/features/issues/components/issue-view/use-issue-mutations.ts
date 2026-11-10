import { useCallback, useMemo, useRef, useState } from "react";
import type { UpdateIssueInput } from "@rinia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/feedback/toaster";
import { defaultIssueColumn } from "@/features/board/column-bucket";
import { useColumns } from "@/features/board/hooks/use-board";
import { urls } from "@/lib/urls";
import { issueNavigation } from "@/lib/view-transition";
import { restoreIssue as restoreDeletedIssue, type IssueDetail } from "../../api";
import { issueKey, useCreateIssue, useCreateIssueRelation, useDeleteIssue, useDeleteIssueRelation, useUpdateIssue } from "../../hooks/use-issues";
import { errorMessage } from "../../lib/error-message";

/**
 * Saves changes to an issue. It is the page's one update mutation, so every edit (property, title, description) is
 * queued behind the others and the page can tell when any of them is saving. The object only changes when `isPending`
 * does, so children that receive it can be memoized.
 */
export function useIssueUpdater(projectId: string) {
    const { mutate, mutateAsync, isPending } = useUpdateIssue(projectId);
    return useMemo(() => ({ mutate, mutateAsync, isPending }), [mutate, mutateAsync, isPending]);
}
export type IssueUpdater = ReturnType<typeof useIssueUpdater>;

/** Saves one property. A change of state or assignee can be undone from the toast that confirms it. */
export function useIssuePropertySave(issue: IssueDetail, updater: IssueUpdater) {
    const { t } = useTranslation();
    const showToast = useToast();
    const [error, setError] = useState<string | null>(null);
    const currentIssueId = useRef(issue.id);
    currentIssueId.current = issue.id;

    const save = (input: UpdateIssueInput) => {
        const actionIssueId = issue.id;
        setError(null);
        const undo = input.columnId !== undefined && input.columnId !== issue.columnId
            ? { patch: { columnId: issue.columnId }, title: t("issue.statusUpdated") }
            : input.assigneeId !== undefined && input.assigneeId !== issue.assigneeId
              ? { patch: { assigneeId: issue.assigneeId }, title: t("issue.assigneeUpdated") }
              : null;
        updater.mutate(
            { identifier: issue.identifier, input },
            {
                onSuccess: () => {
                    if (!undo) return;
                    showToast({
                        title: undo.title,
                        action: {
                            label: t("issue.undo"),
                            onClick: async () => {
                                try {
                                    await updater.mutateAsync({ identifier: issue.identifier, input: undo.patch });
                                } catch {
                                    showToast({ tone: "error", title: t("issue.couldNotUndo") });
                                }
                            },
                        },
                    });
                },
                onError: (reason) => { if (currentIssueId.current === actionIssueId) setError(errorMessage(reason, t("issue.couldNotSaveIssue"))); },
            },
        );
    };
    return { save, error };
}

/** Adds a sub-issue in the project's first open state, then refreshes the parent so it lists it. */
export function useCreateSubIssue(issue: Pick<IssueDetail, "id" | "identifier" | "projectId" | "columnId">) {
    const queryClient = useQueryClient();
    const { data: columns } = useColumns(issue.projectId);
    const createIssue = useCreateIssue(issue.projectId);
    const create = async (title: string) => {
        await createIssue.mutateAsync({ columnId: defaultIssueColumn(columns)?.id ?? issue.columnId, title, parentIssueId: issue.id, priority: "none" });
        await queryClient.invalidateQueries({ queryKey: issueKey(issue.identifier) });
    };
    return { create, isCreating: createIssue.isPending };
}

/** Adds and removes the relations of one issue. */
export function useRelationActions(identifier: string) {
    const createRelation = useCreateIssueRelation(identifier);
    const deleteRelation = useDeleteIssueRelation(identifier);
    const { mutateAsync: createAsync } = createRelation;
    const { mutate: deleteMutate } = deleteRelation;
    const add = useCallback((targetIssueIdentifier: string, type: "blocks" | "blocked_by" | "related" | "duplicate") => createAsync({ targetIssueIdentifier, type }).then(() => undefined), [createAsync]);
    const remove = useCallback((relationId: string) => deleteMutate(relationId), [deleteMutate]);
    return { add, remove, isPending: createRelation.isPending || deleteRelation.isPending };
}

/** Deletes the issue, goes back to its project's list, and offers to undo from the toast. */
export function useDeleteIssueAction(issue: Pick<IssueDetail, "identifier" | "title" | "projectId" | "project">) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const showToast = useToast();
    const queryClient = useQueryClient();
    const deleteIssue = useDeleteIssue(issue.projectId);
    const remove = () => deleteIssue.mutate(issue.identifier, {
        onSuccess: ({ deletedAt }) => {
            void navigate(urls.issues(issue.project.issueKey), issueNavigation());
            showToast({
                title: t("issue.deletedOne"),
                action: {
                    label: t("issue.undo"),
                    onClick: async () => {
                        try {
                            await restoreDeletedIssue(issue.identifier, deletedAt);
                            await Promise.all([
                                queryClient.invalidateQueries({ queryKey: ["projects", issue.projectId, "issues"] }),
                                queryClient.invalidateQueries({ queryKey: ["my-issues"] }),
                                queryClient.invalidateQueries({ queryKey: ["issues"] }),
                            ]);
                            void navigate(urls.issue(issue.identifier, issue.title), issueNavigation(issue.title));
                        } catch {
                            showToast({ tone: "error", title: t("issue.couldNotUndo") });
                        }
                    },
                },
            });
        },
    });
    return { remove, isPending: deleteIssue.isPending };
}
