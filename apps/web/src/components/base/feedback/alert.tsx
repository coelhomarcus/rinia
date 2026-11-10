import type { ComponentProps, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cx } from "@/utils/cx";

export type AlertTone = "error" | "success" | "warning" | "info";

const icons = { error: AlertCircle, success: CheckCircle2, warning: TriangleAlert, info: Info } satisfies Record<AlertTone, typeof AlertCircle>;

/** Only the icon carries the tone. The text stays in the neutral palette so a notice reads like the page around it. */
const iconTone: Record<AlertTone, string> = {
    error: "text-danger-primary",
    success: "text-success-primary",
    warning: "text-warning-primary",
    info: "text-tertiary",
};

/**
 * A message about the form or panel it sits in: a neutral card on any surface, the tone in its icon, an optional title
 * in the primary text, and actions at the end. It eases in when it appears. Errors are announced at once; the other
 * tones politely.
 */
export const Alert = ({
    tone = "info",
    title,
    actions,
    children,
    className,
    ...props
}: Omit<ComponentProps<"div">, "title"> & { tone?: AlertTone; title?: ReactNode; actions?: ReactNode; children?: ReactNode }) => {
    const Icon = icons[tone];
    return (
        <div
            role={tone === "error" ? "alert" : "status"}
            {...props}
            className={cx(
                "animate-enter flex flex-wrap items-start gap-x-2.5 gap-y-2 rounded-lg border border-subtle bg-layer-transparent-hover px-3 py-2.5 text-[13px] leading-5 text-secondary",
                className,
            )}
        >
            <Icon className={cx("mt-0.5 size-4 shrink-0", iconTone[tone])} aria-hidden="true" />
            <div className="min-w-0 flex-1 basis-48">
                {title && <p className="font-medium text-primary">{title}</p>}
                {children}
            </div>
            {actions && <div className="ml-auto flex shrink-0 items-center gap-2 self-center">{actions}</div>}
        </div>
    );
};

/**
 * One line of feedback next to the thing it is about, such as a field that did not save or a change that has not
 * synced: a small tinted icon and secondary text, without a card around it.
 */
export const InlineNotice = ({ tone = "info", children, className, ...props }: ComponentProps<"span"> & { tone?: AlertTone; children: ReactNode }) => {
    const Icon = icons[tone];
    // A span laid out as a block, so it can also sit inside a row's description paragraph.
    return (
        <span role={tone === "error" ? "alert" : "status"} {...props} className={cx("animate-enter flex min-w-0 items-start gap-1.5 text-xs leading-5 text-secondary", className)}>
            <Icon className={cx("mt-0.75 size-3.5 shrink-0", iconTone[tone])} aria-hidden="true" />
            <span className="min-w-0">{children}</span>
        </span>
    );
};
