import { useRef, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/base/buttons/button";
import { issueFilesKey, listIssueFiles, uploadProjectFile } from "@/features/editor/file-upload";

/** Files attached to the issue. An image only appears here when the upload was made for this issue. */
export function IssueFiles({ projectId, issueId }: { projectId: string; issueId: string }) {
    const { t } = useTranslation();
    const client = useQueryClient();
    const query = useQuery({ queryKey: issueFilesKey(projectId, issueId), queryFn: () => listIssueFiles(projectId, issueId) });
    const input = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setUploading(true);
        setError(null);
        try {
            await uploadProjectFile(projectId, file, issueId);
            await client.invalidateQueries({ queryKey: issueFilesKey(projectId, issueId) });
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : t("issue.fileUploadFailed"));
        } finally {
            setUploading(false);
        }
    }

    return (
        <section className="mt-6" aria-labelledby="issue-files-heading">
            <div className="flex items-center justify-between gap-3">
                <h2 id="issue-files-heading" className="text-[15px] font-medium text-primary">{t("issue.attachments")}</h2>
                <input ref={input} type="file" className="sr-only" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,application/zip,text/plain,text/markdown,text/csv,application/json" onChange={(event) => void onChange(event)} />
                <Button size="xs" color="tertiary" iconLeading={Paperclip} isLoading={uploading} onClick={() => input.current?.click()}>{t("issue.addFile")}</Button>
            </div>
            {query.data && query.data.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {query.data.map((file) => (
                        <li key={file.id}>
                            <a className="text-sm text-primary underline" href={file.url} target="_blank" rel="noreferrer">{file.filename}</a>
                        </li>
                    ))}
                </ul>
            )}
            {error && <p role="alert" className="mt-2 text-xs text-danger-primary">{error}</p>}
        </section>
    );
}
