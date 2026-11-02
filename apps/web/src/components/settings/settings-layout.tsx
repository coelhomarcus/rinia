import type { ComponentType, ReactNode, SVGProps } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AppIcons } from "@/components/foundations/icons";
import { useAppNavigation } from "@/components/layout/app-shell";
import { useTranslation } from "react-i18next";

export interface SettingsBackLink {
    to: string;
    label: string;
    icon?: ReactNode;
}

/**
 * Linear-style settings page: a narrow centered column with wide margins, the same width on every page. Everything
 * scrolls as one. The back link sits at the top left of the panel, outside the column, so titles line up across pages.
 */
export function SettingsPage({ title, description, aside, back, children }: { title?: string; description?: ReactNode; aside?: ReactNode; back?: SettingsBackLink; children: ReactNode }) {
    const { openNavigation } = useAppNavigation();
    const { t } = useTranslation();
    return (
        <div className="h-full min-h-0 overflow-y-auto">
            {/* Phones have no sidebar, so the page opens it from here. */}
            <div className="flex h-12 items-center gap-1 px-2 select-none md:px-4">
                <span className="md:hidden">
                    <ButtonUtility icon={AppIcons.Menu} color="tertiary" tooltip={t("nav.expand")} onClick={openNavigation} />
                </span>
                {back && (
                    <Link to={back.to} className="flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-[13px] text-secondary hover:bg-layer-transparent-hover hover:text-primary">
                        <ChevronLeft className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                        {back.icon}
                        <span className="truncate">{back.label}</span>
                    </Link>
                )}
            </div>
            <div className="px-4 pt-3 pb-24 md:px-8">
                <div className="mx-auto w-full max-w-160">
                    {title && <SettingsHeading title={title} description={description} control={aside} />}
                    {children}
                </div>
            </div>
        </div>
    );
}

/**
 * The page title, inset to line up with the text inside the cards below it. Panels that need their own actions next
 * to the title render it themselves.
 */
export function SettingsHeading({ title, description, control }: { title: string; description?: ReactNode; control?: ReactNode }) {
    return (
        <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4">
            <div className="min-w-0 select-none">
                <h1 className="truncate text-display-sm font-semibold tracking-tight text-primary">{title}</h1>
                {description && <p className="mt-1 text-[13px] text-tertiary">{description}</p>}
            </div>
            {control}
        </header>
    );
}

/** A section heading and the card of rows under it. Consecutive groups are spaced like sections. */
export function SettingsGroup({ title, description, action, children }: { title?: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
    return (
        <section className="mt-12 first:mt-0 [header+&]:mt-0">
            {(title || action) && (
                <div className="mb-3 flex min-h-7 items-center justify-between gap-4 px-4">
                    <div className="min-w-0 select-none">
                        {title && <h2 className="text-lg font-medium text-primary">{title}</h2>}
                        {description && <p className="mt-0.5 text-[13px] text-tertiary">{description}</p>}
                    </div>
                    {action}
                </div>
            )}
            <SettingsCard>{children}</SettingsCard>
        </section>
    );
}

/** The rounded card itself, with a thin divider between rows. */
export function SettingsCard({ children }: { children: ReactNode }) {
    return <div className="rounded-lg border border-subtle bg-layer-1 px-4 [&>*+*]:border-t [&>*+*]:border-subtle">{children}</div>;
}

/** Label and muted hint, as every row shows them on its left. */
function RowText({ title, description }: { title: ReactNode; description?: ReactNode }) {
    return (
        <div className="min-w-0 select-none">
            <h3 className="text-md font-medium text-primary">{title}</h3>
            {description && <p className="text-xs text-tertiary">{description}</p>}
        </div>
    );
}

/**
 * One row inside a SettingsGroup: label and hint on the left, the control on the right. `stacked` puts the control
 * under the label at full width, for values worth reading whole, such as commands and long forms.
 */
export function SettingsControl({ title, description, stacked = false, children }: { title: string; description?: ReactNode; stacked?: boolean; children: ReactNode }) {
    if (stacked)
        return (
            <div className="flex flex-col gap-3 py-4">
                <RowText title={title} description={description} />
                <div className="flex w-full items-start gap-2">{children}</div>
            </div>
        );
    return (
        <div className="flex min-h-15 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
            <RowText title={title} description={description} />
            <div className="flex shrink-0 items-center gap-2">{children}</div>
        </div>
    );
}

/**
 * A row for one item in a list, such as a member, a state or a token: something to recognize it by, its name and a
 * detail, then whatever acts on it. `dense` suits one-line items such as states and labels.
 */
export function SettingsItemRow({ leading, title, description, dense = false, children }: { leading?: ReactNode; title: ReactNode; description?: ReactNode; dense?: boolean; children?: ReactNode }) {
    return (
        <div className={`group flex items-center gap-3 ${dense ? "min-h-11 py-2" : "min-h-15 py-3"}`}>
            {leading}
            <div className="min-w-0 flex-1">
                <div className="truncate text-md font-medium text-primary">{title}</div>
                {description && <div className="truncate text-xs text-tertiary">{description}</div>}
            </div>
            {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
        </div>
    );
}

/** Hover-revealed actions for a SettingsItemRow. */
export function SettingsRowActions({ children }: { children: ReactNode }) {
    return <div className="flex items-center gap-1 opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 md:opacity-0">{children}</div>;
}

/** The square an icon sits on at the start of a row. */
export function SettingsRowIcon({ icon: Icon }: { icon: ComponentType<SVGProps<SVGSVGElement>> }) {
    return (
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-layer-2 text-secondary">
            <Icon className="size-4" />
        </span>
    );
}

/** A row that opens another settings page, with an optional summary value before the chevron. */
export function SettingsLinkRow({ to, icon, title, description, value }: { to: string; icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; description: string; value?: ReactNode }) {
    return (
        <Link to={to} className="group -mx-4 flex min-h-15 items-center gap-3 px-4 py-3 select-none first:rounded-t-lg last:rounded-b-lg hover:bg-layer-transparent-hover">
            <SettingsRowIcon icon={icon} />
            <span className="min-w-0 flex-1">
                <span className="block text-md font-medium text-primary">{title}</span>
                <span className="block truncate text-xs text-tertiary">{description}</span>
            </span>
            {value !== undefined && <span className="shrink-0 text-[13px] text-tertiary">{value}</span>}
            <ChevronRight className="size-4 shrink-0 text-tertiary group-hover:text-secondary" aria-hidden="true" />
        </Link>
    );
}

/** The same height as a `lg` button, so a field and the button beside it line up. */
const settingsFieldBase =
    "h-8 w-full rounded-md border border-subtle bg-transparent px-3 text-[13px] text-primary outline-none placeholder:text-placeholder focus-visible:border-accent-strong disabled:text-tertiary";

/** Text input sized for the right side of a settings row. */
export const settingsFieldClass = `${settingsFieldBase} sm:w-56`;

/** Text input that fills a stacked row, next to at most a button. */
export const settingsWideFieldClass = `${settingsFieldBase} min-w-0 flex-1`;
