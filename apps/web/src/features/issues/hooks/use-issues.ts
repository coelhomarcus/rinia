import { nextLabels } from "@rinia/shared";
import type {
    BulkIssuePatch,
    CreateIssueCommentInput,
    CreateIssueInput,
    CreateIssueRelationInput,
    IssueListQuery,
    MyIssuesQuery,
    UpdateIssueCommentInput,
    UpdateIssueInput,
} from "@rinia/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/feedback/toaster";
import { AUTH_QUERY_KEY, type AuthUser } from "@/features/auth/api";
import { ApiError } from "@/lib/api-client";
import type { Issue, IssueComment, IssueDetail, IssuePerson, MyIssue } from "../api";
import {
    addCommentReaction,
    bulkDeleteIssues,
    bulkUpdateIssues,
    createIssue,
    createIssueComment,
    createIssueRelation,
    deleteIssue,
    deleteIssueComment,
    deleteIssueRelation,
    getIssue,
    listDescriptionRevisions,
    listIssueActivity,
    listIssueComments,
    listIssueRelations,
    listIssuePage,
    listIssues,
    listMyIssues,
    removeCommentReaction,
    restoreDescriptionRevision,
    updateIssue,
    updateIssueComment,
} from "../api";
import { applyOptimisticIssueList, flattenCachedIssues, isIssueDetailKey, isIssueListKey, mapCachedIssues, placeMovedAtTop } from "../lib/patch-cached-issue";

export const issuesKey = (projectId: string, query: IssueListQuery = { orderBy: "position" }) => ["projects", projectId, "issues", query] as const;
export const issueKey = (identifier: string) => ["issues", identifier] as const;
type IssueUpdateField = Exclude<keyof UpdateIssueInput, "expectedDescriptionRevision">;

export function useIssues(projectId: string, query: IssueListQuery = { orderBy: "position" }) {
    return useQuery({ queryKey: issuesKey(projectId, query), queryFn: () => listIssues(projectId, query), enabled: !!projectId });
}

const NO_ISSUES: Issue[] = [];

/**
 * A cursor window of a project's issues. The flattened `issues` stay in the cache, including the ones no row has
 * mounted, so a realtime refresh still updates them. When the first page's cursor moves (an insert at the top),
 * later pages are dropped and loaded again instead of skipping a row.
 */
export function useIssueWindow(projectId: string, query: IssueListQuery, options?: { enabled?: boolean }) {
    const queryClient = useQueryClient();
    const queryKey = useMemo(() => [...issuesKey(projectId, query), "page"] as const, [projectId, query]);
    const result = useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam }) => listIssuePage(projectId, pageParam ? { ...query, cursor: pageParam } : query),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        enabled: !!projectId && (options?.enabled ?? true),
    });
    const issues = useMemo(() => result.data?.pages.flatMap((page) => page.issues) ?? NO_ISSUES, [result.data]);
    const total = result.data?.pages[0]?.total ?? 0;
    const firstCursor = result.data?.pages[0]?.nextCursor;
    const pageCount = result.data?.pages.length ?? 0;
    const secondParam = result.data?.pageParams[1];
    useEffect(() => {
        if (pageCount < 2 || firstCursor === secondParam) return;
        queryClient.setQueryData(queryKey, (current: { pages: unknown[]; pageParams: unknown[] } | undefined) =>
            current ? { pages: current.pages.slice(0, 1), pageParams: current.pageParams.slice(0, 1) } : current,
        );
    }, [firstCursor, pageCount, queryClient, queryKey, secondParam]);
    return { ...result, issues, total };
}

export const MY_ISSUES_QUERY_KEY = ["my-issues"] as const;

export function useMyIssues(query: MyIssuesQuery) {
    return useQuery({ queryKey: [...MY_ISSUES_QUERY_KEY, query], queryFn: () => listMyIssues(query) });
}

