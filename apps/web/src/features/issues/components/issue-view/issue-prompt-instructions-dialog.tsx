import { useEffect, useState } from "react";
import { DEFAULT_PROMPT_INSTRUCTIONS } from "@rinia/shared";
import { useTranslation } from "react-i18next";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Alert } from "@/components/base/feedback/alert";
import { useToast } from "@/components/feedback/toaster";
import type { IssueDetail } from "../../api";
import { errorMessage } from "../../lib/error-message";
import { PromptInstructionsField } from "../prompt-instructions-field";
import type { IssueUpdater } from "./use-issue-mutations";

/** Sets the instructions "Copy with prompt" uses for this issue alone. Left empty, the project's apply. */
export function IssuePromptInstructionsDialog({ issue, updater, open, onOpenChange }: { issue: IssueDetail; updater: IssueUpdater; open: boolean; onOpenChange: (open: boolean) => void }) {
    const { t } = useTranslation();
    const showToast = useToast();
    const [value, setValue] = useState("");
    const [error, setError] = useState<string | null>(null);
    const projectInstructions = issue.project.promptInstructions?.trim();
    const saved = issue.promptInstructions ?? "";

    // Each opening starts from what is saved, not from a draft that was cancelled.
    useEffect(() => {
        if (!open) return;
        setValue(saved);
        setError(null);
    }, [open, saved]);

    const save = (close: () => void) => {
        const next = value.trim() ? value.trim() : null;
        if (next === (issue.promptInstructions ?? null)) return close();
        updater.mutate(
            { identifier: issue.identifier, input: { promptInstructions: next } },
            {
                onSuccess: () => {
                    close();
                    showToast({ title: t("issue.promptInstructionsSaved") });
                },
                onError: (reason) => setError(errorMessage(reason, t("issue.couldNotSavePromptInstructions"))),
            },
        );
    };

    return (
        <ModalOverlay isOpen={open} onOpenChange={onOpenChange}>
            <Modal className="max-w-2xl">
                <Dialog>
                    {({ close }) => (
                        <div className="w-full rounded-xl bg-layer-1 p-4 shadow-overlay-100 ring-1 ring-subtle">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-primary">{t("issue.promptInstructionsTitle")}</h2>
                                    <p className="mt-1 text-[13px] text-tertiary">{t("issue.promptInstructionsIssueHint")}</p>
                                </div>
                                <CloseButton size="sm" onPress={close} />
                            </div>
                            <PromptInstructionsField
                                value={value}
                                onChange={(next) => {
                                    setValue(next);
                                    setError(null);
                                }}
                                fallback={projectInstructions || DEFAULT_PROMPT_INSTRUCTIONS}
                                fallbackLabel={projectInstructions ? t("issue.promptInstructionsUsingProject") : t("issue.promptInstructionsUsingDefault")}
                                restoreLabel={projectInstructions ? t("issue.useProjectPromptInstructions") : undefined}
                                disabled={updater.isPending}
                            />
                            {error && <Alert tone="error" className="mt-3">{error}</Alert>}
                            <div className="mt-4 flex justify-end gap-2">
                                <Button type="button" color="secondary" onClick={close}>{t("common.cancel")}</Button>
                                <Button type="button" isLoading={updater.isPending} onClick={() => save(close)}>{t("common.saveChanges")}</Button>
                            </div>
                        </div>
                    )}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
