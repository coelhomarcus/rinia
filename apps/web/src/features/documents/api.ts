import { REALTIME_CLIENT_HEADER, type ActionSource, type CreateDocumentInput, type EntityIcon, type TiptapDocument, type UpdateDocumentInput } from "@rinia/shared";
import { ApiError, apiClient } from "@/lib/api-client";
import { TAB_ID } from "@/lib/tab-id";

export interface DocumentPage {
    id: string;
    projectId: string;
    title: string;
    iconAppearance: EntityIcon | null;
    contentJson: TiptapDocument;
    createdBy: string;
    createdAt: string;
    /** The tool that created the page, when it was not made in the web app. */
    source: ActionSource | null;
    updatedAt: string;
    revision: number;
}
export type DocumentSummary = Omit<DocumentPage, "contentJson">;
const base = (projectId: string) => `/projects/${projectId}/documents`;
export const listDocuments = (projectId: string) => apiClient.get<{ documents: DocumentSummary[] }>(base(projectId)).then((r) => r.documents);
export const getDocument = (projectId: string, id: string) => apiClient.get<{ document: DocumentPage }>(`${base(projectId)}/${id}`).then((r) => r.document);
export const createDocument = (projectId: string, input: Partial<CreateDocumentInput> = {}) =>
    apiClient.post<{ document: DocumentPage }>(base(projectId), input).then((r) => r.document);
export const deleteDocument = (projectId: string, id: string) => apiClient.delete<{ deletedAt: string }>(`${base(projectId)}/${id}`);
export const restoreDocument = (projectId: string, id: string, deletedAt: string) => apiClient.post<void>(`${base(projectId)}/${id}/restore`, { deletedAt });
export async function saveDocument(projectId: string, id: string, input: UpdateDocumentInput, signal?: AbortSignal): Promise<DocumentPage> {
    const { document } = await apiClient.patch<{ document: DocumentPage }>(`${base(projectId)}/${id}`, input, signal);
    return document;
}

export function downloadFilename(header: string | null, fallback: string) {
    const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (encoded) {
        try {
            return decodeURIComponent(encoded);
        } catch {
            /* The header was not valid percent-encoding. */
        }
    }
    return header?.match(/filename="([^"]+)"/)?.[1] ?? fallback;
}

/** A file response. The JSON client cannot carry one, so this fetches the bytes and starts the download. */
async function downloadFile(path: string, fallbackName: string) {
    const response = await fetch(`/api${path}`, { credentials: "include", headers: { [REALTIME_CLIENT_HEADER]: TAB_ID } });
    if (!response.ok) {
        const data = await response.json().catch(() => undefined);
        throw new ApiError(response.status, data?.error ?? "Unexpected error", data?.fields, data?.code, data?.params, data?.fieldCodes);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = downloadFilename(response.headers.get("content-disposition"), fallbackName);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadDocumentMarkdown = (projectId: string, documentId: string) =>
    downloadFile(`${base(projectId)}/${documentId}/export?format=md`, "page.md");

export const downloadProjectDocuments = (projectId: string) => downloadFile(`${base(projectId)}/export`, "pages.zip");
