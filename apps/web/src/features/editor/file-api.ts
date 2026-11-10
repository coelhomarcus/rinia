import { REALTIME_CLIENT_HEADER, UPLOAD_CHUNK_BYTES } from "@rinia/shared";
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

export function deleteProjectFile(projectId: string, fileId: string) {
    return apiClient.delete<void>(`/projects/${projectId}/files/${fileId}`);
}

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
