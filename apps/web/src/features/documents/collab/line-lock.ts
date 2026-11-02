import { type EditorState, Plugin, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension } from "@tiptap/react";
import { relativePositionToAbsolutePosition, ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import type { DocumentProvider } from "./document-provider";

/** The awareness field that says this tab is typing right now. Cursors alone do not mean someone is writing. */
const TYPING_FIELD = "typing";
/** A tab stops counting as typing this long after its last edit, which also frees its line for others. */
const TYPING_IDLE_MS = 3_000;

interface LockedLine {
    /** The line's boundaries in the current document, so a change strictly between them is a change to the line. */
    from: number;
    to: number;
    user: { id: string; name: string };
}

/** The lines other people are typing in: the textblock their cursor is in, while their tab says it is typing. */
function lockedLines(state: EditorState, provider: DocumentProvider): LockedLine[] {
    const sync = ySyncPluginKey.getState(state);
    if (!sync?.binding || sync.binding.mapping.size === 0) return [];
    const lines: LockedLine[] = [];
    provider.awareness.getStates().forEach((aware: Record<string, any>, clientId) => {
        if (clientId === provider.awareness.clientID || aware?.[TYPING_FIELD] !== true || !aware.cursor?.head) return;
        const head = relativePositionToAbsolutePosition(sync.doc, sync.type, Y.createRelativePositionFromJSON(aware.cursor.head), sync.binding!.mapping);
        if (head === null) return;
        const $head = state.doc.resolve(Math.min(head, state.doc.content.size));
        if ($head.depth === 0 || !$head.parent.isTextblock) return;
        lines.push({ from: $head.before(), to: $head.after(), user: { id: String(aware.user?.id ?? clientId), name: String(aware.user?.name ?? "") } });
    });
    return lines;
}

/** The stretches of the current document a local transaction changes, in the document's own positions. */
export function changedRanges(tr: Transaction): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    tr.steps.forEach((step, index) => {
        const back = tr.mapping.slice(0, index).invert();
        const { from, to, pos } = step as unknown as { from?: number; to?: number; pos?: number };
        if (typeof from === "number" && typeof to === "number") ranges.push([back.map(from, -1), back.map(to, 1)]);
        else if (typeof pos === "number") ranges.push([back.map(pos, -1), back.map(pos + 1, 1)]);
        else step.getMap().forEach((start, end) => ranges.push([back.map(start, -1), back.map(end, 1)]));
    });
    return ranges;
}

/** Whether any changed stretch falls inside the line; the line's own boundaries do not count. */
export const touchesLine = (ranges: Array<[number, number]>, line: { from: number; to: number }) => ranges.some(([from, to]) => from < line.to && to > line.from);

/**
 * Keeps two people from typing in the same line. A tab that is typing says so through awareness; while it does, its
 * line is locked for everyone else: their edits to it are dropped and the line is marked with the writer's colour.
 * The lock lifts a few seconds after the writer stops, or when they leave. It is enforced in each tab, so it keeps
 * people from colliding, but it is not a permission.
 */
export function documentLineLock(provider: DocumentProvider, colorOf: (userId: string) => string) {
    return Extension.create({
        name: "documentLineLock",
        addProseMirrorPlugins() {
            return [
                new Plugin({
                    filterTransaction: (tr, state) => {
                        // What came from other people, or from undo and redo, is already in the shared document.
                        if (!tr.docChanged || tr.getMeta(ySyncPluginKey)?.isChangeOrigin) return true;
                        const lines = lockedLines(state, provider);
                        if (!lines.length) return true;
                        const ranges = changedRanges(tr);
                        return !lines.some((line) => touchesLine(ranges, line));
                    },
                    props: {
                        decorations: (state) => {
                            const lines = lockedLines(state, provider);
                            if (!lines.length) return DecorationSet.empty;
                            return DecorationSet.create(
                                state.doc,
                                lines.map((line) => Decoration.node(line.from, line.to, { class: "document-line-locked", style: `--lock-color: ${colorOf(line.user.id)}` })),
                            );
                        },
                    },
                    view: () => {
                        let timer: ReturnType<typeof setTimeout> | undefined;
                        const stop = () => {
                            clearTimeout(timer);
                            timer = undefined;
                            if (provider.awareness.getLocalState()?.[TYPING_FIELD]) provider.awareness.setLocalStateField(TYPING_FIELD, false);
                        };
                        return {
                            update: (view, previous) => {
                                if (view.state.doc === previous.doc || ySyncPluginKey.getState(view.state)?.isChangeOrigin) return;
                                if (!provider.awareness.getLocalState()?.[TYPING_FIELD]) provider.awareness.setLocalStateField(TYPING_FIELD, true);
                                clearTimeout(timer);
                                timer = setTimeout(stop, TYPING_IDLE_MS);
                            },
                            destroy: stop,
                        };
                    },
                }),
            ];
        },
    });
}