/** Edits an issue from "My issues". Every list and the issue page change at once, and roll back together. */
export function useUpdateMyIssue() {
    const queryClient = useQueryClient();
    const showToast = useToast();
    const { t } = useTranslation();
    return useMutation({
        mutationFn: ({ issue, input }: { issue: MyIssue; input: UpdateIssueInput }) => updateIssue(issue.identifier, input),
        onMutate: async ({ issue, input }) => {
            await Promise.all([
                queryClient.cancelQueries({ predicate: (query) => isIssueListKey(query.queryKey) }),
                queryClient.cancelQueries({ queryKey: issueKey(issue.identifier) }),
            ]);
            const previous = queryClient.getQueriesData<unknown>({ predicate: (query) => isIssueListKey(query.queryKey) });
            const previousDetail = queryClient.getQueryData<IssueDetail>(issueKey(issue.identifier));
            queryClient.setQueriesData({ predicate: (query) => isIssueListKey(query.queryKey) }, (current) =>
                mapCachedIssues<Issue>(current, (list) => applyOptimisticIssueList(list, issue.identifier, input) ?? list),
            );
            queryClient.setQueryData<IssueDetail>(issueKey(issue.identifier), (current) => (current ? { ...current, ...input } : current));
            return { previous, previousDetail };
        },
        onError: (error, _variables, context) => {
            context?.previous.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
            if (context) queryClient.setQueryData(issueKey(_variables.issue.identifier), context.previousDetail);
            showToast({ tone: "error", title: error instanceof ApiError ? error.message : t("errors.requestFailed") });
        },
        onSettled: (_data, _error, { issue }) => {
            queryClient.invalidateQueries({ queryKey: MY_ISSUES_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: ["projects", issue.projectId, "issues"] });
            queryClient.invalidateQueries({ queryKey: issueKey(issue.identifier) });
        },
    });
}

export function useIssue(identifier: string | null) {
    return useQuery({ queryKey: issueKey(identifier ?? ""), queryFn: () => getIssue(identifier!), enabled: !!identifier });
}

export function useCreateIssue(projectId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateIssueInput) => createIssue(projectId, input),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId, "issues"] }),
    });
}

export function useUpdateIssue(projectId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        // Edits to a project's issues are sent one after another, so a slower request never lands after a newer one.
        scope: { id: `issues:${projectId}` },
        mutationFn: ({ identifier, input }: { identifier: string; input: UpdateIssueInput }) => updateIssue(identifier, input),
        onMutate: async ({ identifier, input }) => {
            const { expectedDescriptionRevision: _expectedDescriptionRevision, ...inputValues } = input;
            const optimisticValues: Partial<Pick<Issue, IssueUpdateField>> = inputValues;
            await Promise.all([
                queryClient.cancelQueries({ predicate: (query) => isIssueListKey(query.queryKey) }),
                queryClient.cancelQueries({ queryKey: issueKey(identifier) }),
            ]);
            const previous = queryClient.getQueriesData<unknown>({ predicate: (query) => isIssueListKey(query.queryKey) });
            const previousDetail = queryClient.getQueryData<IssueDetail>(issueKey(identifier));

            // Moved to another column without a place picked, the card goes to the top, as the server puts it.
            const placesAtTop = !!input.columnId && input.position === undefined;
            queryClient.setQueriesData({ predicate: (query) => isIssueListKey(query.queryKey) }, (current) =>
                mapCachedIssues<Issue>(current, (list) => applyOptimisticIssueList(list, identifier, input) ?? list),
            );
            const parent = parentFromLists(previous, input.parentIssueId);
            queryClient.setQueryData<IssueDetail>(issueKey(identifier), (current) => {
                if (!current) return current;
                return { ...current, ...optimisticValues, ...(parent !== undefined ? { parent } : {}) };
            });

            return { previous, previousDetail, optimisticValues, placesAtTop, parentTouched: "parentIssueId" in input };
        },
        onError: (_error, variables, context) => {
            if (!context) return;
            const fields = Object.keys(context.optimisticValues) as IssueUpdateField[];
            context.previous.forEach(([queryKey, previousData]) => {
                queryClient.setQueryData(queryKey, (current) => {
                    if (!current || !previousData) return current;
                    const previousIssues = flattenCachedIssues<Issue>(previousData);
                    return mapCachedIssues<Issue>(current, (issues) =>
                        issues.map((issue) => {
                            if (issue.identifier !== variables.identifier) return issue;
                            const previousIssue = previousIssues.find((entry) => entry.identifier === variables.identifier);
                            if (!previousIssue) return issue;
                            const rollback: Partial<Pick<Issue, IssueUpdateField>> = {};
                            for (const field of fields) {
                                if (Object.is(issue[field], context.optimisticValues[field])) {
                                    (rollback as Record<string, unknown>)[field] = previousIssue[field as keyof Issue];
                                }
                            }
                            // The position was not part of the request, so it is not among the fields above.
                            if (context.placesAtTop) rollback.position = previousIssue.position;
                            return { ...issue, ...rollback };
                        }),
                    );
                });
            });
            const previousDetail = context.previousDetail;
            if (previousDetail) {
                queryClient.setQueryData<IssueDetail>(issueKey(variables.identifier), (current) => {
                    if (!current) return current;
                    const rollback: Partial<Pick<IssueDetail, IssueUpdateField>> & { parent?: IssueDetail["parent"] } = {};
                    for (const field of fields) {
                        if (Object.is(current[field], context.optimisticValues[field])) {
                            (rollback as Record<string, unknown>)[field] = previousDetail[field as keyof IssueDetail];
                        }
                    }
                    if (context.parentTouched) rollback.parent = previousDetail.parent;
                    return { ...current, ...rollback };
                });
            }
        },
        onSuccess: (issue) => {
            const { createdBy: _createdBy, ...updatedFields } = issue;
            queryClient.setQueryData<IssueDetail>(issueKey(issue.identifier), (current) => (current ? { ...current, ...updatedFields } : current));
            queryClient.invalidateQueries({ queryKey: ["projects", projectId, "issues"] });
            queryClient.invalidateQueries({ queryKey: MY_ISSUES_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: issueKey(issue.identifier) });
        },
        // Invalidating the issue also refreshes whether you follow it, which assigning or mentioning can change.
        onSettled: (_data, _error, variables) => queryClient.invalidateQueries({ queryKey: issueKey(variables.identifier) }),
    });
}

