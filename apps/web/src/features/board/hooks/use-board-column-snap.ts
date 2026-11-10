import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { BOARD_COLUMN_PARAM, nearestColumnIndex, resolveBoardColumnId, writeColumnParam } from "../column-scroll";

function snapPadding(scroller: HTMLElement) {
    return Number.parseFloat(getComputedStyle(scroller).scrollPaddingInlineStart || "0") || 0;
}

function columnNodes(scroller: HTMLElement) {
    return [...scroller.querySelectorAll<HTMLElement>("[data-board-column]")];
}

function columnIdAtScroll(scroller: HTMLElement) {
    const columns = columnNodes(scroller);
    const origin = scroller.getBoundingClientRect().left + snapPadding(scroller);
    const index = nearestColumnIndex(
        origin,
        columns.map((column) => column.getBoundingClientRect().left),
    );
    return columns[index]?.dataset.boardColumn ?? null;
}

/**
 * On compact boards, the snapped column lives in `?column=` so a trip into an issue and back
 * restores the same column. Scroll and the address keep each other in sync.
 */
export function useBoardColumnSnap(scrollerRef: RefObject<HTMLElement | null>, columnIds: string[], enabled: boolean) {
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get(BOARD_COLUMN_PARAM);
    const activeId = enabled ? resolveBoardColumnId(requested, columnIds) : null;
    const [snappedId, setSnappedId] = useState<string | null>(null);
    const targetId = useRef<string | null>(null);

    const writeActive = useCallback(
        (columnId: string) => {
            setSearchParams((current) => writeColumnParam(current, columnId), { replace: true });
        },
        [setSearchParams],
    );

    const scrollToColumn = useCallback(
        (columnId: string, behavior: ScrollBehavior = "auto") => {
            const scroller = scrollerRef.current;
            if (!scroller) return;
            const column = scroller.querySelector<HTMLElement>(`[data-board-column="${CSS.escape(columnId)}"]`);
            if (!column) return;
            targetId.current = columnId;
            setSnappedId(columnId);
            scroller.scrollTo({ left: column.offsetLeft - snapPadding(scroller), behavior });
        },
        [scrollerRef],
    );

    const selectColumn = useCallback(
        (columnId: string, behavior: ScrollBehavior = "smooth") => {
            writeActive(columnId);
            scrollToColumn(columnId, behavior);
        },
        [scrollToColumn, writeActive],
    );

    useLayoutEffect(() => {
        if (!enabled || !activeId) return;
        if (requested !== activeId) writeActive(activeId);
        const scroller = scrollerRef.current;
        if (!scroller) return;
        if (columnIdAtScroll(scroller) === activeId) {
            setSnappedId(activeId);
            return;
        }
        scrollToColumn(activeId, "auto");
    }, [activeId, columnIds, enabled, requested, scrollToColumn, scrollerRef, writeActive]);

    useLayoutEffect(() => {
        const scroller = scrollerRef.current;
        if (!enabled || !scroller) return;

        const read = () => {
            if (targetId.current) {
                setSnappedId(targetId.current);
                return;
            }
            const columnId = columnIdAtScroll(scroller);
            if (columnId) setSnappedId(columnId);
        };

        const settle = () => {
            const columnId = columnIdAtScroll(scroller);
            if (targetId.current) {
                if (columnId !== targetId.current) return;
                targetId.current = null;
            }
            if (!columnId) return;
            setSnappedId(columnId);
            writeActive(columnId);
        };

        let settleTimer = 0;
        const onScroll = () => {
            read();
            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(settle, 80);
        };

        scroller.addEventListener("scroll", onScroll, { passive: true });
        scroller.addEventListener("scrollend", settle);
        return () => {
            window.clearTimeout(settleTimer);
            scroller.removeEventListener("scroll", onScroll);
            scroller.removeEventListener("scrollend", settle);
        };
    }, [columnIds, enabled, scrollerRef, writeActive]);

    return { activeId: enabled ? (snappedId ?? activeId) : null, selectColumn };
}
