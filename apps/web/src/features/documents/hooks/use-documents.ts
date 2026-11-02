import type { CreateDocumentInput } from "@rinia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDocument, type DocumentSummary, getDocument, listDocuments } from "../api";

export const documentsKey = (projectId: string) => ["projects", projectId, "documents"] as const;
export const documentKey = (projectId: string, documentId: string) => [...documentsKey(projectId), documentId] as const;
export const useDocuments = (projectId: string) =>
    useQuery({ queryKey: documentsKey(projectId), queryFn: () => listDocuments(projectId), enabled: !!projectId });
export const useDocument = (projectId: string, documentId: string) =>
    useQuery({ queryKey: documentKey(projectId, documentId), queryFn: () => getDocument(projectId, documentId), enabled: !!projectId && !!documentId });
export function useCreateDocument(projectId: string) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (input: Partial<CreateDocumentInput> = {}) => createDocument(projectId, input),
        onSuccess: (page) => {
            client.setQueryData(documentKey(projectId, page.id), page);
            // The page route finds the page by its slug in this list; without it there, the new page reads as missing until the refetch lands.
            const { contentJson: _contentJson, ...summary } = page;
            client.setQueryData<DocumentSummary[]>(documentsKey(projectId), (old) => (old && !old.some((item) => item.id === page.id) ? [...old, summary] : old));
            void client.invalidateQueries({ queryKey: documentsKey(projectId), exact: true });
        },
    });
}
