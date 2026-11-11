import { memo, useState } from "react";
import { Ban, Copy, Link2, ListTree, Plus, ShieldOff, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Collapse } from "@/components/base/collapse";
import { ComboBox, ComboBoxItem } from "@/components/base/select/combobox";
import { Select } from "@/components/base/select/select";
import { ApiError } from "@/lib/api-client";
import { urls } from "@/lib/urls";
import { issueViewTransitionStyle } from "@/lib/view-transition";
import { useIssueRelations, useIssues } from "../../hooks/use-issues";
import { useRelationActions } from "./use-issue-mutations";

/** Lists still loading are empty, and one shared array keeps them from looking new on every render. */
const NONE: never[] = [];

type RelationType = "blocks" | "blocked_by" | "related" | "duplicate";

function RelationsPanel({
    projectId,
    issueId,
    projectIssues,
    relations,
    formOpen,
    onFormOpenChange,
    isPending,
    onAdd,
    onDelete,
}: {
    projectId: string;
    issueId: string;
    projectIssues: Array<{ id: string; identifier: string; title: string }>;
    relations: Array<{ id: string; type: string; target: { id: string; number: number; title: string; projectId: string; project: { issueKey: string } } }>;
    formOpen: boolean;
    onFormOpenChange: (open: boolean) => void;
    isPending: boolean;
    onAdd: (targetIssueIdentifier: string, type: RelationType) => Promise<void>;
    onDelete: (relationId: string) => void;
}) {
    const { t } = useTranslation();
    const [targetIssueIdentifier, setTargetIssueIdentifier] = useState("");
    const [type, setType] = useState<RelationType>("related");
    const [error, setError] = useState<string | null>(null);
    const typeLabels: Record<RelationType, string> = { related: t("issue.relatedTo"), blocks: t("issue.blocks"), blocked_by: t("issue.blockedBy"), duplicate: t("issue.duplicateOf") };

    async function addRelation(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const target = targetIssueIdentifier.trim();
        if (!target) {
            setError(t("issue.chooseIssueToRelate"));
            return;
        }
        if (projectIssues.length > 0 && !projectIssues.some((projectIssue) => projectIssue.identifier.toLowerCase() === target.toLowerCase())) {
            setError(t("issue.chooseIssueFromProject"));
            return;
        }
        setError(null);
        try {
            await onAdd(target, type);
            setTargetIssueIdentifier("");
            onFormOpenChange(false);
        } catch (reason) {
            setError(reason instanceof ApiError ? reason.message : t("issue.couldNotAddRelation"));
        }
    }

    return (
        <section className="mt-8" aria-label={t("issue.relations")}>
            <div className="mb-1 flex items-center justify-between gap-2 px-2">
                <span className="text-[13px] font-medium text-secondary">{t("issue.relations")}</span>
                {relations.length > 0 && <ButtonUtility icon={Plus} size="xs" color="tertiary" tooltip={t("issue.addRelation")} onClick={() => onFormOpenChange(!formOpen)} />}
            </div>
            <ul className="flex flex-col">
                {relations.map((relation) => {
                    const identifier = `${relation.target.project.issueKey}-${relation.target.number}`;
                    const targetProjectId = relation.target.projectId || projectId;
                    return (
                        <li key={relation.id} className="group/relation animate-enter flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors duration-150 hover:bg-layer-transparent-hover hover:duration-0">
                            <span className="w-24 shrink-0 truncate text-tertiary">{typeLabels[relation.type as RelationType] ?? relation.type}</span>
                            <Link
                                viewTransition
                                to={urls.issue(identifier, relation.target.title)}
                                state={{ issueTitle: relation.target.title }}
                                className="flex min-w-0 flex-1 items-center gap-2"
                                data-issue-id={relation.target.id}
                                data-issue-context="true"
                                data-project-id={targetProjectId}
                                data-issue-identifier={identifier}
                                data-issue-title={relation.target.title}
                            >
                                <span className="shrink-0 text-tertiary" style={issueViewTransitionStyle(identifier, "id")}>{identifier}</span>
                                <span className="truncate text-primary" style={issueViewTransitionStyle(identifier, "title")}>{relation.target.title}</span>
                            </Link>
                            <span className="transition-opacity can-hover:opacity-0 can-hover:group-hover/relation:opacity-100 focus-within:opacity-100">
                                <ButtonUtility icon={Trash2} size="xs" color="tertiary" tooltip={t("issue.removeRelation")} onClick={() => onDelete(relation.id)} isDisabled={isPending} />
                            </span>
                        </li>
                    );
                })}
            </ul>
            <Collapse open={formOpen} lazy={false}>
                <form className="mt-1 flex flex-col gap-2 rounded-lg border border-subtle bg-layer-1 p-2 sm:flex-row sm:items-center" onSubmit={addRelation}>
                    <Select
                        className="sm:w-40"
                        aria-label={t("issue.relationType")}
                        items={(Object.keys(typeLabels) as RelationType[]).map((id) => ({ id, label: typeLabels[id], icon: id === "blocks" ? Ban : id === "blocked_by" ? ShieldOff : id === "duplicate" ? Copy : Link2 }))}
                        selectedKey={type}
                        onSelectionChange={(next) => setType((next ?? "related") as RelationType)}
                        size="sm"
                    >
                        {(item) => <Select.Item id={item.id} icon={item.icon}>{item.label}</Select.Item>}
                    </Select>
                    <ComboBox
                        className="min-w-0 flex-1"
                        items={projectIssues.filter((projectIssue) => projectIssue.id !== issueId).map((projectIssue) => ({ id: projectIssue.identifier, label: `${projectIssue.identifier} · ${projectIssue.title}`, icon: ListTree }))}
                        selectedKey={targetIssueIdentifier || null}
                        onSelectionChange={(next) => setTargetIssueIdentifier(String(next ?? ""))}
                        placeholder={t("issue.issueIdentifier")}
                        size="sm"
                    >
                        {(item) => <ComboBoxItem item={item}>{item.label}</ComboBoxItem>}
                    </ComboBox>
                    <Button type="submit" size="xs" iconLeading={Plus} isLoading={isPending}>{t("common.add")}</Button>
                </form>
            </Collapse>
            {error && <p role="alert" className="animate-enter mt-1 px-2 text-xs text-danger-primary">{error}</p>}
        </section>
    );
}

/**
 * The relations of an issue, with the form to add one. The section is closed while there are none, until the page asks
 * for it to open (the issue menu's "add relation").
 */
export const IssueRelations = memo(function IssueRelations({ projectId, issueId, identifier, open, onOpenChange }: { projectId: string; issueId: string; identifier: string; open: boolean; onOpenChange: (open: boolean) => void }) {
    const { data: relations } = useIssueRelations(identifier);
    const { data: projectIssues } = useIssues(projectId);
    const { add, remove, isPending } = useRelationActions(identifier);
    return (
        <Collapse open={open || !!relations?.length} lazy={false}>
            <RelationsPanel
                projectId={projectId}
                issueId={issueId}
                projectIssues={projectIssues ?? NONE}
                relations={relations ?? NONE}
                formOpen={open || !relations?.length}
                onFormOpenChange={onOpenChange}
                isPending={isPending}
                onAdd={add}
                onDelete={remove}
            />
        </Collapse>
    );
});
