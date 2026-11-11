import { useMemo } from "react";
import { Check, Copy } from "lucide-react";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { IconSwap } from "@/components/base/icon-swap";
import { useClipboard } from "@/hooks/use-clipboard";
import { cx } from "@/utils/cx";
import { useTranslation } from "react-i18next";
import { highlight, type SnippetLanguage } from "../highlight";
import "./copy-field.css";

/**
 * A value to paste somewhere else, such as an address, a command or a config file, with its copy button inside the
 * field so the two always share a height. Code in a known `language` is highlighted with twinkleplop.
 */
export function CopyField({ value, label, language = "text" }: { value: string; label: string; language?: SnippetLanguage }) {
    const { t } = useTranslation();
    const { copied, copy } = useClipboard();
    const html = useMemo(() => highlight(value, language), [language, value]);
    const multiline = value.includes("\n");
    const text = cx(
        "min-w-0 flex-1 px-3 py-[5px] font-mono text-[12px] leading-5 text-primary select-all",
        html && "twinkleplop",
        multiline ? "py-2 whitespace-pre-wrap break-all" : "truncate",
    );
    return (
        <div className="flex w-full min-w-0 items-start rounded-lg border border-subtle bg-layer-2">
            {html ? <code aria-label={label} className={text} dangerouslySetInnerHTML={{ __html: html }} /> : <code aria-label={label} className={text}>{value}</code>}
            <ButtonUtility icon={<IconSwap on={Boolean(copied)} onIcon={<Check className="size-4" />} offIcon={<Copy className="size-4" />} />} color="tertiary" className={cx("shrink-0", copied && "text-success-primary hover:text-success-primary", multiline ? "m-1.5" : "m-[3px]")} tooltip={copied ? t("integrations.copied") : t("integrations.copy")} onClick={() => void copy(value)} />
        </div>
    );
}
