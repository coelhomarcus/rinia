import type { ReactNode } from "react";
import { Dialog, DialogTrigger, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { CloseButton } from "@/components/base/buttons/close-button";

interface ModalDialogProps {
    trigger: ReactNode;
    title: string;
    description?: string;
    size?: "md" | "2xl";
    children: (args: { close: () => void }) => ReactNode;
}

export const ModalDialog = ({ trigger, title, description, size = "md", children }: ModalDialogProps) => {
    return (
        <DialogTrigger>
            {trigger}
            <ModalOverlay>
                <Modal className={size === "2xl" ? "max-w-2xl" : "max-w-md"}>
                    <Dialog>
                        {({ close }) => (
                            <div className="w-full rounded-xl bg-layer-1 p-4 shadow-overlay-100 ring-1 ring-subtle">
                                <div className="mb-3 flex items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-base font-semibold text-primary">{title}</h2>
                                        {description && <p className="mt-1 text-[13px] text-tertiary">{description}</p>}
                                    </div>
                                    <CloseButton size="sm" onPress={close} />
                                </div>
                                {children({ close })}
                            </div>
                        )}
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </DialogTrigger>
    );
};
