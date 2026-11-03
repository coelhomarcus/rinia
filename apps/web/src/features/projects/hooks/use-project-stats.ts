import { useQuery } from "@tanstack/react-query";
import { PROJECT_STATS_DEFAULT_DAYS } from "@rinia/shared";
import { getProjectStats } from "../api";
import { projectQueryKey } from "./use-project";

const viewerTimeZone = () => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
};

/** Activity numbers for the project overview: open issues, streaks, the contribution map and the last 30 days. */
export function useProjectStats(projectId: string, days = PROJECT_STATS_DEFAULT_DAYS) {
    const timeZone = viewerTimeZone();
    return useQuery({
        queryKey: [...projectQueryKey(projectId), "stats", days, timeZone] as const,
        queryFn: () => getProjectStats(projectId, days, timeZone),
        enabled: !!projectId,
        staleTime: 60_000,
    });
}
