import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ErrorMessage } from "@/components/feedback/error-message";
import { useRealtimeChannels } from "@/features/realtime/use-realtime";
import { urls } from "@/lib/urls";
import { useIssue } from "../../hooks/use-issues";
import { issuePreviewTitle } from "../../lib/cached-issue-title";
import { IssueArrival, IssueLoadingSkeleton } from "./issue-loading";
import { IssuePage } from "./issue-page";

/** The issue page of a route: loads the issue, keeps its address canonical, and shows it once it is here. */
export const IssueView = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const identifier = useParams<{ issueIdentifier: string }>().issueIdentifier ?? "";
    const { data: issue, isLoading, isError } = useIssue(identifier);
    // The project channel carries the issue's own changes and its neighbours' (pager, sub-issues); the issue channel carries comments and relations.
    useRealtimeChannels([issue && `project:${issue.projectId}`]);

    // Keep the URL canonical: an identifier from before a key change, a missing or stale title slug,
    // or a lowercase identifier all become `/issue/KEY-12/current-title`.
    const canonicalUrl = issue ? urls.issue(issue.identifier, issue.title) : null;
    useEffect(() => {
        if (!canonicalUrl || location.pathname === canonicalUrl) return;
        void navigate(`${canonicalUrl}${location.search}`, { replace: true });
    }, [canonicalUrl, location.pathname, location.search, navigate]);

    if (isLoading) {
        const previewTitle = issuePreviewTitle(location.state, queryClient, identifier);
        return previewTitle ? <IssueArrival identifier={identifier} title={previewTitle} /> : <IssueLoadingSkeleton />;
    }
    if (isError || !issue) {
        return (
            <main className="flex h-full min-h-0 items-center justify-center bg-surface-1 p-6">
                <ErrorMessage message={t("issue.couldNotLoadIssue")} />
            </main>
        );
    }
    // One page per issue: moving to another issue starts its title, description and comment from scratch.
    return <IssuePage key={issue.id} issue={issue} />;
};
