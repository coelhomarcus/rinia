import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Layers, Users } from "lucide-react";
import { InlineNotice } from "@/components/base/feedback/alert";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Input } from "@/components/base/input/input";
import { Toggle } from "@/components/base/toggle/toggle";

export interface ViewDetails {
    name: string;
    shared: boolean;
}

/**
 * Names a new view or edits an existing one, laid out like the other small dialogs (new issue, delete
 * project). `canShare` is false when the person is not the view's owner: only the owner decides who sees it.
 */
export function SaveViewDialog({
    open,
    onOpenChange,
    mode,
    initial,
    canShare = true,
    isPending,
    error,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: "create" | "rename";
    initial: ViewDetails;
    canShare?: boolean;
    isPending: boolean;
    error: string | null;
    onSubmit: (details: ViewDetails) => void;
}) {
    const { t } = useTranslation();
    return (
        <Dialog.Root open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
            <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-[110] bg-overlay/70 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
                <Dialog.Viewport className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto p-safe-4">
                    <Dialog.Popup className="max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-subtle bg-surface-1 p-4 shadow-overlay-200 transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] outline-none data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-accent-primary">
                                    <Layers className="size-4" aria-hidden="true" />
                                    <span className="text-xs font-medium">{t("views.eyebrow")}</span>
                                </div>
                                <Dialog.Title className="text-base mt-1.5 font-semibold text-primary">
                                    {mode === "create" ? t("views.createTitle") : t("views.renameTitle")}
                                </Dialog.Title>
                                {mode === "create" && (
                                    <Dialog.Description className="mt-1 text-[13px] text-tertiary">{t("views.createDescription")}</Dialog.Description>
                                )}
                            </div>
                            <CloseButton size="sm" disabled={isPending} onPress={() => onOpenChange(false)} />
                        </div>
                        <ViewDetailsForm
                            key={String(open)}
                            mode={mode}
                            initial={initial}
                            canShare={canShare}
                            isPending={isPending}
                            error={error}
                            onSubmit={onSubmit}
                            onCancel={() => onOpenChange(false)}
                        />
                    </Dialog.Popup>
                </Dialog.Viewport>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function ViewDetailsForm({
    mode,
    initial,
    canShare,
    isPending,
    error,
    onSubmit,
    onCancel,
}: {
    mode: "create" | "rename";
    initial: ViewDetails;
    canShare: boolean;
    isPending: boolean;
    error: string | null;
    onSubmit: (details: ViewDetails) => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation();
    const [name, setName] = useState(initial.name);
    const [shared, setShared] = useState(initial.shared);
    const [missingName, setMissingName] = useState(false);

    function submit() {
        const trimmed = name.trim();
        if (!trimmed) {
            setMissingName(true);
            return;
        }
        onSubmit({ name: trimmed, shared });
    }

    return (
        <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
        >
            <Input
                autoFocus
                label={t("views.name")}
                value={name}
                maxLength={80}
                placeholder={t("views.namePlaceholder")}
                isInvalid={missingName}
                hint={missingName ? t("views.nameRequired") : undefined}
                onChange={(value) => {
                    setMissingName(false);
                    setName(value);
                }}
            />
            {/* One row for who sees it: the switch on the right, so the hint never pushes the dialog wider. */}
            {canShare && (
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-subtle px-3 py-2 transition-colors hover:bg-layer-transparent-hover">
                    <Users className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[13px] text-primary">{t("views.share")}</span>
                        <span className="text-xs text-tertiary">{shared ? t("views.shareHint") : t("views.privateHint")}</span>
                    </span>
                    <Toggle size="sm" isSelected={shared} onChange={setShared} aria-label={t("views.share")} />
                </label>
            )}
            {error && (
                <InlineNotice tone="error">{error}</InlineNotice>
            )}
            <div className="flex justify-end gap-2">
                <Button type="button" color="secondary" isDisabled={isPending} onClick={onCancel}>
                    {t("common.cancel")}
                </Button>
                <Button type="submit" isLoading={isPending}>
                    {mode === "create" ? t("views.saveView") : t("common.saveChanges")}
                </Button>
            </div>
        </form>
    );
}
