import type { QueryClient } from "@tanstack/react-query";
import { type DocumentPage, type DocumentSummary, saveDocument } from "./api";
import { DocumentSession } from "./document-session";
import { documentKey, documentsKey } from "./hooks/use-documents";
import { deleteDatabase, LEGACY_DRAFTS_DATABASE, sessionKey, sessionRegistry } from "./session-registry";

const sessions = sessionRegistry as Map<string, DocumentSession>;
export function getDocumentSession(userId: string, page: DocumentPage, client: QueryClient) {
    const key = sessionKey(userId, page.projectId, page.id);
    let session = sessions.get(key);
    if (!session) {
        session = new DocumentSession(page, {
            online: () => navigator.onLine,
            save: (input, signal) => saveDocument(page.projectId, page.id, input, signal),
            onSaved: (saved) => {
                client.setQueryData(documentKey(page.projectId, page.id), saved);
                client.setQueryData<DocumentSummary[]>(documentsKey(page.projectId), (old) =>
                    old?.map((item) => (item.id === saved.id ? { ...item, title: saved.title, iconAppearance: saved.iconAppearance, updatedAt: saved.updatedAt, revision: saved.revision } : item)),
                );
            },
        });
        sessions.set(key, session);
    }
    return session;
}
if (typeof window !== "undefined") {
    if (typeof indexedDB !== "undefined") void deleteDatabase(LEGACY_DRAFTS_DATABASE);
    window.addEventListener("online", () => sessions.forEach((session) => session.networkChanged()));
    window.addEventListener("offline", () => sessions.forEach((session) => session.networkChanged()));
    window.addEventListener("beforeunload", (event) => {
        if ([...sessions.values()].some((session) => session.getSnapshot().dirty)) {
            event.preventDefault();
            event.returnValue = "";
        }
    });
}
