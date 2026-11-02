import { useTranslation } from "react-i18next";
import type { IntegrationText } from "../catalog";

/** The MCP server's tools, as the `mcp.*.ts` modules register them. A read-only token gets only the first list. */
const READ_TOOLS: Array<[string, IntegrationText]> = [
    ["list_projects", "integrations.toolListProjects"],
    ["list_issues", "integrations.toolListIssues"],
    ["list_my_issues", "integrations.toolListMyIssues"],
    ["get_issue", "integrations.toolGetIssue"],
    ["search", "integrations.toolSearch"],
    ["list_documents", "integrations.toolListDocuments"],
    ["get_document", "integrations.toolGetDocument"],
    ["list_notifications", "integrations.toolListNotifications"],
];
const WRITE_TOOLS: Array<[string, IntegrationText]> = [
    ["create_issue", "integrations.toolCreateIssue"],
    ["update_issue", "integrations.toolUpdateIssue"],
    ["update_issues", "integrations.toolUpdateIssues"],
    ["delete_issue", "integrations.toolDeleteIssue"],
    ["restore_issue", "integrations.toolRestoreIssue"],
    ["add_relation", "integrations.toolAddRelation"],
    ["remove_relation", "integrations.toolRemoveRelation"],
    ["add_comment", "integrations.toolAddComment"],
    ["create_document", "integrations.toolCreateDocument"],
    ["update_document", "integrations.toolUpdateDocument"],
    ["mark_notifications_read", "integrations.toolMarkNotificationsRead"],
];

/** Prompts and resources the server also offers, as `mcp.resources.ts` registers them. */
const EXTRAS: Array<[string, IntegrationText]> = [
    ["triage_inbox", "integrations.promptTriage"],
    ["standup", "integrations.promptStandup"],
    ["work_on_issue", "integrations.promptWorkOnIssue"],
    ["rinia://issue/…", "integrations.resourceIssue"],
    ["rinia://page/…", "integrations.resourcePage"],
];

function ToolItem({ name, description }: { name: string; description: IntegrationText }) {
    const { t } = useTranslation();
    return (
        <li>
            <code className="font-mono text-[12px] text-primary">{name}</code>
            <p className="text-[13px] leading-5 text-tertiary">{t(description as "integrations.toolSearch")}</p>
        </li>
    );
}

const groupLabel = "mb-2 text-[12px] font-medium tracking-wide text-tertiary uppercase select-none";

/** What a connected tool can read and change in Rinia, and the prompts and resources it gets too. */
export function McpToolList() {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
                {(
                    [
                        ["integrations.read", READ_TOOLS],
                        ["integrations.write", WRITE_TOOLS],
                    ] as const
                ).map(([label, tools]) => (
                    <div key={label}>
                        <p className={groupLabel}>{t(label)}</p>
                        <ul className="space-y-2.5">
                            {tools.map(([name, description]) => (
                                <ToolItem key={name} name={name} description={description} />
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            <p className="text-[13px] text-tertiary">{t("integrations.readOnlyTools")}</p>
            <div className="border-t border-subtle pt-5">
                <p className={groupLabel}>{t("integrations.extras")}</p>
                <p className="mb-3 text-[13px] text-tertiary">{t("integrations.promptsAndResources")}</p>
                <ul className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
                    {EXTRAS.map(([name, description]) => (
                        <ToolItem key={name} name={name} description={description} />
                    ))}
                </ul>
            </div>
        </div>
    );
}
