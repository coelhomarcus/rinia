import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate, useSearchParams } from "react-router";
import { defaultIssueColumn } from "@/features/board/column-bucket";
import { useColumns } from "@/features/board/hooks/use-board";
import { IssueQuickCreateModal } from "@/features/issues/components/issue-quick-create-modal";
import { useCurrentProject } from "@/features/projects/hooks/use-current-project";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { readOpenProjectId } from "@/features/projects/lib/last-project";
import { urls } from "@/lib/urls";
import { CommandPalette } from "./command-palette";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { isTypingTarget } from "./shortcuts";

interface AppCommands {
    openPalette: () => void;
    openShortcuts: () => void;
    /** Opens the new-issue modal in this project, or in the current one, the last one visited, or the first. */
    createIssue: (projectId?: string) => void;
}

const AppCommandsContext = createContext<AppCommands>({ openPalette: () => undefined, openShortcuts: () => undefined, createIssue: () => undefined });

/** The commands every screen can run: the ⌘K palette, the `?` panel and creating an issue. */
export const useAppCommands = () => useContext(AppCommandsContext);

/** Global shortcuts quiet while typing, or while a dialog or menu owns the keyboard. */
const globalHotkey = { enableOnFormTags: false, enableOnContentEditable: false, useKey: true, preventDefault: true, ignoreEventWhen: (event: KeyboardEvent) => isTypingTarget(event.target) } as const;

/**
 * Owns the command palette, the shortcuts panel and the new-issue modal, and the global shortcuts that open them:
 * ⌘K/Ctrl+K, `?`, `C`, and the `G` sequences. Page shortcuts (J/K, X, S/P/A/L) live with their pages.
 */
export function AppCommandsProvider({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const currentProject = useCurrentProject();
    const { data: projects } = useProjects();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [creatingProjectId, setCreatingProjectId] = useState<string | null>(null);

    const createIssue = useCallback(
        (projectId?: string) => {
            // The remembered project may since have been deleted or left; only a project still listed counts.
            const candidates = [projectId, currentProject?.id, readOpenProjectId()].filter((id): id is string => !!id);
            const target = projects ? candidates.find((id) => projects.some((project) => project.id === id)) ?? projects[0]?.id : candidates[0];
            if (target) setCreatingProjectId(target);
        },
        [currentProject?.id, projects],
    );

    const commands = useMemo<AppCommands>(
        () => ({ openPalette: () => setPaletteOpen(true), openShortcuts: () => setShortcutsOpen(true), createIssue }),
        [createIssue],
    );

    // ⌘K works everywhere, even while typing, and toggles the palette.
    useHotkeys(
        "mod+k",
        (event) => {
            event.preventDefault();
            event.stopPropagation();
            setPaletteOpen((open) => !open);
        },
        { enableOnFormTags: true, enableOnContentEditable: true, eventListenerOptions: { capture: true } },
    );
    useHotkeys("c", () => createIssue(), globalHotkey, [createIssue]);
    useHotkeys("g>i", () => navigate(urls.inbox()), globalHotkey);
    useHotkeys("g>m", () => navigate(urls.myIssues()), globalHotkey);
    useHotkeys("g>s", () => navigate("/settings/profile"), globalHotkey);

    // `?new=issue` (the installed app's "New issue" shortcut) opens the new-issue modal once the projects are known.
    const [searchParams, setSearchParams] = useSearchParams();
    const wantsNewIssue = searchParams.get("new") === "issue";
    useEffect(() => {
        if (!wantsNewIssue || !projects) return;
        createIssue();
        setSearchParams(
            (current) => {
                current.delete("new");
                return current;
            },
            { replace: true },
        );
    }, [createIssue, projects, setSearchParams, wantsNewIssue]);

    // `?` is read from the character typed, so it works on every keyboard layout.
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || isTypingTarget(event.target)) return;
            event.preventDefault();
            setShortcutsOpen(true);
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    return (
        <AppCommandsContext.Provider value={commands}>
            {children}
            {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onCreateIssue={() => createIssue()} onShowShortcuts={() => setShortcutsOpen(true)} />}
            <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
            {creatingProjectId && <CreateIssue projectId={creatingProjectId} onClose={() => setCreatingProjectId(null)} onCreated={(identifier) => navigate(urls.issue(identifier))} />}
        </AppCommandsContext.Provider>
    );
}

function CreateIssue({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: (identifier: string) => void }) {
    const { data: columns } = useColumns(projectId);
    const column = defaultIssueColumn(columns);
    if (!column) return null;
    return <IssueQuickCreateModal projectId={projectId} columnId={column.id} onClose={onClose} onCreated={onCreated} />;
}
