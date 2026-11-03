import { useQuery } from "@tanstack/react-query";
import { getProjectStats } from "../api";
import { projectQueryKey } from "./use-project";

const viewerTimeZone = () => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
};

/** Activity numbers for the project overview, from the day the project was created: open issues, streaks and charts. */
export function useProjectStats(projectId: string) {
    const timeZone = viewerTimeZone();
    return useQuery({
        queryKey: [...projectQueryKey(projectId), "stats", timeZone] as const,
        queryFn: () => getProjectStats(projectId, timeZone),
        enabled: !!projectId,
        staleTime: 60_000,
    });
}
