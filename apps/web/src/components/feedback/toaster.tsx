import { type ReactNode, type PointerEvent as ReactPointerEvent, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, X, XCircle } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useTranslation } from "react-i18next";
import { UNMOUNT_AFTER } from "@/components/base/motion";
import { useEntered } from "@/components/base/presence";
import { toastDepth, toastRemaining, toastStackTransform } from "@/components/feedback/toast-stack";

type ToastTone = "success" | "error" | "copy";

export interface ToastInput {
    title: string;
    description?: string;
    tone?: ToastTone;
    /** A button in the toast, such as "Undo". Using it closes the toast. */
    action?: { label: string; onClick: () => void };
}

interface ToastEntry extends ToastInput {
    id: number;
    leaving: boolean;
    duration: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

/** Shows a short-lived message in the bottom-right corner. */
export const useToast = () => useContext(ToastContext);

const VISIBLE_MS = 4000;
/** Toasts with an action stay longer, so there is time to use it. */
const VISIBLE_WITH_ACTION_MS = 10000;
const SWIPE_DISMISS_PX = 72;

type Hold = "hover" | "focus" | "hidden";

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastEntry[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [held, setHeld] = useState(false);
    const nextId = useRef(0);
    const timers = useRef(new Map<number, number>());
    const clock = useRef(new Map<number, { remaining: number; startedAt: number; running: boolean }>());
    const holds = useRef(new Set<Hold>());

    const clearTimer = useCallback((id: number) => {
        const timer = timers.current.get(id);
        if (timer != null) window.clearTimeout(timer);
        timers.current.delete(id);
    }, []);

    const dismiss = useCallback(
        (id: number) => {
            clearTimer(id);
            clock.current.delete(id);
            setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
            window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), UNMOUNT_AFTER);
        },
        [clearTimer],
    );

    const arm = useCallback(
        (id: number) => {
            const entry = clock.current.get(id);
            if (!entry) return;
            clearTimer(id);
            entry.running = true;
            entry.startedAt = Date.now();
            timers.current.set(
                id,
                window.setTimeout(() => dismiss(id), entry.remaining),
            );
        },
        [clearTimer, dismiss],
    );

    const pauseAll = useCallback(() => {
        const now = Date.now();
        for (const [id, entry] of clock.current) {
            if (!entry.running) continue;
            entry.remaining = toastRemaining(entry.remaining, now - entry.startedAt);
            entry.running = false;
            clearTimer(id);
        }
        setHeld(true);
    }, [clearTimer]);

    const resumeAll = useCallback(() => {
        if (holds.current.size > 0) return;
        for (const id of clock.current.keys()) arm(id);
        setHeld(false);
    }, [arm]);

    const hold = useCallback(
        (reason: Hold) => {
            const wasFree = holds.current.size === 0;
            holds.current.add(reason);
            if (reason !== "hidden") setExpanded(true);
            if (wasFree) pauseAll();
        },
        [pauseAll],
    );

    const release = useCallback(
        (reason: Hold) => {
            holds.current.delete(reason);
            if (!holds.current.has("hover") && !holds.current.has("focus")) setExpanded(false);
            if (holds.current.size === 0) resumeAll();
        },
        [resumeAll],
    );

    const show = useCallback(
        (toast: ToastInput) => {
            const id = nextId.current++;
            const duration = toast.action ? VISIBLE_WITH_ACTION_MS : VISIBLE_MS;
            clock.current.set(id, { remaining: duration, startedAt: Date.now(), running: false });
            // Keep at most three on screen; the oldest leaves first.
            setToasts((current) => [...current.filter((entry) => !entry.leaving).slice(-2), { ...toast, id, duration, leaving: false }]);
            if (holds.current.size === 0) arm(id);
            else setHeld(true);
        },
        [arm],
    );

    useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
    useEffect(() => {
        const onVisibility = () => (document.hidden ? hold("hidden") : release("hidden"));
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [hold, release]);
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "z") return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")) return;
            const latest = [...toasts].reverse().find((toast) => toast.action && !toast.leaving);
            if (!latest?.action) return;
            event.preventDefault();
            void Promise.resolve()
                .then(latest.action.onClick)
                .catch(() => undefined);
            dismiss(latest.id);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [dismiss, toasts]);

    return (
        <ToastContext.Provider value={show}>
            {children}
            <div
                aria-live="polite"
                data-print-hide
                className="pointer-events-none fixed right-[calc(1rem+env(safe-area-inset-right,0px))] bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-[80] grid w-[min(22rem,calc(100vw-2rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)))]"
                onMouseEnter={() => hold("hover")}
                onMouseLeave={() => release("hover")}
                onFocusCapture={() => hold("focus")}
                onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) release("focus");
                }}
            >
                {toasts.map((toast, index) => (
                    <ToastCard
                        key={toast.id}
                        toast={toast}
                        depth={toastDepth(index, toasts.length)}
                        expanded={expanded}
                        held={held}
                        onDismiss={() => dismiss(toast.id)}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastCard({ toast, depth, expanded, held, onDismiss }: { toast: ToastEntry; depth: number; expanded: boolean; held: boolean; onDismiss: () => void }) {
    const { t } = useTranslation();
    const reducedMotion = useReducedMotion();
    const entered = useEntered(true);
    const visible = entered && !toast.leaving;
    const Icon = toast.tone === "error" ? XCircle : toast.tone === "copy" ? Copy : CheckCircle2;
    const swipe = useRef<{ x: number; y: number; pointer: number } | null>(null);

    function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
        if (event.pointerType !== "touch") return;
        swipe.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        const start = swipe.current;
        if (!start || start.pointer !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
            swipe.current = null;
            event.currentTarget.style.transform = "";
            event.currentTarget.style.opacity = "";
            return;
        }
        event.currentTarget.style.transform = `translateX(${dx}px)`;
        event.currentTarget.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 180));
    }

    function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
        const start = swipe.current;
        if (!start || start.pointer !== event.pointerId) return;
        swipe.current = null;
        const dx = event.clientX - start.x;
        if (Math.abs(dx) > SWIPE_DISMISS_PX) onDismiss();
        else {
            event.currentTarget.style.transform = "";
            event.currentTarget.style.opacity = "";
        }
    }

    return (
        <div
            className="col-start-1 row-start-1"
            style={{
                zIndex: 20 - depth,
                transform: toastStackTransform(depth, expanded || reducedMotion, visible),
                opacity: visible ? 1 : 0,
                transition: reducedMotion ? "none" : "transform 340ms cubic-bezier(0.22, 1.15, 0.36, 1), opacity 180ms ease-out",
            }}
        >
            <div
                role={toast.tone === "error" ? "alert" : "status"}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-subtle bg-layer-2 px-3.5 py-3 shadow-overlay-200"
            >
                <Icon className={`mt-px size-4 shrink-0 ${toast.tone === "error" ? "text-danger-primary" : "text-tertiary"}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium break-words text-primary">{toast.title}</p>
                    {toast.description && <p className="mt-0.5 text-[13px] text-tertiary">{toast.description}</p>}
                </div>
                {toast.action && (
                    <button
                        type="button"
                        onClick={() => {
                            void Promise.resolve()
                                .then(() => toast.action?.onClick())
                                .catch(() => undefined);
                            onDismiss();
                        }}
                        className="-my-0.5 shrink-0 rounded-md px-2 py-0.5 text-[13px] font-medium text-accent-primary transition-colors duration-150 hover:bg-layer-transparent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
                    >
                        {toast.action.label}
                    </button>
                )}
                <button
                    type="button"
                    aria-label={t("common.close")}
                    onClick={onDismiss}
                    className="grid size-5 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
                >
                    <X className="size-3.5" />
                </button>
                <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-xl bg-layer-3" aria-hidden="true">
                    <div
                        className="h-full origin-left animate-[toast-countdown_linear_forwards] bg-accent-primary motion-reduce:animate-none"
                        style={{ animationDuration: `${toast.duration}ms`, animationPlayState: held || reducedMotion ? "paused" : "running" }}
                    />
                </div>
            </div>
        </div>
    );
}
