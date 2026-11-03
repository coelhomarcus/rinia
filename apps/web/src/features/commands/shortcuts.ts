import type { ParseKeys } from "i18next";

/**
 * A shortcut is one or more alternatives, each a sequence of steps pressed one after the other (`["g", "i"]`).
 * A step joins modifiers and a key with `+`, as react-hotkeys-hook does: `mod+k`, `shift+d`.
 */
export type ShortcutSequence = string[];

export interface ShortcutDefinition {
    id: string;
    label: ParseKeys;
    keys: ShortcutSequence[];
}

export interface ShortcutSection {
    id: string;
    label: ParseKeys;
    shortcuts: ShortcutDefinition[];
}

/** Every shortcut the app answers to, in the order the `?` panel lists them. */
export const SHORTCUT_SECTIONS: ShortcutSection[] = [
    {
        id: "general",
        label: "commands.sectionGeneral",
        shortcuts: [
            { id: "palette", label: "commands.openPalette", keys: [["mod+k"]] },
            { id: "create", label: "commands.newIssue", keys: [["c"]] },
            { id: "help", label: "commands.openShortcuts", keys: [["?"]] },
        ],
    },
    {
        id: "navigation",
        label: "commands.sectionNavigation",
        shortcuts: [
            { id: "inbox", label: "commands.goInbox", keys: [["g", "i"]] },
            { id: "my-issues", label: "commands.goMyIssues", keys: [["g", "m"]] },
            { id: "settings", label: "commands.goSettings", keys: [["g", "s"]] },
        ],
    },
    {
        id: "list",
        label: "commands.sectionList",
        shortcuts: [
            { id: "down", label: "commands.moveDown", keys: [["j"], ["arrowdown"]] },
            { id: "up", label: "commands.moveUp", keys: [["k"], ["arrowup"]] },
            { id: "open", label: "commands.openSelected", keys: [["enter"]] },
            { id: "select", label: "commands.toggleSelected", keys: [["x"]] },
            { id: "range", label: "commands.selectRange", keys: [["shift+x"]] },
            { id: "all", label: "commands.selectAll", keys: [["mod+a"]] },
            { id: "clear", label: "commands.clearSelection", keys: [["escape"]] },
        ],
    },
    {
        id: "issue",
        label: "commands.sectionIssue",
        shortcuts: [
            { id: "state", label: "commands.setState", keys: [["s"]] },
            { id: "priority", label: "commands.setPriority", keys: [["p"]] },
            { id: "assignee", label: "commands.setAssignee", keys: [["a"]] },
            { id: "estimate", label: "commands.setEstimate", keys: [["e"]] },
            { id: "labels", label: "commands.setLabels", keys: [["l"]] },
            { id: "due", label: "commands.setDueDate", keys: [["shift+d"]] },
            { id: "save", label: "commands.saveDescription", keys: [["mod+s"]] },
        ],
    },
];

const byId = new Map(SHORTCUT_SECTIONS.flatMap((section) => section.shortcuts.map((shortcut) => [shortcut.id, shortcut] as const)));

/** The first key sequence of a shortcut, for showing beside a command. */
export function shortcutKeys(id: string): ShortcutSequence | undefined {
    return byId.get(id)?.keys[0];
}

export function isApplePlatform() {
    if (typeof navigator === "undefined") return false;
    const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
    return /mac|iphone|ipad|ipod/i.test(platform);
}

const KEY_LABELS: Record<string, string> = { enter: "↵", escape: "Esc", arrowdown: "↓", arrowup: "↑", arrowleft: "←", arrowright: "→", space: "Space" };

/** The keycaps for one step: `mod+k` is ⌘ K on Apple devices and Ctrl K elsewhere. */
export function formatStep(step: string, apple = isApplePlatform()): string[] {
    return step.split("+").map((part) => {
        if (part === "mod") return apple ? "⌘" : "Ctrl";
        if (part === "shift") return apple ? "⇧" : "Shift";
        if (part === "alt") return apple ? "⌥" : "Alt";
        return KEY_LABELS[part] ?? part.toUpperCase();
    });
}

/**
 * True while the user is typing (a field, the editor) or working inside an overlay that owns the keyboard
 * (a dialog, a menu, a list box). Global shortcuts stay quiet then.
 */
export function isTypingTarget(target: EventTarget | null) {
    const element = target instanceof Element ? target : null;
    if (!element) return false;
    if (element.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']")) return true;
    return !!element.closest("[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']");
}

/** How far a list moves for this key: J or ↓ is one down, K or ↑ one up, anything else 0. */
export function listStep(event: KeyboardEvent): 1 | -1 | 0 {
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return 0;
    if (event.key === "ArrowDown" || (!event.shiftKey && event.key.toLowerCase() === "j")) return 1;
    if (event.key === "ArrowUp" || (!event.shiftKey && event.key.toLowerCase() === "k")) return -1;
    return 0;
}
