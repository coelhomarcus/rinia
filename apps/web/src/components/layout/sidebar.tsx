import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Blocks, ChevronDown, ChevronLeft, Circle, House, KeyRound, Layers, Search, ShieldCheck, SlidersHorizontal, SquarePen, UserRound, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { AppIcons } from "@/components/foundations/icons";
import type { AppIcon } from "@/components/foundations/icons";
import { SidebarAccount } from "./sidebar-account";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useColumns } from "@/features/board/hooks/use-board";
import { defaultIssueColumn } from "@/features/board/column-bucket";
import { IssueQuickCreateModal } from "@/features/issues/components/issue-quick-create-modal";
import type { Favorite } from "@/features/favorites/api";
import { useFavorites, useMigrateLegacyFavorites, useRemoveFavorite } from "@/features/favorites/hooks/use-favorites";
import { useUnreadNotificationCount } from "@/features/notifications/hooks/use-notifications";
import { Collapse } from "@/components/base/collapse";
import { UNMOUNT_AFTER } from "@/components/base/motion";
import { Presence } from "@/components/base/presence";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import type { ProjectCardSummary } from "@/features/projects/api";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { groupProjectsByOwner, type ProjectGroup } from "@/features/projects/lib/project-groups";
import { useCurrentProject } from "@/features/projects/hooks/use-current-project";
import { urls } from "@/lib/urls";
import { useTranslation } from "react-i18next";

const OPEN_PROJECTS_KEY = "rinia-open-projects";
const LAST_PROJECT_KEY = "rinia-last-project";
const SECTIONS_KEY = "rinia-sidebar-sections";
const ITEM = "flex h-7 w-full min-w-0 items-center gap-2.5 rounded-md px-2 text-left text-[13px] font-medium transition-colors duration-150";
const IDLE = "text-tertiary hover:bg-layer-transparent-hover hover:text-primary";
const ACTIVE = "bg-layer-1-selected text-primary [&_svg]:text-primary";

/**
 * Only one sidebar row is active at a time. A favorite and a project row can point at the same page,
 * so the row the user actually clicked wins: favorite links tag their navigation, and the project tree
 * stays quiet while that tag is present.
 */
function useViaFavorite() {
    const location = useLocation();
    return (location.state as { via?: string } | null)?.via === "favorite";
}

function itemClass(active: boolean, extra = "") {
    return `${ITEM} ${active ? ACTIVE : IDLE} ${extra}`;
}

function readIdSet(key: string): Set<string> {
    try {
        const stored = JSON.parse(localStorage.getItem(key) ?? "null");
        if (Array.isArray(stored)) return new Set(stored.filter((id): id is string => typeof id === "string"));
    } catch {
        /* ignore invalid storage */
    }
    return new Set();
}

function persistIdSet(key: string, ids: Set<string>) {
    localStorage.setItem(key, JSON.stringify([...ids]));
}

/** The project the user was last in, used when leaving settings and as the default for new issues. */
function readOpenProjectId(): string | null {
    return localStorage.getItem(LAST_PROJECT_KEY) || ([...readIdSet(OPEN_PROJECTS_KEY)].at(-1) ?? null);
}

function toggleStoredId(key: string, setter: Dispatch<SetStateAction<Set<string>>>, id: string) {
    setter((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persistIdSet(key, next);
        return next;
    });
}

function openStoredId(key: string, setter: Dispatch<SetStateAction<Set<string>>>, id: string) {
    setter((current) => {
        if (current.has(id)) return current;
        const next = new Set(current);
        next.add(id);
        persistIdSet(key, next);
        return next;
    });
}

/** `projects` is the viewer's own group; `owners` holds the other owners' groups, by owner id, when they differ from open. */
type SidebarSections = { projects: boolean; favorites: boolean; owners: Record<string, boolean> };

function readSections(): SidebarSections {
    const sections: SidebarSections = { projects: true, favorites: true, owners: {} };
    try {
        const stored = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "null") as { projects?: boolean; teams?: boolean; favorites?: boolean; owners?: unknown } | null;
        if (stored && typeof stored === "object") {
            if (typeof stored.projects === "boolean") sections.projects = stored.projects;
            else if (typeof stored.teams === "boolean") sections.projects = stored.teams;
            if (typeof stored.favorites === "boolean") sections.favorites = stored.favorites;
            if (stored.owners && typeof stored.owners === "object") {
                for (const [key, open] of Object.entries(stored.owners)) if (typeof open === "boolean") sections.owners[key] = open;
            }
        }
    } catch {
        /* ignore invalid storage */
    }
    return sections;
}

