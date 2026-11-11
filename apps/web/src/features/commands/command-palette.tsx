import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleDashed, FileText, Hash, Keyboard, Link2, Moon, SignalHigh, SquarePen, Sun, Tag, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Input } from "@/components/base/input/input";
import { LoadingState } from "@/components/feedback/loading-state";
import { useToast } from "@/components/feedback/toaster";
import { AppIcons } from "@/components/foundations/icons";
import { useDocuments } from "@/features/documents/hooks/use-documents";
import { useIssues } from "@/features/issues/hooks/use-issues";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { useCurrentProject } from "@/features/projects/hooks/use-current-project";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useClipboard } from "@/hooks/use-clipboard";
import { urls } from "@/lib/urls";
import { issueNavigation } from "@/lib/view-transition";
import { useTheme } from "@/providers/theme-provider";
import { cx } from "@/utils/cx";
import { requestIssueMenu, type IssueMenuRequest } from "./issue-menu-requests";
import { matchesQuery } from "./match";
import { ShortcutKeys } from "./shortcut-keys";
import { shortcutKeys, type ShortcutSequence } from "./shortcuts";

type GroupId = "issue" | "actions" | "navigation" | "projects" | "issues" | "documents";

interface PaletteItem {
    id: string;
    group: GroupId;
    title: string;
    description?: string | null;
    /** Shown in monospace beside the title, such as an issue identifier or a project key. */
    tag?: string;
    /** Extra words the item is found by, besides its title, description and tag. */
    keywords?: string;
    icon: ReactNode;
    shortcut?: ShortcutSequence;
    run: () => void;
}

const GROUP_ORDER: GroupId[] = ["issue", "actions", "navigation", "projects", "issues", "documents"];
/** With no query the long lists are cut short, so the commands stay in reach. */
const IDLE_LIMITS: Partial<Record<GroupId, number>> = { issues: 6, documents: 4 };
const QUERY_LIMITS: Partial<Record<GroupId, number>> = { issues: 30, documents: 15 };

const icon = "size-4 shrink-0 text-placeholder";

interface CommandPaletteProps {
    onClose: () => void;
    onCreateIssue: () => void;
    onShowShortcuts: () => void;
}

/**
 * ⌘K: finds projects, issues and documents, and runs commands. What it offers depends on where it opens:
 * on an issue, that issue's commands come first.
 */
