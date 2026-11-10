import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AppIcons } from "@/components/foundations/icons";
import { useAppNavigation } from "@/components/layout/app-shell";
import { FavoriteStar } from "@/features/favorites/components/favorite-star";
import { FollowButton } from "@/features/notifications/components/follow-button";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { useProject } from "@/features/projects/hooks/use-project";
import { PresenceAvatars } from "@/features/realtime/components/presence-avatars";
import { useChannelPresence } from "@/features/realtime/use-realtime";
import { urls } from "@/lib/urls";
import { issueNavigation, issueViewTransitionStyle } from "@/lib/view-transition";
import type { IssueDetail } from "../../api";
import { useIssues } from "../../hooks/use-issues";
import { IssueActionsMenu, type CopyActions } from "./issue-actions-menu";

/** What the issue's actions menu can ask the page to do. */
export interface IssueMenuActions {
    onAddRelation: () => void;
    onSetParent: () => void;
    onOpenHistory: () => void;
    onDelete: () => void;
}

/**
 * The bar above the issue: where it sits in the project, the star and follow buttons, the actions menu, who else is
 * looking at it, whether something is saving, and the arrows to the issue before and after it in the list.
 */
export function IssueHeader({ issue, currentTitle, saving, unsaved, copyActions, actions }: { issue: IssueDetail; currentTitle: string; saving: boolean; unsaved: boolean; copyActions: CopyActions; actions: IssueMenuActions }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { openNavigation } = useAppNavigation();
    const { data: project } = useProject(issue.projectId);
    const { data: projectIssues } = useIssues(issue.projectId);
    const viewers = useChannelPresence(`issue:${issue.id}`);
    return (
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-subtle px-3">
            <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <span className="md:hidden">
                    <ButtonUtility icon={AppIcons.Menu} color="tertiary" tooltip={t("nav.expand")} onClick={openNavigation} />
                </span>
                <Link to={urls.project(issue.project.issueKey)} className="flex min-w-0 shrink items-center gap-2 text-secondary hover:text-primary">
                    <ProjectIcon icon={project?.iconAppearance ?? project?.icon} className="size-4 shrink-0" />
                    <span className="truncate">{issue.project.name}</span>
                </Link>
                <ChevronRight className="size-3 shrink-0 text-placeholder" aria-hidden="true" />
                <Link viewTransition to={urls.issues(issue.project.issueKey)} className="shrink-0 text-secondary hover:text-primary">{t("nav.issues")}</Link>
                <ChevronRight className="size-3 shrink-0 text-placeholder" aria-hidden="true" />
                <span className="min-w-0 truncate text-primary">
                    <span className="text-tertiary" style={issueViewTransitionStyle(issue.identifier, "id")}>{issue.identifier}</span> {currentTitle}
                </span>
                <FavoriteStar target={{ kind: "issue", projectId: issue.projectId, issueId: issue.id }} />
                <FollowButton identifier={issue.identifier} />
                <IssueActionsMenu {...copyActions} {...actions} />
            </div>
            <div className="flex shrink-0 items-center gap-3">
                <PresenceAvatars viewers={viewers} />
                {(saving || unsaved) && <span className="text-xs text-tertiary" role="status">{saving ? t("issue.savingIssue") : t("issue.unsavedIssue")}</span>}
                {projectIssues && projectIssues.length > 0 && <IssuePager issues={projectIssues} identifier={issue.identifier} onOpen={(next) => navigate(urls.issue(next), issueNavigation(projectIssues.find((item) => item.identifier === next)?.title))} />}
            </div>
        </header>
    );
}

function IssuePager({ issues, identifier, onOpen }: { issues: Array<{ identifier: string }>; identifier: string; onOpen: (identifier: string) => void }) {
    const { t } = useTranslation();
    const index = issues.findIndex((item) => item.identifier === identifier);
    if (index < 0) return null;
    return (
        <div className="flex items-center gap-0.5 text-[13px] text-tertiary">
            <span className="px-1 tabular-nums">
                {index + 1} <span className="text-placeholder">/ {issues.length}</span>
            </span>
            <ButtonUtility icon={ArrowDown} size="xs" color="tertiary" tooltip={t("common.next")} isDisabled={index === issues.length - 1} onClick={() => onOpen(issues[index + 1]!.identifier)} />
            <ButtonUtility icon={ArrowUp} size="xs" color="tertiary" tooltip={t("common.previous")} isDisabled={index === 0} onClick={() => onOpen(issues[index - 1]!.identifier)} />
        </div>
    );
}
