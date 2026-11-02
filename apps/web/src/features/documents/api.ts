import type { ActionSource, CreateDocumentInput, EntityIcon, TiptapDocument, UpdateDocumentInput } from "@rinia/shared";
import { apiClient } from "@/lib/api-client";

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
