import { useRef, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { File, FileArchive, FileText, Paperclip, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { deleteProjectFile, issueFilesKey, listIssueFiles, uploadProjectFile, type StoredFile } from "@/features/editor/file-upload";

function formatBytes(bytes: number) {
    const units = ["B", "KB", "MB"];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }
    const digits = unit === 0 || size >= 10 ? 0 : 1;
    return `${size.toFixed(digits)} ${units[unit]}`;
}

function fileIcon(file: StoredFile) {
    if (file.contentType === "application/pdf" || file.contentType.startsWith("text/")) return FileText;
    if (file.contentType === "application/zip" || file.contentType === "application/x-zip-compressed") return FileArchive;
    return File;
}

function Attachment({ file, removing, onRemove }: { file: StoredFile; removing: boolean; onRemove: () => void }) {
    const { t } = useTranslation();
    const image = file.contentType.startsWith("image/");
    const Icon = fileIcon(file);
    return (
        <li className="flex items-center gap-3 rounded-md border border-subtle px-2 py-2">
            <a href={file.url} target="_blank" rel="noreferrer" className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-2 text-tertiary">
                {image ? <img src={file.url} alt="" className="size-full object-cover" /> : <Icon className="size-5" />}
            </a>
            <div className="min-w-0 flex-1">
                <a className="block truncate text-sm text-primary hover:underline" href={file.url} target="_blank" rel="noreferrer">{file.filename}</a>
                <p className="text-xs text-tertiary">{formatBytes(file.byteSize)}</p>
            </div>
            <ButtonUtility icon={Trash2} size="xs" color="tertiary" tooltip={t("issue.removeFile", { name: file.filename })} isDisabled={removing} onClick={onRemove} />
        </li>
    );
}

/** Files attached to the issue. An image only appears here when the upload was made for this issue. */
export function IssueFiles({ projectId, issueId }: { projectId: string; issueId: string }) {
    const { t } = useTranslation();
    const client = useQueryClient();
    const query = useQuery({ queryKey: issueFilesKey(projectId, issueId), queryFn: () => listIssueFiles(projectId, issueId) });
    const input = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);
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

    async function remove(fileId: string) {
        setRemoving(fileId);
        setError(null);
        try {
            await deleteProjectFile(projectId, fileId);
            await client.invalidateQueries({ queryKey: issueFilesKey(projectId, issueId) });
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : t("issue.fileRemoveFailed"));
        } finally {
            setRemoving(null);
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
                <ul className="mt-3 flex flex-col gap-2">
                    {query.data.map((file) => <Attachment key={file.id} file={file} removing={removing === file.id} onRemove={() => void remove(file.id)} />)}
                </ul>
            )}
            {error && <p role="alert" className="mt-2 text-xs text-danger-primary">{error}</p>}
        </section>
    );
}
