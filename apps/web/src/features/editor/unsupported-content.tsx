import { useTranslation } from "react-i18next";
import { Alert } from "@/components/base/feedback/alert";

/**
 * Stands in for rich text this editor cannot read, such as a block a newer version added. It shows the saved content
 * as it is instead of an empty editor, and nothing here can save over it.
 */
export function UnsupportedContent({ content, unsupported, className }: { content: unknown; unsupported: string[]; className?: string }) {
    const { t } = useTranslation();
    return (
        <Alert tone="warning" role="note" title={t("editor.unsupportedTitle")} className={className}>
            <p>{unsupported.length ? t("editor.unsupportedBlocks", { types: unsupported.join(", ") }) : t("editor.unsupportedStructure")}</p>
            <details className="mt-2">
                <summary className="cursor-pointer text-xs text-tertiary select-none hover:text-secondary">{t("editor.showSavedContent")}</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-subtle bg-layer-1 p-2 font-mono text-xs whitespace-pre-wrap">{JSON.stringify(content, null, 2)}</pre>
            </details>
        </Alert>
    );
}
