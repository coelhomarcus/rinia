import { richTextAllowsImages, type RichTextProfile } from "@rinia/shared/src/rich-text-schema";
import { Extension, type Editor } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { type FileUploadTarget, uploadProjectFile } from "./file-api";

function filesFrom(data: DataTransfer | null) {
    if (!data) return [];
    const listed = [...data.files];
    if (listed.length > 0) return listed;
    const fromItems: File[] = [];
    for (const item of data.items ?? []) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) fromItems.push(file);
    }
    return fromItems;
}

async function insertUploaded(editor: Editor, files: File[], target: FileUploadTarget, profile: RichTextProfile, hooks: { onStart: () => void; onDone: () => void; onError: (message: string) => void }) {
    hooks.onStart();
    let position = editor.state.selection.from;
    try {
        for (const file of files) {
            const stored = await uploadProjectFile(target.projectId, file, target.issueId);
            if (editor.isDestroyed) return;
            const asImage = file.type.startsWith("image/") && richTextAllowsImages(profile);
            if (asImage) {
                editor.chain().insertContentAt(position, { type: "image", attrs: { src: stored.url, alt: stored.filename } }).run();
                position += 1;
            } else {
                editor.chain().insertContentAt(position, { type: "text", text: stored.filename, marks: [{ type: "link", attrs: { href: stored.url } }] }).run();
                position += stored.filename.length;
            }
        }
        target.onUploaded?.();
    } catch (reason) {
        hooks.onError(reason instanceof Error ? reason.message : "Upload failed");
    } finally {
        hooks.onDone();
    }
}

/**
 * Paste and drop upload the file instead of embedding it. Descriptions and pages insert an image;
 * a comment, which has no image node, inserts a link.
 */
export const FileDrop = Extension.create<{
    target: () => FileUploadTarget | null;
    profile: () => RichTextProfile;
    onStart: () => void;
    onDone: () => void;
    onError: (message: string) => void;
}>({
    name: "fileDrop",
    addOptions() {
        return { target: () => null, profile: () => "description" as RichTextProfile, onStart: () => undefined, onDone: () => undefined, onError: () => undefined };
    },
    addProseMirrorPlugins() {
        const options = this.options;
        const editor = this.editor;
        const take = (data: DataTransfer | null) => {
            if (!editor.isEditable) return false;
            const target = options.target();
            const files = filesFrom(data);
            if (!target || files.length === 0) return false;
            const images = files.filter((file) => file.type.startsWith("image/"));
            void insertUploaded(editor, images.length > 0 ? images : files, target, options.profile(), options);
            return true;
        };
        return [new Plugin({ props: { handlePaste: (_view, event) => take(event.clipboardData), handleDrop: (_view, event) => { const taken = take(event.dataTransfer); if (taken) event.preventDefault(); return taken; } } })];
    },
});

export function uploadTargetOf(editor: Editor): FileUploadTarget | null {
    const extension = editor.extensionManager.extensions.find((item) => item.name === "fileDrop");
    const target = (extension?.options as { target?: () => FileUploadTarget | null } | undefined)?.target;
    return target?.() ?? null;
}
