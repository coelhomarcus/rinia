import { Suspense, createContext, useContext, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Outlet, useLocation } from "react-router";
import { NetworkStatus } from "@/components/feedback/network-status";
import { WorkspaceLoadingFallback } from "@/components/feedback/workspace-loading-fallback";
import { AppCommandsProvider } from "@/features/commands/app-commands";
import { AppBadge } from "@/features/pwa/app-badge";
import { RealtimeProvider } from "@/features/realtime/realtime-provider";
import { Sidebar } from "./sidebar";
import { useTranslation } from "react-i18next";

/** Opens the navigation drawer on small screens, where the sidebar is not shown. */
const NavigationContext = createContext({ openNavigation: () => {} });
export const useAppNavigation = () => useContext(NavigationContext);
const readWidth = () => {
    const value = Number(localStorage.getItem("rinia-sidebar-width") ?? 244);
    return Number.isFinite(value) ? Math.max(220, Math.min(360, value)) : 244;
};

export const AppShell = () => {
    const location = useLocation();
    const { t } = useTranslation();
    const [width, setWidth] = useState(readWidth);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [resizing, setResizing] = useState(false);
    useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname]);
    useEffect(() => {
        localStorage.setItem("rinia-sidebar-width", String(width));
    }, [width]);
    const openNavigation = () => setMobileOpen(true);
    return (
        <NavigationContext.Provider value={{ openNavigation }}>
            <AppCommandsProvider>
            {/* While resizing, nothing on the page can be selected and the resize cursor holds wherever the pointer goes. */}
            <div className={`relative flex h-dvh min-h-0 overflow-hidden bg-canvas p-safe text-primary ${resizing ? "cursor-ew-resize select-none" : ""}`}>
                <aside
                    className={`relative hidden h-full shrink-0 overflow-hidden md:flex ${resizing ? "" : "transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"}`}
                    style={{ width }}
                    aria-label={t("nav.navigation")}
                >
                    <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ width }}>
                        <div className="min-h-0 flex-1">
                            <Sidebar />
                        </div>
                    </div>
                </aside>
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col p-2">
                    <SidebarResizeHandle
                        width={width}
                        resizing={resizing}
                        onResizeStart={() => setResizing(true)}
                        onResize={(next) => setWidth(Math.max(220, Math.min(360, next)))}
                        onResizeEnd={() => setResizing(false)}
                    />
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1" data-app-content>
                        {/* No mobile bar of its own: every page header carries the menu button that opens the navigation. */}
                        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" id="main-content">
                            <Suspense fallback={<WorkspaceLoadingFallback />}>
                                <Outlet />
                            </Suspense>
                        </main>
                    </div>
                </div>
                <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
                    <Dialog.Portal>
                        <Dialog.Backdrop data-print-hide className="fixed inset-0 z-40 bg-backdrop transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
                        <Dialog.Popup data-print-hide className="fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col border-r border-subtle bg-canvas pt-safe pb-safe pl-safe outline-none transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full">
                            <Dialog.Title className="sr-only">{t("nav.navigation")}</Dialog.Title>
                            <Sidebar onNavigate={() => setMobileOpen(false)} />
                        </Dialog.Popup>
                    </Dialog.Portal>
                </Dialog.Root>
                <NetworkStatus />
                <RealtimeProvider />
                <AppBadge />
            </div>
            </AppCommandsProvider>
        </NavigationContext.Provider>
    );
};

/**
 * Sits on the content panel's left border, as in Linear: drag to resize the sidebar (arrow keys, Home and End
 * work too). A tooltip follows the pointer while hovering.
 */
function SidebarResizeHandle({
    width,
    resizing,
    onResizeStart,
    onResize,
    onResizeEnd,
}: {
    width: number;
    resizing: boolean;
    onResizeStart: () => void;
    onResize: (width: number) => void;
    onResizeEnd: () => void;
}) {
    const { t } = useTranslation();
    const drag = useRef<{ x: number; width: number; moved: boolean } | null>(null);
    const [hint, setHint] = useState<{ x: number; y: number } | null>(null);
    const hintTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(hintTimer.current), []);

    function showHint(event: PointerEvent<HTMLDivElement>) {
        const point = { x: event.clientX, y: event.clientY };
        if (hint) setHint(point);
        else {
            window.clearTimeout(hintTimer.current);
            hintTimer.current = window.setTimeout(() => setHint(point), 400);
        }
    }

    function finishDrag() {
        if (drag.current?.moved) onResizeEnd();
        drag.current = null;
    }

    function hideHint() {
        window.clearTimeout(hintTimer.current);
        setHint(null);
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        onResize(event.key === "Home" ? 220 : event.key === "End" ? 360 : width + (event.key === "ArrowRight" ? 10 : -10));
    }

    return (
        <>
            <div
                role="separator"
                aria-label={t("nav.resizeSidebar")}
                aria-orientation="vertical"
                aria-valuenow={width}
                aria-valuemin={220}
                aria-valuemax={360}
                tabIndex={0}
                data-print-hide
                className="group absolute top-2 bottom-2 left-1 z-20 hidden w-2 cursor-ew-resize touch-none outline-none md:block"
                onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    // No text selection may start from here, and any selection left on the page is cleared.
                    event.preventDefault();
                    document.getSelection()?.removeAllRanges();
                    drag.current = { x: event.clientX, width, moved: false };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    hideHint();
                }}
                onPointerMove={(event) => {
                    const current = drag.current;
                    // A release the handle never heard about (outside the window) leaves no button pressed.
                    if (current && event.buttons === 0) return finishDrag();
                    if (!current) return showHint(event);
                    const delta = event.clientX - current.x;
                    if (!current.moved && Math.abs(delta) < 3) return;
                    if (!current.moved) {
                        current.moved = true;
                        onResizeStart();
                    }
                    onResize(current.width + delta);
                }}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                // Capture is lost on every release, including one far away or outside the window, so this always ends the drag.
                onLostPointerCapture={finishDrag}
                onPointerLeave={hideHint}
                onKeyDown={onKeyDown}
            >
                <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-[opacity,color] duration-150 ${
                        resizing ? "text-accent-primary opacity-100" : "text-[var(--border-strong-1)] opacity-0 group-hover:opacity-100 group-focus-visible:text-accent-primary group-focus-visible:opacity-100"
                    }`}
                    // Fades in and out at both ends so the highlight blends into the panel's rounded corners.
                    style={{ background: "linear-gradient(to bottom, transparent, currentColor 18%, currentColor 82%, transparent)" }}
                />
            </div>
            {hint && !resizing && (
                <div
                    role="tooltip"
                    className="pointer-events-none fixed z-50 flex flex-col gap-1 rounded-md border border-subtle bg-layer-2 px-2.5 py-2 text-[12px] text-secondary shadow-overlay-200"
                    style={{ left: hint.x + 14, top: hint.y + 10 }}
                >
                    <span><strong className="font-medium text-primary">{t("nav.resizeDrag")}</strong> {t("nav.resizeDragHint")}</span>
                </div>
            )}
        </>
    );
}
