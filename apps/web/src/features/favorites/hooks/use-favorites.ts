import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/feedback/toaster";
import { ApiError } from "@/lib/api-client";
import { type Favorite, type FavoriteTarget, createFavorite, deleteFavorite, listFavorites, restoreFavorite } from "../api";

export const FAVORITES_QUERY_KEY = ["favorites"] as const;

export function useFavorites() {
    return useQuery({ queryKey: FAVORITES_QUERY_KEY, queryFn: listFavorites });
}

export function matchesTarget(favorite: Favorite, target: FavoriteTarget) {
    if (favorite.kind !== target.kind || favorite.projectId !== target.projectId) return false;
    if (target.kind === "document") return favorite.documentId === target.documentId;
    if (target.kind === "issue") return favorite.issueId === target.issueId;
    if (target.kind === "view") return favorite.viewId === target.viewId;
    return true;
}

/** Star state for one target. The star flips immediately; the list refreshes once the server answers. */
export function useFavoriteToggle(target: FavoriteTarget | null) {
    const queryClient = useQueryClient();
    const { data: favorites } = useFavorites();
    const favorite = target ? favorites?.find((candidate) => matchesTarget(candidate, target)) : undefined;
    const remove = useRemoveFavorite();
    const showToast = useToast();
    const { t } = useTranslation();
    const add = useMutation({
        mutationFn: createFavorite,
        onError: (error) => showToast({ tone: "error", title: error instanceof ApiError ? error.message : t("errors.requestFailed") }),
        onSettled: () => queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY }),
    });
    const pendingAdd = add.isPending;
    return {
        active: !!favorite || pendingAdd,
        isPending: remove.isPending || add.isPending,
        toggle() {
            if (!target || remove.isPending || add.isPending) return;
            if (favorite) remove.mutate(favorite.id);
            else add.mutate(target);
        },
    };
}

export function useRemoveFavorite() {
    const queryClient = useQueryClient();
    const showToast = useToast();
    const { t } = useTranslation();
    return useMutation({
        mutationFn: deleteFavorite,
        onMutate: async (favoriteId) => {
            await queryClient.cancelQueries({ queryKey: FAVORITES_QUERY_KEY });
            const previous = queryClient.getQueryData<Favorite[]>(FAVORITES_QUERY_KEY);
            const favorite = previous?.find((item) => item.id === favoriteId);
            queryClient.setQueryData<Favorite[]>(FAVORITES_QUERY_KEY, (current) => current?.filter((item) => item.id !== favoriteId));
            return { favorite, previous };
        },
        onError: (error, _favoriteId, context) => {
            queryClient.setQueryData(FAVORITES_QUERY_KEY, context?.previous);
            showToast({ tone: "error", title: error instanceof ApiError ? error.message : t("errors.requestFailed") });
        },
        onSuccess: ({ deletedAt }, favoriteId, context) => {
            if (!context?.favorite) return;
            showToast({
                title: t("nav.favoriteRemoved"),
                action: {
                    label: t("issue.undo"),
                    onClick: async () => {
                        try {
                            await restoreFavorite(favoriteId, deletedAt);
                            await queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY });
                        } catch {
                            showToast({ tone: "error", title: t("issue.couldNotUndo") });
                        }
                    },
                },
            });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY }),
    });
}

const LEGACY_FAVORITES_KEY = "rinia-favorites";

/** Favorites used to live only in this browser as a list of project ids; move them to the account once. */
export function useMigrateLegacyFavorites() {
    const queryClient = useQueryClient();
    useEffect(() => {
        let ids: unknown;
        try {
            ids = JSON.parse(localStorage.getItem(LEGACY_FAVORITES_KEY) ?? "null");
            localStorage.removeItem(LEGACY_FAVORITES_KEY);
        } catch {
            return;
        }
        if (!Array.isArray(ids) || ids.length === 0) return;
        const projectIds = ids.filter((id): id is string => typeof id === "string");
        void Promise.allSettled(projectIds.map((projectId) => createFavorite({ kind: "project", projectId }))).then(() =>
            queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY }),
        );
    }, [queryClient]);
}