export function useDeleteIssue(projectId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: deleteIssue,
        onSuccess: async (_result, identifier) => {
            queryClient.removeQueries({ queryKey: issueKey(identifier), exact: true });
            await queryClient.invalidateQueries({ queryKey: ["projects", projectId, "issues"] });
            await queryClient.invalidateQueries({ queryKey: MY_ISSUES_QUERY_KEY });
            await queryClient.invalidateQueries({ queryKey: ["favorites"] });
            await queryClient.invalidateQueries({ queryKey: ["issues"] });
        },
    });
}

export function useIssueComments(identifier: string | null) {
    return useQuery({ queryKey: [...issueKey(identifier ?? ""), "comments"], queryFn: () => listIssueComments(identifier!), enabled: !!identifier });
}

export function useIssueActivity(identifier: string | null) {
    return useQuery({ queryKey: [...issueKey(identifier ?? ""), "activity"], queryFn: () => listIssueActivity(identifier!), enabled: !!identifier });
}

export function useIssueRelations(identifier: string | null) {
    return useQuery({ queryKey: [...issueKey(identifier ?? ""), "relations"], queryFn: () => listIssueRelations(identifier!), enabled: !!identifier });
}

export function useCreateIssueComment(identifier: string) {
    const queryClient = useQueryClient();
    const commentsKey = [...issueKey(identifier), "comments"] as const;
    return useMutation({
        mutationFn: (input: CreateIssueCommentInput) => createIssueComment(identifier, input),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: commentsKey });
            const previous = queryClient.getQueryData<IssueComment[]>(commentsKey);
            const me = queryClient.getQueryData<AuthUser>(AUTH_QUERY_KEY);
            const pendingId = `pending:${crypto.randomUUID()}`;
            const now = new Date().toISOString();
            const pending: IssueComment = {
                id: pendingId,
                issueId: previous?.[0]?.issueId ?? "",
                authorId: me?.id ?? "",
                parentCommentId: input.parentCommentId ?? null,
                contentJson: input.contentJson,
                source: null,
                createdAt: now,
                updatedAt: now,
                author: { id: me?.id ?? "", name: me?.name ?? "", username: me?.username ?? "", avatarUrl: me?.avatarUrl ?? null },
                reactions: [],
                pending: true,
            };
            queryClient.setQueryData<IssueComment[]>(commentsKey, (current) => [...(current ?? []), pending]);
            return { previous, pendingId };
        },
        onError: (_error, _input, context) => {
            if (context) queryClient.setQueryData(commentsKey, context.previous);
        },
        onSuccess: (comment, _input, context) => {
            queryClient.setQueryData<IssueComment[]>(commentsKey, (current) => current?.map((item) => (item.id === context?.pendingId ? comment : item)));
            // Commenting makes you follow the issue.
            queryClient.invalidateQueries({ queryKey: [...issueKey(identifier), "subscription"] });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: commentsKey }),
    });
}

