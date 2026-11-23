import { MAX_PROMPT_INSTRUCTIONS } from "@rinia/shared";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

interface PromptInstructionsFieldProps {
    /** The text set at this level. Empty means it inherits `fallback`. */
    value: string;
    onChange: (value: string) => void;
    /** What applies while `value` is empty: the project's instructions for an issue, Rinia's default for a project. */
    fallback: string;
    /** Names where `fallback` comes from, as in "Using Rinia's default". */
    fallbackLabel: string;
    /** Names the button that empties the field. Defaults to "Restore default". */
    restoreLabel?: string;
    disabled?: boolean;
    /** "bare" fills a settings card edge to edge, like the project description; "boxed" draws its own field. */
    variant?: "boxed" | "bare";
    className?: string;
}

/**
 * The Instructions block of "Copy with prompt", written as-is and never translated. Empty inherits the next level up,
 * shown as the placeholder; "Customize" starts from that text and "Restore default" empties the field again.
 */
export function PromptInstructionsField({ value, onChange, fallback, fallbackLabel, restoreLabel, disabled, variant = "boxed", className }: PromptInstructionsFieldProps) {
    const { t } = useTranslation();
    const inherits = !value.trim();
    const bare = variant === "bare";
    return (
        <div className={cx("flex flex-col", bare ? "" : "gap-2", className)}>
            <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={10}
                maxLength={MAX_PROMPT_INSTRUCTIONS}
                spellCheck={false}
                disabled={disabled}
                aria-label={t("issue.promptInstructionsTitle")}
                placeholder={fallback}
                className={cx(
                    "block min-h-40 resize-y font-mono text-xs leading-5 text-primary outline-none placeholder:text-placeholder disabled:text-tertiary",
                    bare ? "-mx-4 w-[calc(100%+2rem)] bg-transparent px-4 py-3.5" : "w-full rounded-lg bg-surface-1 px-3 py-2.5 ring-1 ring-strong ring-inset focus:ring-accent-strong",
                )}
            />
            <div className={cx("flex min-h-7 flex-wrap items-center justify-between gap-2", bare && "-mx-4 border-t border-subtle px-4 py-2.5")}>
                <p className="text-xs text-tertiary" role="status">{inherits ? fallbackLabel : t("issue.promptInstructionsCustom")}</p>
                {!disabled && (inherits ? (
                    <Button type="button" size="sm" color="secondary" onClick={() => onChange(fallback)}>{t("issue.customizePromptInstructions")}</Button>
                ) : (
                    <Button type="button" size="sm" color="secondary" onClick={() => onChange("")}>{restoreLabel ?? t("issue.restorePromptInstructions")}</Button>
                ))}
            </div>
        </div>
    );
}