export function Sidebar({ onSearch, onNavigate }: { onSearch: () => void; onNavigate?: () => void }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { data: projects } = useProjects();
    const { user } = useAuth();
    const currentProject = useCurrentProject();
    const routeProjectId = currentProject?.id ?? "";
    const projectId = routeProjectId || readOpenProjectId() || "";
    const { data: columns } = useColumns(routeProjectId);
    const [creatingProjectId, setCreatingProjectId] = useState<string | null>(null);
    const [openProjects, setOpenProjects] = useState(() => {
        const ids = readIdSet(OPEN_PROJECTS_KEY);
        if (routeProjectId) ids.add(routeProjectId);
        return ids;
    });
    const [sections, setSections] = useState(readSections);
    const settings = location.pathname.includes("/settings");
    useEffect(() => setCreatingProjectId(null), [routeProjectId]);
    useEffect(() => {
        if (!routeProjectId) return;
        // Visiting a project expands it without closing the others.
        openStoredId(OPEN_PROJECTS_KEY, setOpenProjects, routeProjectId);
        localStorage.setItem(LAST_PROJECT_KEY, routeProjectId);
    }, [routeProjectId]);

    useMigrateLegacyFavorites();

    function saveSections(update: (current: SidebarSections) => SidebarSections) {
        setSections((current) => {
            const next = update(current);
            localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
            return next;
        });
    }

    function toggleSection(section: "projects" | "favorites") {
        saveSections((current) => ({ ...current, [section]: !current[section] }));
    }

    const groupOpen = (group: ProjectGroup) => (group.mine ? sections.projects : sections.owners[group.key] ?? true);
    function toggleGroup(group: ProjectGroup) {
        if (group.mine) return toggleSection("projects");
        saveSections((current) => ({ ...current, owners: { ...current.owners, [group.key]: !(current.owners[group.key] ?? true) } }));
    }

    const projectGroups = groupProjectsByOwner(projects ?? [], user?.id, t);

    function go(path: string) {
        onNavigate?.();
        navigate(path);
    }

    const createTarget = routeProjectId || readOpenProjectId() || projects?.[0]?.id || "";

    return (
        <div className="flex h-full flex-col select-none">
            {settings ? (
                <SettingsNav projectId={projectId} projects={projects} />
            ) : (
                <>
                    <div className="flex h-12 shrink-0 items-center gap-1 px-3">
                        <SidebarAccount variant="header" />
                        <button type="button" aria-label={t("nav.search")} className="flex size-7 items-center justify-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary" onClick={(event) => { event.stopPropagation(); onSearch(); }}>
                            <Search className="size-4" />
                        </button>
                        <button
                            type="button"
                            aria-label={t("nav.newIssue")}
                            className="flex size-7 items-center justify-center rounded-lg bg-layer-1 text-tertiary hover:bg-layer-1-hover hover:text-primary"
                            onClick={(event) => {
                                event.stopPropagation();
                                if (createTarget) setCreatingProjectId(createTarget);
                            }}
                        >
                            <SquarePen className="size-4" />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-2">
                        <InboxLink />
                        <Link to={urls.myIssues()} className={itemClass(location.pathname.startsWith(urls.myIssues()))} aria-current={location.pathname.startsWith(urls.myIssues()) ? "page" : undefined}>
                            <AppIcons.MyIssues className="size-4 shrink-0" />
                            <span className="truncate">{t("nav.myIssues")}</span>
                        </Link>
                        <Link to="/" className={itemClass(location.pathname === "/")} aria-current={location.pathname === "/" ? "page" : undefined}>
                            <AppIcons.Projects className="size-4 shrink-0" />
                            <span className="truncate">{t("nav.allProjects")}</span>
                        </Link>
                        <FavoritesNav open={sections.favorites} onToggle={() => toggleSection("favorites")} />
                        {projectGroups.map((group) => (
                            <div key={group.key}>
                                <SectionLabel label={group.label} open={groupOpen(group)} onToggle={() => toggleGroup(group)} />
                                <Collapse open={groupOpen(group)}>
                                    {group.projects.map((project) => (
                                        <ProjectNavItem
                                            key={project.id}
                                            project={project}
                                            currentProjectId={routeProjectId}
                                            open={openProjects.has(project.id)}
                                            onToggle={() => toggleStoredId(OPEN_PROJECTS_KEY, setOpenProjects, project.id)}
                                        />
                                    ))}
                                </Collapse>
                            </div>
                        ))}
                    </div>
                </>
            )}
            {creatingProjectId && defaultIssueColumn(columns) && creatingProjectId === routeProjectId && (
                <IssueQuickCreateModal
                    projectId={creatingProjectId}
                    columnId={defaultIssueColumn(columns)!.id}
                    onClose={() => setCreatingProjectId(null)}
                    onCreated={(identifier) => {
                        setCreatingProjectId(null);
                        go(urls.issue(identifier));
                    }}
                />
            )}
            {creatingProjectId && creatingProjectId !== routeProjectId && (
                <CreateElsewhere projectId={creatingProjectId} onClose={() => setCreatingProjectId(null)} onCreated={(identifier) => go(urls.issue(identifier))} />
            )}
        </div>
    );
}

