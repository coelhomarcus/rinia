import { Fragment } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useTranslation } from "react-i18next";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { CloseButton } from "@/components/base/buttons/close-button";
import { ShortcutKeys } from "./shortcut-keys";
import { SHORTCUT_SECTIONS } from "./shortcuts";

/** The `?` panel: every keyboard shortcut, by where it works. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const { t } = useTranslation();
    return (
        <ModalOverlay isOpen={open} onOpenChange={onOpenChange} isDismissable>
            <Modal className="max-w-2xl">
                <Dialog>
                    <div className="flex max-h-[80vh] w-full flex-col overflow-hidden rounded-xl bg-menu shadow-overlay-100 ring-1 ring-subtle">
                        <div className="flex items-start justify-between gap-3 border-b border-subtle p-4">
                            <div>
                                <BaseDialog.Title className="text-base font-semibold text-primary">{t("commands.shortcutsTitle")}</BaseDialog.Title>
                                <BaseDialog.Description className="mt-1 text-[13px] text-tertiary">{t("commands.shortcutsDescription")}</BaseDialog.Description>
                            </div>
                            <CloseButton size="sm" onPress={() => onOpenChange(false)} />
                        </div>
                        <div className="grid gap-x-8 gap-y-6 overflow-y-auto p-4 sm:grid-cols-2">
                            {SHORTCUT_SECTIONS.map((section) => (
                                <section key={section.id} aria-labelledby={`shortcuts-${section.id}`}>
                                    <h3 id={`shortcuts-${section.id}`} className="mb-1.5 text-[11px] font-medium text-tertiary">
                                        {t(section.label)}
                                    </h3>
                                    <dl className="flex flex-col">
                                        {section.shortcuts.map((shortcut) => (
                                            <div key={shortcut.id} className="flex min-h-8 items-center justify-between gap-3 border-b border-subtle/60 py-1 last:border-b-0">
                                                <dt className="min-w-0 truncate text-[13px] text-secondary">{t(shortcut.label)}</dt>
                                                <dd className="flex shrink-0 items-center gap-2">
                                                    {shortcut.keys.map((keys, index) => (
                                                        <Fragment key={keys.join(" ")}>
                                                            {index > 0 && <span className="text-[11px] text-placeholder">{t("commands.or")}</span>}
                                                            <ShortcutKeys keys={keys} />
                                                        </Fragment>
                                                    ))}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </section>
                            ))}
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