export function useUpdateIssueComment(identifier: string) {
    const queryClient = useQueryClient();
    const commentsKey = [...issueKey(identifier), "comments"] as const;
    return useMutation({
        mutationFn: ({ commentId, input }: { commentId: string; input: UpdateIssueCommentInput }) => updateIssueComment(commentId, input),
        onMutate: async ({ commentId, input }) => {
            await queryClient.cancelQueries({ queryKey: commentsKey });
            const previous = queryClient.getQueryData<IssueComment[]>(commentsKey);
            queryClient.setQueryData<IssueComment[]>(commentsKey, (current) =>
                current?.map((comment) =>
                    comment.id === commentId ? { ...comment, contentJson: input.contentJson, updatedAt: new Date().toISOString() } : comment,
                ),
            );
            return { previous };
        },
        onError: (_error, _variables, context) => queryClient.setQueryData(commentsKey, context?.previous),
        onSettled: () => queryClient.invalidateQueries({ queryKey: commentsKey }),
    });
}

export function useDeleteIssueComment(identifier: string) {
    const queryClient = useQueryClient();
    const commentsKey = [...issueKey(identifier), "comments"] as const;
    return useMutation({
        mutationFn: deleteIssueComment,
        onMutate: async (commentId) => {
            await queryClient.cancelQueries({ queryKey: commentsKey });
            const previous = queryClient.getQueryData<IssueComment[]>(commentsKey);
            queryClient.setQueryData<IssueComment[]>(commentsKey, (current) =>
                current?.filter((comment) => comment.id !== commentId && comment.parentCommentId !== commentId),
            );
            return { previous };
        },
        onError: (_error, _commentId, context) => queryClient.setQueryData(commentsKey, context?.previous),
        onSettled: () => queryClient.invalidateQueries({ queryKey: commentsKey }),
    });
}

export function useCreateIssueRelation(identifier: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateIssueRelationInput) => createIssueRelation(identifier, input),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...issueKey(identifier), "relations"] }),
    });
}

export function useDeleteIssueRelation(identifier: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: deleteIssueRelation,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...issueKey(identifier), "relations"] }),
    });
}

/**
 * Adds or removes your reaction. The chip changes at once, then takes the server's list of reactions, which also
 * brings in anyone else's that arrived meanwhile.
 */
export function useToggleReaction(identifier: string, me: IssuePerson | null) {
    const queryClient = useQueryClient();
    const showToast = useToast();
    const { t } = useTranslation();
    const commentsKey = [...issueKey(identifier), "comments"];
    const setReactions = (commentId: string, update: (reactions: IssueComment["reactions"]) => IssueComment["reactions"]) =>
        queryClient.setQueryData<IssueComment[]>(commentsKey, (current) =>
            current?.map((comment) => (comment.id === commentId ? { ...comment, reactions: update(comment.reactions) } : comment)),
        );
    return useMutation({
        mutationFn: ({ commentId, emoji, add }: { commentId: string; emoji: string; add: boolean }) =>
            add ? addCommentReaction(commentId, emoji) : removeCommentReaction(commentId, emoji),
        onMutate: async ({ commentId, emoji, add }) => {
            await queryClient.cancelQueries({ queryKey: commentsKey });
            const previous = queryClient.getQueryData<IssueComment[]>(commentsKey);
            if (me) {
                setReactions(commentId, (reactions) => {
                    if (!add)
                        return reactions
                            .map((group) => (group.emoji === emoji ? { ...group, users: group.users.filter((user) => user.id !== me.id) } : group))
                            .filter((group) => group.users.length > 0);
                    if (reactions.some((group) => group.emoji === emoji))
                        return reactions.map((group) =>
                            group.emoji === emoji && !group.users.some((user) => user.id === me.id) ? { ...group, users: [...group.users, me] } : group,
                        );
                    return [...reactions, { emoji, users: [me] }];
                });
            }
            return { previous };
        },
        onError: (error, _variables, context) => {
            queryClient.setQueryData(commentsKey, context?.previous);
            showToast({ tone: "error", title: error instanceof ApiError ? error.message : t("errors.requestFailed") });
        },
        onSuccess: (reactions, { commentId }) => setReactions(commentId, () => reactions),
    });
}

export function useDescriptionRevisions(identifier: string, enabled: boolean) {
    return useQuery({
        queryKey: [...issueKey(identifier), "description-revisions"],
        queryFn: () => listDescriptionRevisions(identifier),
        enabled: enabled && !!identifier,
    });
}

export function useRestoreDescriptionRevision(identifier: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (revisionId: string) => restoreDescriptionRevision(identifier, revisionId),
        onSuccess: (issue) => {
            queryClient.invalidateQueries({ queryKey: issueKey(identifier) });
            queryClient.invalidateQueries({ queryKey: ["projects", issue.projectId, "issues"] });
        },
    });
}

