import { memo, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useColumns } from "@/features/board/hooks/use-board";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { issueFilesKey } from "@/features/editor/file-upload";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { useIssueActivity, useIssueComments, useIssues } from "../../hooks/use-issues";
import { IssueTimeline } from "./issue-timeline";
import { useCommentComposer } from "./use-comment-composer";

/** Lists still loading are empty, and one shared array keeps them from looking new on every render. */
const NONE: never[] = [];

/**
 * The issue's comments and history in one feed, with the box to write a comment. It takes only the issue's ids and
 * loads the rest itself, so the page re-rendering for something else, such as typing in the description, does not
 * render the feed again.
 */
export const IssueActivity = memo(function IssueActivity({ issueId, identifier, projectId, onCommentFilledChange }: { issueId: string; identifier: string; projectId: string; onCommentFilledChange: (filled: boolean) => void }) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { data: comments, isLoading: commentsLoading, isError: commentsLoadFailed } = useIssueComments(identifier);
    const { data: activity, isLoading: activityLoading, isError: activityLoadFailed } = useIssueActivity(identifier);
    const { data: columns } = useColumns(projectId);
    const { data: members } = useProjectMembers(projectId);
    const { data: categories } = useCategories(projectId);
    const { data: projectIssues } = useIssues(projectId);
    const composer = useCommentComposer({ issueId, identifier, projectId, onFilledChange: onCommentFilledChange });
    const mentionItems = useMemo(() => (members ?? []).map((member) => ({ id: member.id, label: member.username, description: member.name })), [members]);
    const lookups = useMemo(() => ({ columns: columns ?? NONE, members: members ?? NONE, categories: categories ?? NONE, projectIssues: projectIssues ?? NONE }), [columns, members, categories, projectIssues]);
    const currentUser = useMemo(() => (user ? { name: user.name, avatarUrl: user.avatarUrl } : null), [user]);
    const uploads = useMemo(
        () => ({ projectId, issueId, onUploaded: () => void queryClient.invalidateQueries({ queryKey: issueFilesKey(projectId, issueId) }) }),
        [projectId, issueId, queryClient],
    );

    return (
        <IssueTimeline
            activity={activity ?? NONE}
            comments={comments ?? NONE}
            isLoading={activityLoading || commentsLoading}
            loadFailed={activityLoadFailed || commentsLoadFailed}
            lookups={lookups}
            currentUserId={user?.id}
            currentUser={currentUser}
            mentionItems={mentionItems}
            onReact={composer.react}
            onReply={composer.reply}
            value={composer.value}
            onChange={composer.onChange}
            isSubmitting={composer.isSubmitting}
            error={composer.error}
            uploads={uploads}
            onSubmit={composer.submit}
            onDelete={composer.remove}
            onEdit={composer.edit}
        />
    );
});
