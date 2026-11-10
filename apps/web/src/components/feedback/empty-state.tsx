import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import { EmptyIllustration, type EmptyIllustrationName } from "./empty-illustration";

interface EmptyStateProps {
    title: string;
    description?: ReactNode;
    action?: ReactNode;
    illustration?: EmptyIllustrationName;
    /**
     * A dashed frame suits an empty card inside a panel. A state that fills a whole page or list leaves it out:
     * there the frame would run into the panel's own edges.
     */
    framed?: boolean;
    className?: string;
}

export const EmptyState = ({ title, description, action, illustration = "crate", framed = true, className }: EmptyStateProps) => (
    <div
        className={cx(
            "animate-enter flex flex-col items-center justify-center px-5 py-10 text-center",
            framed && "rounded-lg border border-dashed border-subtle",
            className,
        )}
    >
        <EmptyIllustration name={illustration} />
        <p className="text-sm font-semibold text-primary">{title}</p>
        {description && <div className="mt-1 max-w-sm text-sm text-balance text-tertiary">{description}</div>}
        {action && <div className="mt-4">{action}</div>}
    </div>
);
