import { cx } from "@/utils/cx";

/** A pill tab: the issue scopes, saved views, the tabs of My issues, and a project's sections on phones. */
export const pillTab = (active: boolean) =>
    cx(
        "flex h-7 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors",
        active ? "border-strong bg-layer-1-selected text-primary" : "border-subtle text-tertiary hover:bg-layer-transparent-hover hover:text-primary",
    );