/** The inbox, with a dot while anything in it is unread. */
function InboxLink() {
    const { t } = useTranslation();
    const location = useLocation();
    const { data: unread = 0 } = useUnreadNotificationCount();
    const active = location.pathname === urls.inbox();
    return (
        <Link to={urls.inbox()} className={itemClass(active)} aria-current={active ? "page" : undefined}>
            <AppIcons.Inbox className="size-4 shrink-0" />
            <span className="truncate">{t("nav.inbox")}</span>
            <span
                role={unread > 0 ? "status" : undefined}
                aria-label={unread > 0 ? `${t("nav.unreadInbox")}: ${unread}` : undefined}
                className={`ml-auto size-1.5 shrink-0 rounded-full bg-accent-primary transition-[opacity,scale] duration-200 ease-out ${unread > 0 ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
            />
        </Link>
    );
}

function CreateElsewhere({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: (identifier: string) => void }) {
    const { data: columns } = useColumns(projectId);
    const column = defaultIssueColumn(columns);
    if (!column) return null;
    return <IssueQuickCreateModal projectId={projectId} columnId={column.id} onClose={onClose} onCreated={onCreated} />;
}

function SettingsNav({ projectId, projects }: { projectId: string; projects: ProjectCardSummary[] | undefined }) {
    const { t } = useTranslation();
    const location = useLocation();
    const { user } = useAuth();
    const [query, setQuery] = useState("");
    const matches = (label: string) => label.toLowerCase().includes(query.trim().toLowerCase());
    const link = (path: string, label: string, Icon: AppIcon, active = location.pathname === path || location.pathname.startsWith(`${path}/`)) =>
        matches(label) && (
            <Link key={path} to={path} className={itemClass(active)} aria-current={active ? "page" : undefined}>
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
            </Link>
        );
    const personal = [link("/settings/preferences", t("nav.preferences"), SlidersHorizontal), link("/settings/profile", t("nav.profile"), UserRound)].filter(Boolean);
    // Connections to other tools live apart from the person's own settings.
    const integrationLinks = [link(urls.integrations(), t("nav.allIntegrations"), Blocks), link(urls.apiTokens(), t("nav.apiTokens"), KeyRound)].filter(Boolean);
    const projectLinks = (projects ?? []).filter((project) => matches(project.name));
    const projectGroups = groupProjectsByOwner(projectLinks, user?.id, t);
    const admin = user?.isAdmin ? [link("/settings/admin", t("nav.administration"), ShieldCheck)].filter(Boolean) : [];
    const backProject = projects?.find((project) => project.id === projectId);

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4">
            <Link to={backProject ? urls.project(backProject.issueKey) : "/"} className={`${itemClass(false)} mb-3 gap-2 text-secondary`}>
                <ChevronLeft className="size-4 shrink-0" />
                {t("nav.backToApp")}
            </Link>
            <label className="mb-4 flex h-7 w-full items-center gap-2 rounded-md border border-subtle bg-layer-1 px-2 text-[13px] focus-within:border-accent-strong">
                <Search className="size-4 shrink-0 text-placeholder" />
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("nav.searchSettings")}
                    aria-label={t("nav.searchSettings")}
                    className="min-w-0 flex-1 select-text bg-transparent text-primary outline-none placeholder:text-placeholder"
                />
            </label>
            {personal.length > 0 && <SettingsNavSection label={t("nav.personal")}>{personal}</SettingsNavSection>}
            {integrationLinks.length > 0 && <SettingsNavSection label={t("nav.integrations")}>{integrationLinks}</SettingsNavSection>}
            {projectGroups.map((group) => (
                <SettingsNavSection key={group.key} label={group.label}>
                    {group.projects.map((project) => {
                        const path = urls.projectSettings(project.issueKey);
                        const active = location.pathname === path || location.pathname.startsWith(`${path}/`);
                        return (
                            <Link key={project.id} to={path} className={itemClass(active)} aria-current={active ? "page" : undefined}>
                                <ProjectIcon icon={project.iconAppearance ?? project.icon} className="size-4 shrink-0" />
                                <span className="truncate">{project.name}</span>
                            </Link>
                        );
                    })}
                </SettingsNavSection>
            ))}
            {admin.length > 0 && <SettingsNavSection label={t("nav.administration")}>{admin}</SettingsNavSection>}
            {query && personal.length + integrationLinks.length + projectLinks.length + admin.length === 0 && <p className="px-2 py-3 text-[13px] text-placeholder">{t("nav.noSettingsFound")}</p>}
        </div>
    );
}

function SettingsNavSection({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="mt-2 first-of-type:mt-0">
            <p className="flex h-7 items-center px-2 text-[13px] text-tertiary">{label}</p>
            <div className="flex flex-col gap-px">{children}</div>
        </div>
    );
}

function SectionLabel({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="group/section mt-5 mb-0.5 flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-tertiary hover:text-secondary"
        >
            {label}
            <span className="text-placeholder group-hover/section:text-tertiary"><Caret open={open} /></span>
        </button>
    );
}

/** Thin chevron after a label; points down when its group is open. */
function Caret({ open }: { open: boolean }) {
    return <ChevronDown strokeWidth={2.5} className={`size-3 shrink-0 transition-transform duration-200 ease-out ${open ? "" : "-rotate-90"}`} aria-hidden="true" />;
}

function ProjectNavItem({
    project,
    currentProjectId,
    open,
    onToggle,
}: {
    project: ProjectCardSummary;
    currentProjectId: string;
    open: boolean;
    onToggle: () => void;
}) {
    const location = useLocation();
    const { t } = useTranslation();
    const current = currentProjectId === project.id;
    const viaFavorite = useViaFavorite();
    const key = project.issueKey;
    const home = !viaFavorite && location.pathname === urls.project(key);
    const issues = !viaFavorite && current && (location.pathname.startsWith(urls.issues(key)) || location.pathname.startsWith("/issue/"));
    // Documents and Views are single links, like Linear's; a page inside either keeps its link lit.
    const documentsActive = !viaFavorite && location.pathname.startsWith(urls.documents(key));
    const viewsActive = !viaFavorite && location.pathname.startsWith(urls.views(key));

    return (
        <div className="group/project">
            <button
                type="button"
                aria-expanded={open}
                onClick={onToggle}
                className={`${ITEM} ${IDLE}`}
                data-project-context="true"
                data-project-id={project.id}
                data-project-name={project.name}
                data-project-issue-key={project.issueKey}
            >
                <ProjectIcon icon={project.iconAppearance ?? project.icon} className="size-4 shrink-0" />
                <span className="truncate">{project.name}</span>
                <span className="text-placeholder"><Caret open={open} /></span>
            </button>
            <Collapse open={open}>
                <nav aria-label={project.name} className="ml-4 flex flex-col gap-px pt-px">
                    <ChildLink to={urls.project(key)} icon={House} label={t("nav.home")} active={home} />
                    <ChildLink to={urls.issues(key)} icon={Circle} label={t("nav.issues")} active={issues} />
                    <ChildLink to={urls.documents(key)} icon={AppIcons.Documents} label={t("nav.documents")} active={documentsActive} />
                    <ChildLink to={urls.views(key)} icon={Layers} label={t("views.title")} active={viewsActive} />
                </nav>
            </Collapse>
        </div>
    );
}

function ChildLink({ to, icon: Icon, label, active }: { to: string; icon: AppIcon; label: string; active: boolean }) {
    return (
        <Link to={to} className={itemClass(active)} aria-current={active ? "page" : undefined}>
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
        </Link>
    );
}

type FavoriteRowState = { favorite: Favorite; leaving: boolean; animateIn: boolean };

/**
 * Favorites slide in when added and out when removed, and the section itself grows or shrinks as it
 * gains its first or loses its last item. The first load renders in place without animating.
 */
function FavoritesNav({ open, onToggle }: { open: boolean; onToggle: () => void }) {
    const { t } = useTranslation();
    const { data: favorites } = useFavorites();
    const [rows, setRows] = useState<FavoriteRowState[]>([]);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!favorites) return;
        setRows((current) => {
            const known = new Set(current.map((row) => row.favorite.id));
            const next: FavoriteRowState[] = favorites.map((favorite) => ({ favorite, leaving: false, animateIn: ready && !known.has(favorite.id) }));
            const present = new Set(favorites.map((favorite) => favorite.id));
            current.forEach((row, index) => {
                if (!present.has(row.favorite.id)) next.splice(Math.min(index, next.length), 0, { ...row, leaving: true, animateIn: false });
            });
            return next;
        });
        if (!ready) requestAnimationFrame(() => setReady(true));
    }, [favorites, ready]);

    const leaving = rows.some((row) => row.leaving);
    useEffect(() => {
        if (!leaving) return;
        const timer = window.setTimeout(() => setRows((current) => current.filter((row) => !row.leaving)), UNMOUNT_AFTER);
        return () => window.clearTimeout(timer);
    }, [leaving]);

    return (
        <Collapse open={rows.some((row) => !row.leaving)} lazy={false} animate={ready}>
            <SectionLabel label={t("nav.favorites")} open={open} onToggle={onToggle} />
            <Collapse open={open} lazy={false}>
                <div className="flex flex-col">
                    {rows.map((row) => (
                        <FavoriteRow key={row.favorite.id} favorite={row.favorite} leaving={row.leaving} animateIn={row.animateIn} />
                    ))}
                </div>
            </Collapse>
        </Collapse>
    );
}

function FavoriteRow({ favorite, leaving, animateIn }: { favorite: Favorite; leaving: boolean; animateIn: boolean }) {
    const { t } = useTranslation();
    const location = useLocation();
    const remove = useRemoveFavorite();
    const { to, icon, label, context } = describeFavorite(favorite, t("nav.issues"));
    const active = useViaFavorite() && location.pathname === to;

    return (
        <Presence leaving={leaving} entering={animateIn}>
            <div className="group/favorite relative pb-px">
                <Link to={to} state={{ via: "favorite" }} className={itemClass(active, "pr-7")} aria-current={active ? "page" : undefined}>
                    {icon}
                    <span className="truncate">{label}</span>
                    {context && <span className="min-w-0 shrink-[2] truncate font-normal text-placeholder">{context}</span>}
                </Link>
                <button
                    type="button"
                    aria-label={`${t("nav.removeFavorite")}: ${label}`}
                    title={t("nav.removeFavorite")}
                    disabled={remove.isPending || leaving}
                    onClick={() => remove.mutate(favorite.id)}
                    className="absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded text-tertiary opacity-0 transition-opacity duration-150 group-hover/favorite:opacity-100 hover:bg-layer-transparent-hover hover:text-primary focus-visible:opacity-100"
                >
                    <X className="size-3.5" />
                </button>
            </div>
        </Presence>
    );
}

/** Link, icon, and labels for a favorite. The muted context names the project, or the issue's identifier. */
function describeFavorite(favorite: Favorite, issuesLabel: string): { to: string; icon: ReactNode; label: string; context?: string } {
    const key = favorite.project.issueKey;
    const projectIcon = <ProjectIcon icon={favorite.project.iconAppearance ?? favorite.project.icon} className="size-4 shrink-0" />;
    if (favorite.kind === "document" && favorite.document) {
        return {
            to: urls.document(key, favorite.document),
            icon: favorite.document.iconAppearance ? <ProjectIcon icon={favorite.document.iconAppearance} className="size-4 shrink-0" /> : <AppIcons.Documents className="size-4 shrink-0" />,
            label: favorite.document.title,
            context: favorite.project.name,
        };
    }
    if (favorite.kind === "issue" && favorite.issue) {
        return { to: urls.issue(favorite.issue.identifier, favorite.issue.title), icon: <Circle className="size-4 shrink-0" />, label: favorite.issue.title, context: favorite.issue.identifier };
    }
    if (favorite.kind === "view" && favorite.view) return { to: urls.view(key, favorite.view), icon: <Layers className="size-4 shrink-0" />, label: favorite.view.name, context: favorite.project.name };
    if (favorite.kind === "issues") return { to: urls.issues(key), icon: <AppIcons.Issues className="size-4 shrink-0" />, label: issuesLabel, context: favorite.project.name };
    return { to: urls.project(key), icon: projectIcon, label: favorite.project.name };
}
