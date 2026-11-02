import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cx } from "@/utils/cx";

/**
 * Stands in for rich text this editor cannot read, such as a block a newer version added. It shows the saved content
 * as it is instead of an empty editor, and nothing here can save over it.
 */
export function UnsupportedContent({ content, unsupported, className }: { content: unknown; unsupported: string[]; className?: string }) {
    const { t } = useTranslation();
    return (
        <div role="note" className={cx("rounded-lg border border-fg-warning-primary/40 bg-warning-primary/10 p-3 text-[13px] leading-5", className)}>
            <p className="flex items-center gap-2 font-medium text-primary">
                <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-warning-primary" />
                {t("editor.unsupportedTitle")}
            </p>
            <p className="mt-1 text-secondary">{unsupported.length ? t("editor.unsupportedBlocks", { types: unsupported.join(", ") }) : t("editor.unsupportedStructure")}</p>
            <details className="mt-2">
                <summary className="cursor-pointer text-xs text-tertiary select-none">{t("editor.showSavedContent")}</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-subtle bg-layer-1 p-2 font-mono text-xs whitespace-pre-wrap">{JSON.stringify(content, null, 2)}</pre>
            </details>
        </div>
    );
}
