import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { issueViewTransitionStyle } from "@/lib/view-transition";

/** The title as an auto-growing field: Enter leaves it, and leaving it saves. */
export function IssueTitle({ identifier, value, error, onChange, onBlur, readOnly = false }: { identifier: string; value: string; error: string | null; onChange: (value: string) => void; onBlur: () => void; readOnly?: boolean }) {
    const { t } = useTranslation();
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        element.style.height = "auto";
        element.style.height = `${element.scrollHeight}px`;
    }, [value]);
    return (
        <>
            <textarea
                ref={ref}
                rows={1}
                value={value}
                readOnly={readOnly}
                placeholder={t("issue.issueTitle")}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                    }
                }}
                onBlur={onBlur}
                className="block w-full resize-none overflow-hidden bg-transparent text-[26px] leading-8 font-semibold tracking-tight text-primary outline-none placeholder:text-placeholder"
                style={issueViewTransitionStyle(identifier, "title")}
                aria-label={t("issue.title")}
            />
            {error && <p role="alert" className="mt-1 text-xs text-danger-primary">{error}</p>}
        </>
    );
}