export function CommandPalette({ onClose, onCreateIssue, onShowShortcuts }: CommandPaletteProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { resolved: resolvedTheme, setPreference } = useTheme();
    const { copy } = useClipboard();
    const showToast = useToast();
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { data: projects } = useProjects();
    const activeProject = useCurrentProject();
    const { data: issues } = useIssues(activeProject?.id ?? "");
    const { data: documents } = useDocuments(activeProject?.id ?? "");

    const routeIssue = pathname.match(/^\/issue\/([^/]+)/)?.[1];
    const issueIdentifier = routeIssue ? decodeURIComponent(routeIssue).toUpperCase() : null;
    const currentIssue = issueIdentifier ? issues?.find((issue) => issue.identifier.toUpperCase() === issueIdentifier) : undefined;

    const items = useMemo(() => {
        const close = (action: () => void) => () => {
            onClose();
            action();
        };
        const copyText = (text: string, success: string) =>
            close(() => {
                void copy(text).then((result) => showToast(result.success ? { tone: "copy", title: success } : { tone: "error", title: t("issue.couldNotCopy") }));
            });
        // The menu opens once the palette has gone and handed focus back to the page.
        const openMenu = (menu: IssueMenuRequest) => close(() => window.setTimeout(() => requestIssueMenu(menu), 0));
        const list: PaletteItem[] = [];

        if (issueIdentifier) {
            const identifier = currentIssue?.identifier ?? issueIdentifier;
            list.push(
                { id: "state", group: "issue", title: t("commands.changeState"), keywords: "status", icon: <CircleDashed className={icon} />, shortcut: shortcutKeys("state"), run: openMenu("state") },
                { id: "priority", group: "issue", title: t("commands.changePriority"), icon: <SignalHigh className={icon} />, shortcut: shortcutKeys("priority"), run: openMenu("priority") },
                { id: "assignee", group: "issue", title: t("commands.changeAssignee"), icon: <UserRound className={icon} />, shortcut: shortcutKeys("assignee"), run: openMenu("assignee") },
                { id: "labels", group: "issue", title: t("commands.changeLabels"), keywords: "label tag", icon: <Tag className={icon} />, shortcut: shortcutKeys("labels"), run: openMenu("label") },
                { id: "copy-link", group: "issue", title: t("commands.copyIssueLink"), keywords: "url", icon: <Link2 className={icon} />, run: copyText(`${window.location.origin}${urls.issue(identifier, currentIssue?.title)}`, t("issue.linkCopied")) },
                { id: "copy-id", group: "issue", title: t("commands.copyIssueId"), tag: identifier, icon: <Hash className={icon} />, run: copyText(identifier, t("issue.idCopied", { id: identifier })) },
            );
        }

        if (projects?.length) {
            list.push({
                id: "create",
                group: "actions",
                title: activeProject ? t("commands.createIssueIn", { project: activeProject.name }) : t("commands.createIssue"),
                keywords: t("nav.newIssue"),
                icon: <SquarePen className={icon} />,
                shortcut: shortcutKeys("create"),
                run: close(onCreateIssue),
            });
        }
        const toLight = resolvedTheme === "dark";
        list.push(
            { id: "theme", group: "actions", title: toLight ? t("commands.themeLight") : t("commands.themeDark"), keywords: "theme tema", icon: toLight ? <Sun className={icon} /> : <Moon className={icon} />, run: close(() => setPreference(toLight ? "light" : "dark")) },
            { id: "shortcuts", group: "actions", title: t("commands.showShortcuts"), keywords: "keyboard teclado help ajuda", icon: <Keyboard className={icon} />, shortcut: shortcutKeys("help"), run: close(onShowShortcuts) },
        );

        const go = (path: string, title?: string) => close(() => void navigate(path, issueNavigation(title)));
        list.push(
            { id: "inbox", group: "navigation", title: t("commands.goInbox"), icon: <AppIcons.Inbox className={icon} />, shortcut: shortcutKeys("inbox"), run: go(urls.inbox()) },
            { id: "my-issues", group: "navigation", title: t("commands.goMyIssues"), icon: <AppIcons.MyIssues className={icon} />, shortcut: shortcutKeys("my-issues"), run: go(urls.myIssues()) },
            { id: "settings", group: "navigation", title: t("commands.goSettings"), icon: <AppIcons.Settings className={icon} />, shortcut: shortcutKeys("settings"), run: go("/settings/profile") },
        );
        if (activeProject) {
            const key = activeProject.issueKey;
            list.push(
                { id: "project", group: "navigation", title: t("commands.goProject"), tag: key, icon: <AppIcons.Overview className={icon} />, run: go(urls.project(key)) },
                { id: "project-issues", group: "navigation", title: t("search.openIssues"), description: t("search.browseIssues"), tag: key, icon: <AppIcons.Issues className={icon} />, run: go(urls.issues(key)) },
                { id: "project-board", group: "navigation", title: t("search.openBoard"), description: t("search.moveIssues"), tag: key, keywords: "kanban board quadro", icon: <AppIcons.Board className={icon} />, run: go(`${urls.issues(key)}?view=board`) },
                { id: "project-docs", group: "navigation", title: t("search.openDocuments"), tag: key, icon: <AppIcons.Documents className={icon} />, run: go(urls.documents(key)) },
            );
        }

        for (const project of projects ?? []) {
            list.push({ id: `project-${project.id}`, group: "projects", title: project.name, description: project.description, tag: project.issueKey, icon: <ProjectIcon icon={project.iconAppearance ?? project.icon} className={icon} />, run: go(urls.project(project.issueKey)) });
        }
        for (const issue of issues ?? []) {
            if (issue.identifier === currentIssue?.identifier) continue;
            list.push({ id: `issue-${issue.id}`, group: "issues", title: issue.title, tag: issue.identifier, icon: <span className="flex size-4 shrink-0 items-center justify-center rounded border border-subtle text-[9px] text-placeholder">#</span>, run: go(urls.issue(issue.identifier, issue.title), issue.title) });
        }
        if (activeProject) {
            for (const document of documents ?? []) {
                list.push({ id: `document-${document.id}`, group: "documents", title: document.title, icon: document.iconAppearance ? <ProjectIcon icon={document.iconAppearance} className={icon} /> : <FileText className={icon} />, run: go(urls.document(activeProject.issueKey, document)) });
            }
        }
        return list;
    }, [activeProject, copy, currentIssue, documents, issueIdentifier, issues, navigate, onClose, onCreateIssue, onShowShortcuts, projects, resolvedTheme, setPreference, showToast, t]);

    const groups = useMemo(() => {
        const limits = query.trim() ? QUERY_LIMITS : IDLE_LIMITS;
        const matching = items.filter((item) => !query.trim() || matchesQuery(`${item.title} ${item.tag ?? ""} ${item.description ?? ""} ${item.keywords ?? ""}`, query));
        return GROUP_ORDER.map((group) => ({ id: group, items: matching.filter((item) => item.group === group).slice(0, limits[group] ?? Infinity) })).filter((group) => group.items.length > 0);
    }, [items, query]);
    const visible = useMemo(() => groups.flatMap((group) => group.items), [groups]);

    useEffect(() => setSelectedIndex(0), [query]);
    useEffect(() => setSelectedIndex((index) => Math.min(index, Math.max(visible.length - 1, 0))), [visible.length]);
    useEffect(() => {
        const item = visible[selectedIndex];
        if (item) document.getElementById(itemDomId(item))?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex, visible]);

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        const move = event.key === "ArrowDown" || (event.ctrlKey && event.key === "n") ? 1 : event.key === "ArrowUp" || (event.ctrlKey && event.key === "p") ? -1 : 0;
        if (move) {
            event.preventDefault();
            event.stopPropagation();
            if (visible.length) setSelectedIndex((index) => (index + move + visible.length) % visible.length);
            return;
        }
        if (event.key === "Enter") {
            // The dialog closes synchronously when an item runs. Consume Enter first so it cannot become a
            // synthetic click on the element that receives the restored focus.
            event.preventDefault();
            event.stopPropagation();
            visible[selectedIndex]?.run();
        }
    }

    const groupLabels: Record<GroupId, string> = {
        issue: t("commands.groupIssue", { id: currentIssue?.identifier ?? issueIdentifier ?? "" }),
        actions: t("commands.groupActions"),
        navigation: t("commands.groupNavigation"),
        projects: t("commands.groupProjects"),
        issues: activeProject ? `${t("commands.groupIssues")} · ${activeProject.name}` : t("commands.groupIssues"),
        documents: activeProject ? `${t("commands.groupDocuments")} · ${activeProject.name}` : t("commands.groupDocuments"),
    };
    let offset = 0;

    return (
        <ModalOverlay isOpen onOpenChange={(open) => !open && onClose()} isDismissable className="sm:items-start sm:pt-[12vh] sm:pb-8 max-md:items-stretch max-md:p-0">
            {/* On a phone search takes the whole screen, with Cancel beside the field, as a native search does. */}
            <Modal className="max-w-xl max-md:h-dvh max-md:max-w-none max-md:max-h-none max-md:rounded-none">
                <Dialog>
                    <div className="flex max-h-[70vh] w-full flex-col overflow-hidden rounded-xl bg-menu shadow-overlay-100 ring-1 ring-subtle max-md:h-dvh max-md:max-h-none max-md:rounded-none max-md:pt-safe max-md:pb-safe max-md:ring-0">
                        <div className="flex items-center gap-2 border-b border-subtle p-2">
                            <div className="min-w-0 flex-1">
                            <Input
                                autoFocus
                                aria-label={t("commands.label")}
                                inputProps={{
                                    "aria-controls": "rinia-command-results",
                                    "aria-activedescendant": visible[selectedIndex] ? itemDomId(visible[selectedIndex]) : undefined,
                                    "aria-expanded": "true",
                                    role: "combobox",
                                }}
                                placeholder={issueIdentifier ? t("commands.issuePlaceholder") : t("commands.placeholder")}
                                icon={AppIcons.Search}
                                value={query}
                                onChange={setQuery}
                                onKeyDown={handleKeyDown}
                            />
                            </div>
                            <button type="button" onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-[15px] text-accent-primary md:hidden">
                                {t("common.cancel")}
                            </button>
                        </div>

                        <div id="rinia-command-results" role="listbox" aria-label={t("commands.results")} className="flex flex-col overflow-y-auto p-1.5">
                            {!projects ? (
                                <LoadingState label={t("search.searching")} className="px-3 py-4" />
                            ) : visible.length === 0 ? (
                                <p className="p-4 text-center text-sm text-tertiary">{t("commands.noResults")}</p>
                            ) : (
                                groups.map((group, groupIndex) => {
                                    const start = offset;
                                    offset += group.items.length;
                                    return (
                                        <section key={group.id} aria-label={groupLabels[group.id]} className={groupIndex > 0 ? "mt-2" : undefined}>
                                            <p className="truncate px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-tertiary">{groupLabels[group.id]}</p>
                                            {group.items.map((item, index) => (
                                                <PaletteRow key={item.id} item={item} selected={selectedIndex === start + index} onHover={() => setSelectedIndex(start + index)} />
                                            ))}
                                        </section>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

function PaletteRow({ item, selected, onHover }: { item: PaletteItem; selected: boolean; onHover: () => void }) {
    return (
        <button
            type="button"
            id={itemDomId(item)}
            role="option"
            aria-selected={selected}
            tabIndex={-1}
            onClick={item.run}
            onMouseMove={selected ? undefined : onHover}
            className={cx("flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none", selected && "bg-layer-1-hover")}
        >
            {item.icon}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-[13px] font-medium text-primary">{item.title}</span>
                    {item.tag && <span className="shrink-0 font-mono text-[11px] text-tertiary">{item.tag}</span>}
                </span>
                {item.description && <span className="line-clamp-1 text-xs text-tertiary">{item.description}</span>}
            </span>
            {item.shortcut ? <ShortcutKeys keys={item.shortcut} className="max-md:hidden" /> : selected && <span className="font-mono text-[11px] text-tertiary max-md:hidden">↵</span>}
        </button>
    );
}

function itemDomId(item: PaletteItem) {
    return `rinia-command-${item.id}`;
}
