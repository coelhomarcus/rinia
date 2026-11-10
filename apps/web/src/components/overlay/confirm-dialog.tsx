import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Dialog, DialogTrigger, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { useTranslation } from "react-i18next";

interface ConfirmDialogProps {
    /** Element that opens the dialog (usually the destructive action's button). Omit it and pass `open` to control the dialog from a menu. */
    trigger?: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    title: string;
    description: string;
    /** Text for the confirmation button. It should name the action instead of using a generic "OK". */
    confirmLabel: string;
    isPending?: boolean;
    onConfirm: () => void;
}

/**
 * Confirmation for destructive actions. The trigger is passed as a prop (the `ModalDialog`
 * pattern), so callers only need to replace the button's `onClick` with this wrapper without
 * managing state.
 */
export const ConfirmDialog = ({ trigger, open, onOpenChange, title, description, confirmLabel, isPending, onConfirm }: ConfirmDialogProps) => {
    const { t } = useTranslation();
    const controlled = open !== undefined;
    const overlay = (
            <ModalOverlay {...(controlled ? { isOpen: open, onOpenChange } : {})}>
                <Modal className="max-w-md">
                    <Dialog>
                        {({ close }) => (
                            <div className="w-full rounded-lg bg-surface-1 p-4 shadow-xl ring-1 ring-subtle">
                                <div className="flex gap-3">
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-danger-primary text-fg-white">
                                        <TriangleAlert className="size-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-base font-semibold text-primary">{title}</h2>
                                        <p className="mt-1 text-[13px] text-tertiary">{description}</p>
                                    </div>
                                </div>

                                <div className="mt-4 flex justify-end gap-2">
                                    <Button type="button" color="secondary" onClick={close}>
                                        {t("common.cancel")}
                                    </Button>
                                    <Button
                                        type="button"
                                        color="primary-destructive"
                                        isLoading={isPending}
                                        onClick={() => {
                                            onConfirm();
                                            close();
                                        }}
                                    >
                                        {confirmLabel}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Dialog>
                </Modal>
            </ModalOverlay>
    );
    if (controlled) return overlay;
    return (
        <DialogTrigger>
            {trigger}
            {overlay}
        </DialogTrigger>
    );
};
