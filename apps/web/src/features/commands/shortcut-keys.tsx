import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { cx } from "@/utils/cx";
import { formatStep, type ShortcutSequence } from "./shortcuts";

const keycap = "inline-flex h-5 min-w-5 items-center justify-center rounded border border-subtle bg-layer-1 px-1 font-sans text-[11px] leading-none font-medium text-tertiary";

/** The keycaps of a key sequence, such as `G` then `I`, or `⌘ K`. */
export function ShortcutKeys({ keys, className }: { keys: ShortcutSequence; className?: string }) {
    const { t } = useTranslation();
    return (
        <span className={cx("inline-flex shrink-0 items-center gap-1", className)}>
            {keys.map((step, index) => (
                <Fragment key={`${step}-${index}`}>
                    {index > 0 && <span className="text-[11px] text-placeholder">{t("commands.then")}</span>}
                    {formatStep(step).map((cap) => (
                        <kbd key={cap} className={keycap}>
                            {cap}
                        </kbd>
                    ))}
                </Fragment>
            ))}
        </span>
    );
}
