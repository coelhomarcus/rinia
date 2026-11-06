import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import type { FavoriteTarget } from "../api";
import { useFavoriteToggle } from "../hooks/use-favorites";

export const FAVORITE_COLOR = "#f2c94c";

export function FavoriteStar({ target, className = "" }: { target: FavoriteTarget; className?: string }) {
    const { t } = useTranslation();
    const { active, toggle } = useFavoriteToggle(target);
    return (
        <Tooltip title={active ? t("nav.removeFavorite") : t("nav.addFavorite")}>
            <button
                type="button"
                aria-pressed={active}
                aria-label={active ? t("nav.removeFavorite") : t("nav.addFavorite")}
                className={`flex size-6 shrink-0 items-center justify-center rounded transition-colors duration-150 ${active ? "" : "text-placeholder hover:bg-layer-transparent-hover hover:text-secondary"} ${className}`}
                style={active ? { color: FAVORITE_COLOR } : undefined}
                onClick={toggle}
            >
                <Star className={`size-3.5 transition-transform duration-150 active:scale-90 ${active ? "fill-current" : ""}`} />
            </button>
        </Tooltip>
    );
}
