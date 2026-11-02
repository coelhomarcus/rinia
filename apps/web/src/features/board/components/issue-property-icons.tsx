import { useId } from "react";
import { Asterisk, Bot } from "lucide-react";
import type { ActionSource } from "@rinia/shared";
import { cx } from "@/utils/cx";

/**
 * State groups are presentation only; Rinia continues to store project columns. The icon follows the column's
 * name, as Linear's workflow does: dotted backlog, empty to do, half and three-quarter pies for in progress and
 * in review, a check for done and a cross for canceled.
 */
export function StateIcon({ name, color, className = "size-3.5" }: { name: string; color?: string | null; className?: string }) {
    const state = name.toLowerCase();
    const maskId = useId();
    const backlog = state.includes("backlog") || state.includes("fila");
    const done = state.includes("done") || state.includes("complete") || state.includes("conclu");
    const canceled = state.includes("cancel");
    const review = state.includes("review") || state.includes("revis");
    const progress = state.includes("progress") || state.includes("andamento");
    return <svg viewBox="0 0 16 16" fill="none" className={className} style={{ color: color ?? "#60646c" }} aria-hidden="true">
        {backlog ? <g>{Array.from({ length: 15 }, (_, i) => <g key={i} transform={`translate(8 8) rotate(${i * 24 - 90})`}><line x1="5.75" y1="0" x2="6.5" y2="0" stroke="currentColor" strokeWidth="1.21" strokeLinecap="round" /></g>)}</g>
            : done ? <path fillRule="evenodd" clipRule="evenodd" d="M8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15ZM11.3587 6.18828C11.6007 5.85214 11.5244 5.38343 11.1882 5.14141C10.8521 4.89938 10.3834 4.97568 10.1414 5.31183L7.03706 9.62335L5.25956 7.97751C4.95563 7.69609 4.4811 7.71434 4.19968 8.01828C3.91826 8.32221 3.93651 8.79673 4.24045 9.07815L6.64045 11.3004C6.79816 11.4464 7.01095 11.5178 7.22481 11.4963C7.43868 11.4749 7.63307 11.3627 7.75865 11.1883L11.3587 6.18828Z" fill="currentColor" />
            : canceled ? <>
                <mask id={maskId}>
                    <rect width="16" height="16" fill="white" />
                    <path d="M5.75 5.75L10.25 10.25M10.25 5.75L5.75 10.25" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
                </mask>
                <circle cx="8" cy="8" r="7" fill="currentColor" mask={`url(#${maskId})`} />
            </>
            : <>
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                {progress && <path d="M8 4.5A3.5 3.5 0 0 1 8 11.5Z" fill="currentColor" />}
                {review && <path d="M8 8L8 4.5A3.5 3.5 0 1 1 4.5 8Z" fill="currentColor" />}
            </>}
    </svg>;
}

/** Bars filled for each level. They share the 3px rhythm of the "no priority" dashes, so every priority reads at the same weight. */
const PRIORITY_LEVELS: Record<string, number> = { low: 1, medium: 2, high: 3 };
const PRIORITY_BARS = [
    { x: 1.5, y: 9, height: 5.5 },
    { x: 6.5, y: 5.5, height: 9 },
    { x: 11.5, y: 2, height: 12.5 },
];

export function PriorityIcon({ priority, className = "size-3.5" }: { priority: string; className?: string }) {
    if (priority === "none") {
        return (
            <svg viewBox="0 0 16 16" className={cx(className, "shrink-0 text-tertiary")} aria-hidden="true">
                <rect x="1.5" y="7.25" width="3" height="1.5" rx="0.5" fill="currentColor" />
                <rect x="6.5" y="7.25" width="3" height="1.5" rx="0.5" fill="currentColor" />
                <rect x="11.5" y="7.25" width="3" height="1.5" rx="0.5" fill="currentColor" />
            </svg>
        );
    }
    if (priority === "urgent") {
        return (
            <svg viewBox="0 0 16 16" className={cx(className, "shrink-0")} aria-hidden="true">
                <rect x="1" y="1" width="14" height="14" rx="3" fill="#f2994a" />
                <rect x="7.1" y="3.75" width="1.8" height="5.5" rx="0.9" fill="#fff" />
                <circle cx="8" cy="11.6" r="1.05" fill="#fff" />
            </svg>
        );
    }
    const level = PRIORITY_LEVELS[priority] ?? 1;
    return (
        <svg viewBox="0 0 16 16" className={cx(className, "shrink-0")} style={{ color: `var(--priority-${priority})` }} aria-hidden="true">
            {PRIORITY_BARS.map((bar, index) => (
                <rect key={bar.x} x={bar.x} y={bar.y} width="3" height={bar.height} rx="1" fill="currentColor" fillOpacity={index < level ? 1 : 0.25} />
            ))}
        </svg>
    );
}

export function IssueAvatar({ name, avatarUrl, className }: { name: string; avatarUrl?: string | null; className?: string }) {
    return <span title={name} className={cx("inline-flex size-[18px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] text-white outline-1 -outline-offset-1 outline-border-primary", className)} style={{ backgroundColor: "#92346f" }}>
        {avatarUrl ? <img src={avatarUrl} alt={name} className="size-full object-cover" /> : name.charAt(0).toUpperCase()}
    </span>;
}

/** What a change made through a tool is called: the tools Rinia knows by name, otherwise what the tool called itself. */
export function sourceLabel(source: ActionSource) {
    if (source.client?.startsWith("claude-code")) return "Claude Code";
    return source.client ?? "MCP";
}

/** The tool behind a change, as a round avatar: the Claude mark for Claude Code, a bot for any other tool. */
export function SourceAvatar({ source, className }: { source: ActionSource; className?: string }) {
    const claude = source.client?.startsWith("claude-code");
    const Icon = claude ? Asterisk : Bot;
    return <span title={sourceLabel(source)} className={cx("inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-white outline-1 -outline-offset-1 outline-border-primary", className)} style={{ backgroundColor: claude ? "#d97757" : "#6b7280" }}>
        <Icon className="size-[65%]" strokeWidth={2.5} aria-hidden="true" />
    </span>;
}

/**
 * The person who made a change. When a tool made it for them, their avatar and the tool's overlap as a group, so the
 * feed shows both who it was for and what did the work.
 */
export function IssueAvatarGroup({ name, avatarUrl, source, className }: { name: string; avatarUrl?: string | null; source?: ActionSource | null; className?: string }) {
    if (!source) return <IssueAvatar name={name} avatarUrl={avatarUrl} className={className} />;
    const ring = "ring-2 ring-[var(--bg-surface-1)]";
    return (
        <span className="inline-flex shrink-0 items-center -space-x-1.5">
            <IssueAvatar name={name} avatarUrl={avatarUrl} className={cx(className, ring)} />
            <SourceAvatar source={source} className={cx(className, ring)} />
        </span>
    );
}
