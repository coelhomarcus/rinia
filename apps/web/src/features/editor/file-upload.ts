import { REALTIME_CLIENT_HEADER, UPLOAD_CHUNK_BYTES } from "@rinia/shared";
import { richTextAllowsImages, type RichTextProfile } from "@rinia/shared/src/rich-text-schema";
import { Extension, type Editor } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { ApiError, apiClient } from "@/lib/api-client";
import { TAB_ID } from "@/lib/tab-id";

export interface StoredFile {
    id: string;
    filename: string;
    contentType: string;
    byteSize: number;
    url: string;
}

export interface FileUploadTarget {
    projectId: string;
    issueId?: string;
    onUploaded?: () => void;
}

export const issueFilesKey = (projectId: string, issueId: string) => ["projects", projectId, "files", issueId] as const;

function uploadedFile(data: { file?: StoredFile; error?: string; fields?: ApiError["fields"]; code?: string; params?: ApiError["params"]; fieldCodes?: ApiError["fieldCodes"] }, response: Response) {
    if (!response.ok) throw new ApiError(response.status, data?.error ?? "Unexpected error", data?.fields, data?.code, data?.params, data?.fieldCodes);
    return data.file as StoredFile;
}

/** A file larger than one chunk is several requests, so none of them crosses Cloudflare's upload limit. */
export async function uploadProjectFile(projectId: string, file: File, issueId?: string): Promise<StoredFile> {
    if (file.size > UPLOAD_CHUNK_BYTES) return uploadInChunks(projectId, file, issueId);
    const body = new FormData();
    body.append("file", file);
    if (issueId) body.append("issueId", issueId);
    const response = await fetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        credentials: "include",
        headers: { [REALTIME_CLIENT_HEADER]: TAB_ID },
        body,
    });
    return uploadedFile(await response.json().catch(() => ({})), response);
}

async function uploadInChunks(projectId: string, file: File, issueId?: string) {
    const started = await apiClient.post<{ uploadId: string; chunkSize: number }>(`/projects/${projectId}/files/uploads`, {
        filename: file.name || "file",
        contentType: file.type || "application/octet-stream",
        byteSize: file.size,
        issueId: issueId ?? null,
    });
    const size = started.chunkSize || UPLOAD_CHUNK_BYTES;
    for (let start = 0; start < file.size; start += size) {
        const end = Math.min(start + size, file.size) - 1;
        const response = await fetch(`/api/projects/${projectId}/files/uploads/${started.uploadId}`, {
            method: "PUT",
            credentials: "include",
            headers: { [REALTIME_CLIENT_HEADER]: TAB_ID, "Content-Type": "application/octet-stream", "Content-Range": `bytes ${start}-${end}/${file.size}` },
            body: file.slice(start, end + 1),
        });
        if (!response.ok) {
            const data = await response.json().catch(() => undefined);
            throw new ApiError(response.status, data?.error ?? "Unexpected error", data?.fields, data?.code, data?.params, data?.fieldCodes);
        }
    }
    const finished = await apiClient.post<{ file: StoredFile }>(`/projects/${projectId}/files/uploads/${started.uploadId}/complete`);
    return finished.file;
}

export async function listIssueFiles(projectId: string, issueId: string) {
    const data = await apiClient.get<{ files: StoredFile[] }>(`/projects/${projectId}/files?issueId=${encodeURIComponent(issueId)}`);
    return data.files;
}

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
