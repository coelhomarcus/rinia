import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/base/feedback/alert";
import { CheckboxBase } from "@/components/base/checkbox/checkbox";
import { ModalDialog } from "@/components/overlay/modal-dialog";
import { ApiError } from "@/lib/api-client";
import { cx } from "@/utils/cx";
import type { Category } from "../api";
import { LABEL_PRESET_GROUPS, type LabelPreset } from "../lib/label-presets";

/** Offers the ready-made labels; the ones the project already has are shown checked and cannot be picked again. */
export function LabelPresetsDialog({ trigger, existing, onCreate }: { trigger: ReactNode; existing: Category[]; onCreate: (preset: LabelPreset) => Promise<unknown> }) {
    const { t } = useTranslation();
    return (
        <ModalDialog trigger={trigger} title={t("settings.labelPresets")} description={t("settings.labelPresetsDescription")}>
            {({ close }) => <PresetPicker existing={existing} onCreate={onCreate} close={close} />}
        </ModalDialog>
    );
}

function PresetPicker({ existing, onCreate, close }: { existing: Category[]; onCreate: (preset: LabelPreset) => Promise<unknown>; close: () => void }) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const taken = new Set(existing.map((category) => category.name.toLowerCase()));
    const toggle = (name: string, on: boolean) =>
        setSelected((current) => {
            const next = new Set(current);
            if (on) next.add(name);
            else next.delete(name);
            return next;
        });

    const add = async () => {
        setPending(true);
        setError(null);
        // One at a time: the server checks each name against the labels already saved. A failure keeps the dialog open
        // with only the labels that were not created still selected.
        for (const group of LABEL_PRESET_GROUPS) {
            for (const preset of group.presets) {
                if (!selected.has(preset.name)) continue;
                try {
                    await onCreate(preset);
                    setSelected((current) => {
                        const next = new Set(current);
                        next.delete(preset.name);
                        return next;
                    });
                } catch (reason) {
                    setError(reason instanceof ApiError ? reason.message : t("settings.couldNotAddPresets"));
                    setPending(false);
                    return;
                }
            }
        }
        setPending(false);
        close();
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="-mx-1 flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-1">
                {LABEL_PRESET_GROUPS.map((group) => (
                    <section key={group.id}>
                        <h3 className="mb-2 px-1 text-xs font-medium text-tertiary select-none">{t(`settings.labelPresetGroups.${group.id}`)}</h3>
                        <div className="rounded-lg border border-subtle bg-layer-1 px-3 [&>*+*]:border-t [&>*+*]:border-subtle">
                            {group.presets.map((preset) => {
                                const exists = taken.has(preset.name);
                                const checked = exists || selected.has(preset.name);
                                return (
                                    <button
                                        key={preset.name}
                                        type="button"
                                        role="checkbox"
                                        aria-checked={checked}
                                        disabled={exists || pending}
                                        onClick={() => toggle(preset.name, !checked)}
                                        className={cx("flex min-h-11 w-full items-center gap-3 py-2 text-left outline-accent-strong focus-visible:outline-2 focus-visible:-outline-offset-2", exists && "cursor-not-allowed opacity-60")}
                                    >
                                        <CheckboxBase isSelected={checked} isDisabled={exists} />
                                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: preset.color }} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-md font-medium text-primary">{preset.name}</span>
                                            <span className="block truncate text-xs text-tertiary">{t(`settings.labelPresetHints.${preset.name}`)}</span>
                                        </span>
                                        {exists && <span className="shrink-0 text-xs text-tertiary">{t("settings.labelPresetExists")}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex justify-end gap-2 border-t border-subtle pt-3">
                <Button color="secondary" isDisabled={pending} onClick={close}>
                    {t("common.cancel")}
                </Button>
                <Button isLoading={pending} isDisabled={selected.size === 0} onClick={add}>
                    {selected.size === 0 ? t("settings.addNoLabels") : t("settings.addSelectedLabels", { count: selected.size })}
                </Button>
            </div>
        </div>
    );
}
