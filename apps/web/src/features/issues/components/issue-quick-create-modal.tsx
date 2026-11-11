import { type ReactNode, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import type { IssuePriority, TiptapDocument } from "@rinia/shared";
import { CalendarDays, ChevronRight, Maximize2, Minimize2, SignalHigh, Tag, UserRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { Toggle } from "@/components/base/toggle/toggle";
import { InlineNotice } from "@/components/base/feedback/alert";
import { useToast } from "@/components/feedback/toaster";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { IssueAvatar, PriorityIcon, StateIcon } from "@/features/board/components/issue-property-icons";
import { useColumns } from "@/features/board/hooks/use-board";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { useProject } from "@/features/projects/hooks/use-project";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { translateStatusName } from "@/i18n/status-label";
import { ApiError } from "@/lib/api-client";
import { urls } from "@/lib/urls";
import { issueNavigation } from "@/lib/view-transition";
import { cx } from "@/utils/cx";
import { useCreateIssue } from "../hooks/use-issues";
import { PRIORITY_OPTIONS, priorityLabelKey } from "../lib/priority";
import { DueDateCalendar } from "./due-date-picker";
import { LabelChip, LabelsPicker, useLabelToggle } from "./labels-picker";
import { EMPTY_TIPTAP_DOCUMENT, RichTextEditor } from "./rich-text-editor";

interface IssueQuickCreateModalProps {
    projectId: string;
    /** The status the issue starts in, such as the column whose "+" opened the modal. */
    columnId: string;
    onClose: () => void;
    onCreated?: (identifier: string) => void;
}

/** Property pills under the description: status, priority, assignee, labels, due date. */
const pill =
    "flex h-7 max-w-56 shrink-0 items-center gap-1 rounded-full border border-subtle px-2.5 text-xs text-secondary outline-none transition-colors hover:bg-layer-2-hover hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong data-[popup-open]:bg-layer-2-hover";
const menuItem =
    "flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[13px] text-secondary outline-none data-highlighted:bg-menu-hover data-highlighted:text-primary";

/**
 * Creates an issue, laid out like Linear's: the project and "New issue" on top, a large title and a description,
 * the properties as pills, and "Create more" to keep the modal open for the next one. It can expand to a taller
 * editor. `onClose` runs once the closing animation has finished, so the caller unmounts it after the fade.
 */
export const IssueQuickCreateModal = ({ projectId, columnId, onClose, onCreated }: IssueQuickCreateModalProps) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const showToast = useToast();
    const createIssue = useCreateIssue(projectId);
    const { data: project } = useProject(projectId);
    const { data: columns } = useColumns(projectId);
    const { data: members } = useProjectMembers(projectId);
    const { data: categories } = useCategories(projectId);
    const [open, setOpen] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [createMore, setCreateMore] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState<TiptapDocument>(EMPTY_TIPTAP_DOCUMENT);
    const [draft, setDraft] = useState(0);
    const [statusId, setStatusId] = useState(columnId);
    const [priority, setPriority] = useState<IssuePriority>("none");
    const [assigneeId, setAssigneeId] = useState<string | null>(null);
    const [labelIds, setLabelIds] = useState<string[]>([]);
    const [dueDate, setDueDate] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const titleRef = useRef<HTMLTextAreaElement>(null);
    const labels = useLabelToggle(labelIds, setLabelIds);


    const status = columns?.find((column) => column.id === statusId);
    const assignee = members?.find((member) => member.id === assigneeId);
    const chosenLabels = (categories ?? []).filter((label) => labelIds.includes(label.id));

    function submit() {
        const trimmed = title.trim();
        if (!trimmed) {
            setError(t("issue.titleRequired"));
            titleRef.current?.focus();
            return;
        }
        setError(null);
        createIssue.mutate(
            { columnId: statusId, title: trimmed, descriptionJson: description, priority, assigneeId, categoryIds: labelIds, dueDate },
            {
                onSuccess: (issue) => {
                    if (!createMore) {
                        onCreated?.(issue.identifier);
                        setOpen(false);
                        return;
                    }
                    // Keep the properties for a run of similar issues; only the text starts over.
                    setTitle("");
                    setDescription(EMPTY_TIPTAP_DOCUMENT);
                    setDraft((current) => current + 1);
                    titleRef.current?.focus();
                    showToast({
                        title: t("issue.issueCreated", { identifier: issue.identifier }),
                        action: { label: t("contextMenu.open"), onClick: () => navigate(urls.issue(issue.identifier, issue.title), issueNavigation(issue.title)) },
                    });
                },
                onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("errors.requestFailed")),
            },
        );
    }

    return (
        <Dialog.Root open={open} onOpenChange={(next) => !next && !createIssue.isPending && setOpen(false)} onOpenChangeComplete={(isOpen) => !isOpen && onClose()}>
            <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-50 bg-overlay backdrop-motion" />
                <Dialog.Viewport
                    className={cx("fixed inset-0 z-50 flex justify-center overflow-y-auto p-safe-4", expanded ? "items-center" : "items-start pt-[max(12vh,env(safe-area-inset-top,0px))]")}
                >
                    <Dialog.Popup
                        initialFocus={titleRef}
                        className={cx(
                            "flex w-full flex-col rounded-xl border border-subtle bg-layer-1 shadow-overlay-100 outline-none",
                            "transition-[opacity,transform,max-width,height] duration-(--motion-dialog) ease-(--ease-out-quint) data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0",
                            expanded ? "h-[min(860px,calc(100dvh-32px))] max-w-4xl" : "max-w-2xl",
                        )}
                    >
                        <div className="flex items-center gap-2 px-4 pt-3">
                            <span className="flex h-6 min-w-0 items-center gap-1 rounded-md border border-subtle bg-layer-2 px-2 text-xs font-medium text-secondary">
                                <ProjectIcon icon={project?.iconAppearance ?? project?.icon} className="size-3.5 shrink-0" />
                                <span className="truncate">{project?.issueKey}</span>
                            </span>
                            <ChevronRight className="size-3 shrink-0 text-placeholder" aria-hidden="true" />
                            <Dialog.Title className="text-[13px] text-secondary">{t("issue.newIssue")}</Dialog.Title>
                            <div className="ml-auto flex items-center gap-1">
                                <Tooltip title={expanded ? t("issue.collapseEditor") : t("issue.expandEditor")}>
                                    <Button
                                        size="xs"
                                        color="tertiary"
                                        className="rounded-full"
                                        iconLeading={expanded ? Minimize2 : Maximize2}
                                        aria-label={expanded ? t("issue.collapseEditor") : t("issue.expandEditor")}
                                        onClick={() => setExpanded((current) => !current)}
                                    />
                                </Tooltip>
                                <Dialog.Close
                                    render={<Button size="xs" color="tertiary" className="rounded-full" iconLeading={X} aria-label={t("common.close")} />}
                                />
                            </div>
                        </div>

                        <div className={cx("flex min-h-0 flex-col px-4 pt-3", expanded && "flex-1")}>
                            <textarea
                                ref={titleRef}
                                rows={1}
                                value={title}
                                maxLength={200}
                                aria-label={t("issue.issueTitle")}
                                placeholder={t("issue.issueTitle")}
                                onChange={(event) => {
                                    setError(null);
                                    setTitle(event.target.value.replace(/\n/g, " "));
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        submit();
                                    }
                                }}
                                className="field-sizing-content w-full resize-none bg-transparent text-lg font-medium text-primary outline-none placeholder:text-placeholder"
                            />
                            <div className={cx("mt-1 min-h-16 overflow-y-auto text-[14px]", expanded ? "flex-1" : "max-h-64")}>
                                <RichTextEditor
                                    key={draft}
                                    toolbar={false}
                                    variant="description"
                                    content={description}
                                    uploads={{ projectId }}
                                    onChange={setDescription}
                                    onSubmitShortcut={submit}
                                    placeholder={t("issue.addDescription")}
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1 px-4 py-3">
                            <ChoiceMenu
                                label={t("issue.status")}
                                trigger={
                                    <>
                                        <StateIcon name={status?.name ?? ""} color={status?.color} className="size-3.5" />
                                        <span className="truncate">{status ? translateStatusName(status.name, t) : t("issue.status")}</span>
                                    </>
                                }
                            >
                                {(columns ?? []).map((column) => (
                                    <Menu.Item key={column.id} className={menuItem} onClick={() => setStatusId(column.id)}>
                                        <StateIcon name={column.name} color={column.color} className="size-4" />
                                        {translateStatusName(column.name, t)}
                                    </Menu.Item>
                                ))}
                            </ChoiceMenu>
                            <ChoiceMenu
                                label={t("issue.priority")}
                                muted={priority === "none"}
                                trigger={
                                    priority === "none" ? (
                                        <>
                                            <SignalHigh className="size-3.5" />
                                            {t("issue.priority")}
                                        </>
                                    ) : (
                                        <>
                                            <PriorityIcon priority={priority} className="size-3.5" />
                                            {t(priorityLabelKey(priority))}
                                        </>
                                    )
                                }
                            >
                                {PRIORITY_OPTIONS.map((option) => (
                                    <Menu.Item key={option} className={menuItem} onClick={() => setPriority(option)}>
                                        <PriorityIcon priority={option} className="size-4" />
                                        {t(priorityLabelKey(option))}
                                    </Menu.Item>
                                ))}
                            </ChoiceMenu>
                            <ChoiceMenu
                                label={t("issue.assignee")}
                                muted={!assignee}
                                trigger={
                                    assignee ? (
                                        <>
                                            <IssueAvatar name={assignee.name} avatarUrl={assignee.avatarUrl} className="size-3.5 text-[8px]" />
                                            <span className="truncate">{assignee.name}</span>
                                        </>
                                    ) : (
                                        <>
                                            <UserRound className="size-3.5" />
                                            {t("issue.assignee")}
                                        </>
                                    )
                                }
                            >
                                <Menu.Item className={menuItem} onClick={() => setAssigneeId(null)}>
                                    <span className="size-4 rounded-full border border-dashed border-strong" />
                                    {t("issue.unassigned")}
                                </Menu.Item>
                                {(members ?? []).map((member) => (
                                    <Menu.Item key={member.id} className={menuItem} onClick={() => setAssigneeId(member.id)}>
                                        <IssueAvatar name={member.name} avatarUrl={member.avatarUrl} className="size-4 text-[9px]" />
                                        <span className="truncate">{member.name}</span>
                                    </Menu.Item>
                                ))}
                            </ChoiceMenu>
                            <LabelsPicker
                                labels={categories ?? []}
                                state={labels.state}
                                onToggle={labels.toggle}
                                onClose={labels.reset}
                                triggerLabel={chosenLabels.length ? chosenLabels.map((label) => label.name).join(", ") : t("issue.labels")}
                                triggerClassName={cx(pill, chosenLabels.length === 0 && "text-tertiary")}
                            >
                                {chosenLabels.length === 0 ? (
                                    <>
                                        <Tag className="size-3.5" />
                                        {t("issue.labels")}
                                    </>
                                ) : (
                                    chosenLabels.slice(0, 3).map((label) => <LabelChip key={label.id} label={label} className="-my-1 border-0 px-0" />)
                                )}
                            </LabelsPicker>
                            <Popover.Root>
                                <Popover.Trigger className={cx(pill, !dueDate && "text-tertiary")}>
                                    <CalendarDays className="size-3.5" />
                                    {dueDate
                                        ? new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short", timeZone: "UTC" }).format(
                                              new Date(`${dueDate}T00:00:00Z`),
                                          )
                                        : t("issue.dueDate")}
                                </Popover.Trigger>
                                <Popover.Portal>
                                    <Popover.Positioner sideOffset={6} align="start" className="z-[60]">
                                        <Popover.Popup className={cx("w-72", overlayChrome.popupPadded)}>
                                            <DueDateCalendar value={dueDate} onChange={setDueDate} />
                                        </Popover.Popup>
                                    </Popover.Positioner>
                                </Popover.Portal>
                            </Popover.Root>
                        </div>

                        <div className="flex items-center gap-3 border-t border-subtle px-4 py-3">
                            {error && (
                                <InlineNotice tone="error">{error}</InlineNotice>
                            )}
                            <div className="ml-auto flex items-center gap-3">
                                <Toggle size="sm" isSelected={createMore} onChange={setCreateMore} label={t("issue.createMore")} />
                                <Button size="md" className="rounded-full" isLoading={createIssue.isPending} onClick={submit}>
                                    {t("issue.createIssue")}
                                </Button>
                            </div>
                        </div>
                    </Dialog.Popup>
                </Dialog.Viewport>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

/** A property pill that opens a menu of its values. Unset properties read muted, like a placeholder. */
function ChoiceMenu({ label, trigger, muted = false, children }: { label: string; trigger: ReactNode; muted?: boolean; children: ReactNode }) {
    return (
        <Menu.Root>
            <Menu.Trigger aria-label={label} className={cx(pill, muted && "text-tertiary")}>
                {trigger}
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner sideOffset={6} align="start" className="z-[60]">
                    <Menu.Popup className={cx("max-h-80 w-56 overflow-y-auto", overlayChrome.menu)}>
                        <div className="px-2 py-1 text-[11px] text-placeholder">{label}</div>
                        {children}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
