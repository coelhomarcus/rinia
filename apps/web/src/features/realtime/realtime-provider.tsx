import { useEffect } from "react";
import type { RealtimeEvent } from "@rinia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { AUTH_QUERY_KEY } from "@/features/auth/api";
import { TAB_ID } from "@/lib/tab-id";
import { invalidateForEvents } from "./invalidate";
import { realtimeClient } from "./realtime-client";
import { remoteIssueChanges } from "./remote-issue-changes";

/** Events that arrive together are applied together, so a bulk change refetches each list once. */
const BATCH_MS = 50;

/** Keeps the realtime socket open while someone is signed in, and turns its events into cache invalidations. */
export function RealtimeProvider() {
    const client = useQueryClient();

    useEffect(() => {
        let batch: RealtimeEvent[] = [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        const offEvent = realtimeClient.on("event", (event) => {
            // This tab already updated its cache when it made the change.
            if (event.clientId === TAB_ID) return;
            batch.push(event);
            timer ??= setTimeout(() => {
                const events = batch;
                batch = [];
                timer = undefined;
                // Recorded before the refetch, so the tint is on the card while it glides to its new place.
                remoteIssueChanges.note(events);
                invalidateForEvents(client, events);
            }, BATCH_MS);
        });
        // Events sent while the socket was down are lost, so everything on screen loads again.
        const offResync = realtimeClient.on("resync", () => void client.invalidateQueries());
        const offUnauthorized = realtimeClient.on("unauthorized", () => void client.invalidateQueries({ queryKey: AUTH_QUERY_KEY }));
        realtimeClient.start();
        return () => {
            clearTimeout(timer);
            offEvent();
            offResync();
            offUnauthorized();
            realtimeClient.stop();
        };
    }, [client]);

    return null;
}
