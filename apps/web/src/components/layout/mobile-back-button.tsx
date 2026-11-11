import { ChevronLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { cx } from "@/utils/cx";

/**
 * The phone header's way back. It returns to the page the person came from inside the app, or to `fallback` when the
 * page was opened directly (a link, a notification). Hidden from `md` up, where the sidebar is always there.
 */
export function MobileBackButton({ fallback, className }: { fallback: string; className?: string }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    return (
        <button
            type="button"
            aria-label={t("common.back")}
            onClick={() => (location.key !== "default" && window.history.length > 1 ? navigate(-1) : navigate(fallback))}
            className={cx("-ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-secondary hover:bg-layer-transparent-hover md:hidden", className)}
        >
            <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
    );
}
