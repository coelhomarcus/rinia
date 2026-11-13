import { useEffect, useRef, useState } from "react";
import { ChevronRight, FileText, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { urls } from "@/lib/urls";
import { repositoryHost } from "@/features/projects/lib/repository";
import { useRouteProject } from "@/features/projects/route-project";
import { Avatar } from "@/components/base/avatar/avatar";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { ErrorMessage } from "@/components/feedback/error-message";
import { AppIcons } from "@/components/foundations/icons";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { ModalDialog } from "@/components/overlay/modal-dialog";
import { useCreateDocument, useDocuments } from "@/features/documents/hooks/use-documents";
import { AddMemberForm, memberInitials } from "@/features/projects/components/members-panel";
import { ProjectIconControl } from "@/features/projects/components/project-appearance-controls";
import { DitherBanner } from "@/features/projects/components/overview/dither-banner";
import { ProjectActivity } from "@/features/projects/components/overview/project-activity";
import { ProjectIcon, projectIconColor } from "@/features/projects/components/project-icon";
import { ProjectWorkspaceHeader } from "@/features/projects/components/project-workspace-header";
import { useProject } from "@/features/projects/hooks/use-project";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { useProjectPermissions } from "@/features/projects/hooks/use-project-permissions";
import { useUpdateProject } from "@/features/projects/hooks/use-projects";
import { useTranslation } from "react-i18next";

export const ProjectOverviewPage = () => {
    const { projectId, projectKey } = useRouteProject();
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { data: project, isLoading, isError } = useProject(projectId);
    const { data: documents } = useDocuments(projectId);
    const { data: members } = useProjectMembers(projectId);
    const { can } = useProjectPermissions(projectId);
    const createDocument = useCreateDocument(projectId);
    const icon = project?.iconAppearance ?? project?.icon;
    const colored = !!projectIconColor(icon);

    async function addDocument() {
        const page = await createDocument.mutateAsync({});
        void navigate(urls.document(projectKey, page));
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-surface-1">
            <ProjectWorkspaceHeader projectId={projectId} activeView="overview" />
            <main className="min-h-0 w-full flex-1 overflow-y-auto">
                {isLoading ? (
                    <OverviewSkeleton />
                ) : isError || !project ? (
                    <ErrorMessage message={t("errors.requestFailed")} />
                ) : (
                    <div className="relative">
                    <DitherBanner color={projectIconColor(icon)} className="absolute inset-x-0 top-0 h-52" />
                    <div className="relative mx-auto grid max-w-6xl gap-10 px-6 pt-36 pb-10 lg:grid-cols-[minmax(0,1fr)_14rem] lg:px-10">
                        <div className="min-w-0 lg:pl-12">
                            <div className="flex items-center gap-3">
                                <ProjectIconControl
                                    projectId={projectId}
                                    icon={icon}
                                    canManage={can("project.update")}
                                    className={`grid size-9 shrink-0 place-items-center rounded-lg outline-accent-strong ${colored ? "" : "bg-accent-primary text-white"}`}
                                    iconClassName={colored ? "size-9 rounded-lg" : "size-5"}
                                />
                                <h1 className="min-w-0 truncate text-[26px] leading-8 font-semibold tracking-tight text-primary">{project.name}</h1>
                            </div>
                            <ProjectDescription projectId={projectId} description={project.description ?? ""} editable={can("project.update")} />

                            {can("project.stats") && <ProjectActivity projectId={projectId} accent={projectIconColor(icon)} />}

                            <section className="mt-12" aria-labelledby="project-resources">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 id="project-resources" className="text-[17px] font-medium text-primary">{t("projects.homeResources")}</h2>
                                    {can("pages.write") && (
                                    <Tooltip title={t("documents.newPage")}>
                                    <button
                                        type="button"
                                        aria-label={t("documents.newPage")}
                                        disabled={createDocument.isPending}
                                        onClick={() => void addDocument().catch(() => undefined)}
                                        className="grid size-7 place-items-center rounded-full border border-subtle text-tertiary hover:bg-layer-transparent-hover hover:text-primary disabled:opacity-50"
                                    >
                                        <Plus className="size-3.5" />
                                    </button>
                                    </Tooltip>
                                    )}
                                </div>
                                {createDocument.isError && <div className="mt-3"><ErrorMessage message={t("documents.createFailed")} /></div>}
                                {documents && documents.length > 0 ? (
                                    <ul className="mt-3 -mx-2">
                                        {documents.map((document) => (
                                            <li key={document.id}>
                                                <Link
                                                    to={urls.document(projectKey, document)}
                                                    className="flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px] text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                                                    data-document-context="true"
                                                    data-project-id={projectId}
                                                    data-document-id={document.id}
                                                    data-document-title={document.title}
                                                    data-document-author-id={document.createdBy}
                                                >
                                                    {document.iconAppearance ? <ProjectIcon icon={document.iconAppearance} className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0 text-tertiary" />}
                                                    <span className="min-w-0 flex-1 truncate">{document.title}</span>
                                                    <span className="shrink-0 text-xs text-placeholder">
                                                        {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(document.updatedAt))}
                                                    </span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    documents && <p className="mt-2 text-[13px] text-placeholder">{t("projects.homeResourcesHint")}</p>
                                )}
                            </section>
                        </div>

                        <aside className="flex flex-col gap-8">
                            <section aria-labelledby="project-members">
                                <h2 id="project-members" className="text-[13px] text-tertiary">{t("settings.members")}</h2>
                                <div className="mt-2.5 flex items-center gap-2">
                                    <Link
                                        to={urls.members(projectKey)}
                                        aria-label={t("projects.viewMembers")}
                                        className="flex h-8 items-center gap-1 rounded-full border border-subtle py-1 pr-1.5 pl-1 text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
                                    >
                                        <span className="flex -space-x-1.5">
                                            {(members ?? []).slice(0, 4).map((member) => (
                                                <Avatar key={member.id} src={member.avatarUrl ?? undefined} initials={memberInitials(member.name)} size="xs" className="ring-2 ring-[var(--bg-surface-1)]" />
                                            ))}
                                        </span>
                                        {members && members.length > 4 && <span className="pl-1 text-xs">+{members.length - 4}</span>}
                                        <ChevronRight className="size-3.5" aria-hidden="true" />
                                    </Link>
                                    {can("members.manage") && (
                                        <ModalDialog
                                            trigger={
                                                <Tooltip title={t("settings.addMember")}>
                                                    <button type="button" aria-label={t("settings.addMember")} className="grid size-8 place-items-center rounded-full border border-subtle text-tertiary hover:bg-layer-transparent-hover hover:text-primary">
                                                        <Plus className="size-3.5" />
                                                    </button>
                                                </Tooltip>
                                            }
                                            title={t("settings.addMember")}
                                            description={t("settings.addMemberDescription")}
                                        >
                                            {({ close }) => <AddMemberForm projectId={projectId} onClose={close} />}
                                        </ModalDialog>
                                    )}
                                </div>
                            </section>
                            <section aria-labelledby="project-go-to">
                                <h2 id="project-go-to" className="text-[13px] text-tertiary">{t("projects.goTo")}</h2>
                                <nav className="mt-2 -mx-1.5 grid gap-0.5">
                                    {can("project.update") && <GoTo to={urls.projectSettings(projectKey, "general")} icon={AppIcons.Settings} label={t("nav.projectSettings")} />}
                                    <GoTo to={urls.issues(projectKey)} icon={AppIcons.Issues} label={t("nav.issues")} />
                                    <GoTo to={urls.documents(projectKey)} icon={AppIcons.Documents} label={t("nav.documents")} />
                                    <GoTo to={urls.members(projectKey)} icon={AppIcons.MyIssues} label={t("settings.members")} />
                                    {project.repositoryUrl && <RepositoryLink url={project.repositoryUrl} />}
                                </nav>
                            </section>
                        </aside>
                    </div>
                    </div>
                )}
            </main>
        </div>
    );
};

/** Owners edit the description in place; it saves when the field loses focus. */
function ProjectDescription({ projectId, description, editable }: { projectId: string; description: string; editable: boolean }) {
    const { t } = useTranslation();
    const update = useUpdateProject(projectId);
    const [draft, setDraft] = useState(description);
    const field = useRef<HTMLTextAreaElement>(null);
    useEffect(() => setDraft(description), [description]);
    useEffect(() => {
        const element = field.current;
        if (!element) return;
        element.style.height = "auto";
        element.style.height = `${element.scrollHeight}px`;
    }, [draft]);

    if (!editable) return description ? <p className="mt-3 max-w-2xl text-[15px] leading-6 whitespace-pre-wrap text-secondary">{description}</p> : null;

    return (
        <textarea
            ref={field}
            rows={1}
            value={draft}
            maxLength={2000}
            aria-label={t("projects.description")}
            placeholder={t("projects.addDescription")}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
                const next = draft.trim();
                if (next !== description) update.mutate({ description: next || null });
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    setDraft(description);
                    event.currentTarget.blur();
                }
            }}
            className="field-sizing-content mt-3 block w-full max-w-2xl resize-none overflow-hidden bg-transparent text-[15px] leading-6 text-secondary outline-none placeholder:text-placeholder"
        />
    );
}

function OverviewSkeleton() {
    const { t } = useTranslation();
    return (
        <div className="mx-auto grid max-w-6xl gap-10 px-6 pt-36 pb-10 lg:grid-cols-[minmax(0,1fr)_14rem] lg:px-10" role="status" aria-label={t("common.loading")} aria-live="polite">
            <div className="space-y-4 lg:pl-12">
                <div className="flex items-center gap-3"><Skeleton className="size-9 rounded-lg" /><Skeleton className="h-7 w-56" /></div>
                <Skeleton className="h-5 w-80 max-w-full" />
                <div className="space-y-2 pt-8"><Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
            </div>
            <div className="space-y-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-24 rounded-full" /><Skeleton className="h-4 w-16" /><Skeleton className="h-24 w-full" /></div>
        </div>
    );
}

function GoTo({ to, icon: Icon, label }: { to: string; icon: typeof AppIcons.Issues; label: string }) {
    return (
        <Link to={to} className="flex h-8 items-center gap-2.5 rounded-md px-1.5 text-[13px] text-secondary hover:bg-layer-transparent-hover hover:text-primary">
            <Icon className="size-4 text-tertiary" />
            {label}
        </Link>
    );
}

/** The repository, named after its host (GitHub, GitLab…) with that host's mark, opening in a new tab. */
function RepositoryLink({ url }: { url: string }) {
    const { t } = useTranslation();
    const host = repositoryHost(url);
    const Icon = host.icon;
    return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex h-8 items-center gap-2.5 rounded-md px-1.5 text-[13px] text-secondary hover:bg-layer-transparent-hover hover:text-primary">
            <Icon className="size-4 text-tertiary" />
            <span className="min-w-0 flex-1 truncate">{host.name ?? t("projects.repositoryLink")}</span>
            <AppIcons.ExternalLink className="size-3.5 shrink-0 text-placeholder" aria-hidden="true" />
        </a>
    );
}
