import { useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { SmilePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Collapse } from "@/components/base/collapse";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { cx } from "@/utils/cx";
import type { ReactionGroup } from "../api";

const QUICK_EMOJI = ["👍", "👎", "❤️", "😄", "🎉", "😕", "🚀", "👀"];
const MORE_EMOJI = [
    "😀", "😂", "🙂", "😉", "😍", "🤩", "🤔", "🫡", "😅", "😬", "😮", "😢", "😡", "🥳", "😴", "🤯",
    "🙌", "👏", "🙏", "💪", "👌", "✌️", "🤞", "👋", "🫶", "🤝", "✋", "👉",
    "🔥", "✨", "⭐", "💯", "✅", "❌", "⚠️", "❓", "❗", "💡", "📌", "🎯", "🐛", "🛠️", "🧪", "📈", "🧠", "💬",
    "☕", "🍕", "🌱", "🌈", "⚡", "🏆", "🎁", "🙈",
];
const popupMotion =
    "origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0";
const emojiButton = "grid size-8 place-items-center rounded-md text-[18px] leading-none transition-[background-color,transform] duration-100 hover:bg-layer-2-hover active:scale-90 hover:duration-0";

/** The add-reaction button: the usual emoji in one row, and more behind it. */
export function ReactionPicker({ onPick, className }: { onPick: (emoji: string) => void; className?: string }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [more, setMore] = useState(false);
    const pick = (emoji: string) => {
        onPick(emoji);
        setOpen(false);
    };
    return (
        <Popover.Root
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setMore(false);
            }}
        >
            <Tooltip title={t("issue.addReaction")}>
            <Popover.Trigger
                aria-label={t("issue.addReaction")}
                className={cx("grid size-6 place-items-center rounded-md text-tertiary outline-none transition-colors duration-150 hover:bg-layer-transparent-hover hover:text-primary focus-visible:bg-layer-transparent-hover data-[popup-open]:bg-layer-transparent-hover data-[popup-open]:text-primary hover:duration-0 data-[popup-open]:duration-0", className)}
            >
                <SmilePlus className="size-3.5" />
            </Popover.Trigger>
            </Tooltip>
            <Popover.Portal>
                <Popover.Positioner side="top" align="end" sideOffset={6} collisionPadding={12} className="z-50">
                    <Popover.Popup className={cx("w-[17.5rem] p-1.5", overlayChrome.popup, popupMotion)}>
                        <Popover.Title className="sr-only">{t("issue.addReaction")}</Popover.Title>
                        <div className="flex items-center justify-between">
                            {QUICK_EMOJI.map((emoji) => (
                                <button key={emoji} type="button" aria-label={emoji} className={emojiButton} onClick={() => pick(emoji)}>
                                    {emoji}
                                </button>
                            ))}
                        </div>
                        <Collapse open={more}>
                            <div className="mt-1.5 grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto border-t border-subtle pt-1.5">
                                {MORE_EMOJI.map((emoji) => (
                                    <button key={emoji} type="button" aria-label={emoji} className={emojiButton} onClick={() => pick(emoji)}>
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </Collapse>
                        {!more && (
                            <button type="button" onClick={() => setMore(true)} className="mt-1 flex h-7 w-full items-center justify-center rounded text-[12px] text-tertiary transition-colors duration-100 hover:bg-layer-2-hover hover:text-primary">
                                {t("issue.moreEmoji")}
                            </button>
                        )}
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}

/** A chip per emoji with its count. Yours are highlighted, and clicking a chip adds or removes your reaction. */
export function ReactionChips({ reactions, currentUserId, onToggle, children }: { reactions: ReactionGroup[]; currentUserId?: string; onToggle: (emoji: string, add: boolean) => void; children?: ReactNode }) {
    const { t, i18n } = useTranslation();
    const list = new Intl.ListFormat(i18n.language, { type: "conjunction" });
    return (
        <Collapse open={reactions.length > 0} lazy={false}>
            <div className="flex flex-wrap items-center gap-1 pt-2">
                {reactions.map((group) => {
                    const mine = group.users.some((user) => user.id === currentUserId);
                    const names = list.format(group.users.map((user) => (user.id === currentUserId ? t("issue.reactionYou") : user.name)));
                    const label = t(group.users.length > 1 ? "issue.reactedWithMany" : "issue.reactedWith", { names, emoji: group.emoji });
                    return (
                        <Tooltip key={group.emoji} title={label} description={mine ? t("issue.removeYourReaction") : undefined} delay={200}>
                            <button
                                type="button"
                                aria-pressed={mine}
                                aria-label={label}
                                onClick={() => onToggle(group.emoji, !mine)}
                                className={cx(
                                    "animate-enter flex h-6 items-center gap-1 rounded-full border px-2 text-[12px] tabular-nums transition-[background-color,border-color,transform] duration-150 active:scale-95",
                                    mine ? "border-accent-strong bg-accent-primary/15 text-primary" : "border-subtle bg-layer-2 text-secondary hover:border-[var(--border-strong-1)]",
                                )}
                            >
                                <span className="text-[13px] leading-none">{group.emoji}</span>
                                {group.users.length}
                            </button>
                        </Tooltip>
                    );
                })}
                {children}
            </div>
        </Collapse>
    );
}