/** An issue as a bulk change leaves it, for showing the change before the server confirms it. */
export function applyBulkPatch<T extends { categoryIds: string[] }>(issue: T, patch: BulkIssuePatch): T {
    const { categoryIds, addCategoryIds, removeCategoryIds, ...values } = patch;
    const touchesLabels = categoryIds !== undefined || addCategoryIds !== undefined || removeCategoryIds !== undefined;
    return { ...issue, ...values, ...(touchesLabels ? { categoryIds: nextLabels(issue.categoryIds, patch) } : {}) };
}

/** The parent row the issue page shows, taken from a list already in the cache. `undefined` leaves the current parent. */
function parentFromLists(lists: Array<[unknown, unknown]>, parentIssueId: string | null | undefined): IssueDetail["parent"] | undefined {
    if (parentIssueId === undefined) return undefined;
    if (parentIssueId === null) return null;
    for (const [, data] of lists) {
        const found = flattenCachedIssues<Issue>(data).find((issue) => issue.id === parentIssueId);
        if (found) return { id: found.id, number: found.number, title: found.title };
    }
    return undefined;
}

/** Changes many issues in one request. Every cached list shows the change at once and rolls back if it fails. */
export function useBulkUpdateIssues(projectId: string) {
    const queryClient = useQueryClient();
    const lists = ["projects", projectId, "issues"];
    return useMutation({
        // Shares the queue of single edits (see `useUpdateIssue`), so bulk and single changes land in the order made.
        scope: { id: `issues:${projectId}` },
        mutationFn: ({ issueIds, patch }: { issueIds: string[]; patch: BulkIssuePatch }) => bulkUpdateIssues(projectId, issueIds, patch),
        onMutate: async ({ issueIds, patch }) => {
            await queryClient.cancelQueries({ predicate: (query) => isIssueListKey(query.queryKey) || isIssueDetailKey(query.queryKey) });
            const previous = queryClient.getQueriesData<unknown>({ predicate: (query) => isIssueListKey(query.queryKey) });
            const previousDetails = queryClient.getQueriesData<IssueDetail>({ predicate: (query) => isIssueDetailKey(query.queryKey) });
            const ids = new Set(issueIds);
            queryClient.setQueriesData({ predicate: (query) => isIssueListKey(query.queryKey) }, (current) =>
                mapCachedIssues<Issue>(current, (list) => {
                    const placed = patch.columnId ? placeMovedAtTop(list, (issue) => ids.has(issue.id), patch.columnId) : list;
                    return placed.map((issue) => (ids.has(issue.id) ? applyBulkPatch(issue, patch) : issue));
                }),
            );
            for (const [queryKey, detail] of previousDetails) {
                if (detail && ids.has(detail.id)) queryClient.setQueryData(queryKey, applyBulkPatch(detail, patch));
            }
            return { previous, previousDetails };
        },
        onError: (_error, _variables, context) => {
            context?.previous.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
            context?.previousDetails.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: lists });
            queryClient.invalidateQueries({ queryKey: MY_ISSUES_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: ["favorites"] });
            queryClient.invalidateQueries({ queryKey: ["issues"] });
        },
    });
}

/** Deletes many issues in one request. They leave every cached list at once and come back if it fails. */
export function useBulkDeleteIssues(projectId: string) {
    const queryClient = useQueryClient();
    const lists = ["projects", projectId, "issues"];
    return useMutation({
        mutationFn: (issueIds: string[]) => bulkDeleteIssues(projectId, issueIds),
        onMutate: async (issueIds) => {
            await queryClient.cancelQueries({ predicate: (query) => isIssueListKey(query.queryKey) });
            const previous = queryClient.getQueriesData<unknown>({ predicate: (query) => isIssueListKey(query.queryKey) });
            const ids = new Set(issueIds);
            queryClient.setQueriesData({ predicate: (query) => isIssueListKey(query.queryKey) }, (current) =>
                mapCachedIssues<Issue>(current, (list) => list.filter((issue) => !ids.has(issue.id))),
            );
            return { previous };
        },
        onError: (_error, _variables, context) => context?.previous.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data)),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: lists });
            queryClient.invalidateQueries({ queryKey: MY_ISSUES_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: ["favorites"] });
            queryClient.invalidateQueries({ queryKey: ["issues"] });
        },
    });
}
