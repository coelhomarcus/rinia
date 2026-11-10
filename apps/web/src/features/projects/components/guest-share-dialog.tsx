import { useTranslation } from "react-i18next";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Alert } from "@/components/base/feedback/alert";
import { useProjectMembers, useShares, useToggleShare } from "../hooks/use-project-members";
import { memberInitials } from "./members-panel";

/**
 * Who among the project's guests may see one issue or page. Everyone else in the project already sees it; a guest
 * sees only what is ticked here, plus the issues assigned to them.
 *
 * `base` is the item's API path: `/issues/RIN-4` or `/projects/:projectId/documents/:documentId`.
 */
export function GuestShareDialog({ projectId, base, open, onOpenChange }: { projectId: string; base: string; open: boolean; onOpenChange: (open: boolean) => void }) {
    const { t } = useTranslation();
    const { data: members } = useProjectMembers(projectId);
    const guests = (members ?? []).filter((member) => member.role === "guest");
    const { data: shares, isLoading, isError } = useShares(open ? base : null);
    const toggle = useToggleShare(base);
    const shared = new Set((shares ?? []).map((share) => share.user.id));

    return (
        <ModalOverlay isOpen={open} onOpenChange={onOpenChange}>
            <Modal className="max-w-md">
                <Dialog aria-label={t("settings.shareWithGuests")}>
                    {({ close }) => (
                        <div className="w-full rounded-lg bg-surface-1 p-4 shadow-xl ring-1 ring-subtle">
                            <h2 className="text-base font-semibold text-primary">{t("settings.shareWithGuests")}</h2>
                            <p className="mt-1 text-[13px] text-tertiary">{t("settings.shareWithGuestsDescription")}</p>
                            <div className="mt-4 space-y-1">
                                {guests.length === 0 && <p className="text-[13px] text-tertiary">{t("settings.noGuests")}</p>}
                                {isError && <Alert tone="error">{t("settings.couldNotLoadShares")}</Alert>}
                                {guests.map((guest) => (
                                    <div key={guest.id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-layer-transparent-hover">
                                        <Avatar src={guest.avatarUrl ?? undefined} initials={memberInitials(guest.name)} size="xs" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm text-primary">{guest.name}</p>
                                            <p className="truncate text-xs text-tertiary">@{guest.username}</p>
                                        </div>
                                        <Checkbox
                                            aria-label={t("settings.shareWith", { name: guest.name })}
                                            isSelected={shared.has(guest.id)}
                                            isDisabled={isLoading || toggle.isPending}
                                            onChange={(checked) => toggle.mutate({ userId: guest.id, shared: checked })}
                                        />
                                    </div>
                                ))}
                                {toggle.isError && <Alert tone="error">{t("settings.couldNotShare")}</Alert>}
                            </div>
                            <div className="mt-4 flex justify-end">
                                <Button type="button" color="secondary" onClick={close}>
                                    {t("common.close")}
                                </Button>
                            </div>
                        </div>
                    )}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
