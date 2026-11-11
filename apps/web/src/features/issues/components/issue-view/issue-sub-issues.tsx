import { memo, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/base/buttons/button";
import { Collapse } from "@/components/base/collapse";
import { StateIcon } from "@/features/board/components/issue-property-icons";
import { defaultIssueColumn } from "@/features/board/column-bucket";
import { useColumns } from "@/features/board/hooks/use-board";
import { urls } from "@/lib/urls";
import { issueViewTransitionStyle } from "@/lib/view-transition";
import type { IssueDetail } from "../../api";
import { errorMessage } from "../../lib/error-message";
import { useCreateSubIssue } from "./use-issue-mutations";

/** A list still loading is empty, and one shared array keeps it from looking new on every render. */
const NONE: never[] = [];

/** The issue's sub-issues with how many are done, and a field to add one. */
export const IssueSubIssues = memo(function IssueSubIssues({ issue }: { issue: IssueDetail }) {
    const { t } = useTranslation();
    const { data: loadedColumns } = useColumns(issue.projectId);
    const columns = loadedColumns ?? NONE;
    const { create: onCreate, isCreating } = useCreateSubIssue(issue);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const children = issue.children ?? [];
    const columnOf = (columnId: string) => columns.find((column) => column.id === columnId);
    const done = children.filter((child) => /done|complete|conclu/i.test(columnOf(child.columnId)?.name ?? "")).length;
    useEffect(() => {
        if (adding) inputRef.current?.focus();
    }, [adding]);

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const value = draft.trim();
        if (!value) return;
        setError(null);
        try {
            await onCreate(value);
            setDraft("");
        } catch (reason) {
            setError(errorMessage(reason, t("issue.couldNotCreateSubIssue")));
        }
    }

    return (
        <section className="mt-8" aria-label={t("issue.subIssues")}>
            {children.length > 0 && (
                <>
                    <div className="mb-1 flex items-center gap-2 px-2 text-[13px]">
                        <span className="font-medium text-secondary">{t("issue.subIssues")}</span>
                        <span className="text-tertiary tabular-nums">{done}/{children.length}</span>
                    </div>
                    <ul className="flex flex-col">
                        {children.map((child) => {
                            const identifier = `${issue.project.issueKey}-${child.number}`;
                            const column = columnOf(child.columnId);
                            return (
                                <li key={child.id} className="animate-enter" data-issue-id={child.id} data-issue-context="true" data-project-id={issue.projectId} data-issue-identifier={identifier} data-issue-title={child.title}>
                                    <Link viewTransition to={urls.issue(identifier, child.title)} state={{ issueTitle: child.title }} className="flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors duration-150 hover:bg-layer-transparent-hover hover:duration-0">
                                        <StateIcon name={column?.name ?? ""} color={column?.color} />
                                        <span className="shrink-0 whitespace-nowrap text-tertiary" style={issueViewTransitionStyle(identifier, "id")}>{identifier}</span>
                                        <span className="min-w-0 truncate text-primary" style={issueViewTransitionStyle(identifier, "title")}>{child.title}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
            <Collapse open={adding} lazy={false}>
                <form onSubmit={submit} className="mt-1 flex h-10 items-center gap-2.5 rounded-lg border border-subtle bg-layer-1 pr-1.5 pl-2.5">
                    <StateIcon name={defaultIssueColumn(columns)?.name ?? ""} color={defaultIssueColumn(columns)?.color} />
                    <input
                        ref={inputRef}
                        value={draft}
                        disabled={isCreating}
                        placeholder={t("issue.subIssueTitle")}
                        aria-label={t("issue.subIssueTitle")}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                setAdding(false);
                                setDraft("");
                            }
                        }}
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-primary outline-none placeholder:text-placeholder"
                    />
                    <Button type="button" size="xs" color="tertiary" onClick={() => { setAdding(false); setDraft(""); }}>{t("common.cancel")}</Button>
                    <Button type="submit" size="xs" isDisabled={!draft.trim()} isLoading={isCreating}>{t("common.add")}</Button>
                </form>
            </Collapse>
            {error && <p role="alert" className="animate-enter mt-1 px-2 text-xs text-danger-primary">{error}</p>}
            {!adding && (
                <button type="button" onClick={() => setAdding(true)} className="mt-1 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-tertiary transition-colors duration-150 hover:bg-layer-transparent-hover hover:text-primary">
                    <Plus className="size-3.5" />
                    {t("issue.addSubIssue")}
                </button>
            )}
        </section>
    );
});
