import { projectBannerGroups, projectBanners, parseProjectCover, type EntityIcon, type ProjectBannerGroup, type ProjectCover, type ProjectGradientKey } from "@rinia/shared";
import { Ban, Check, Shuffle } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { ProjectCoverHeader } from "@/features/projects/components/project-cover-header";
import { cx } from "@/utils/cx";

const GROUP_LABELS = {
    linear: "appearance.bannerGroupLinear",
    mesh: "appearance.bannerGroupMesh",
    solid: "appearance.bannerGroupSolid",
    pattern: "appearance.bannerGroupPattern",
} as const satisfies Record<ProjectBannerGroup, string>;

const toolButton =
    "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-secondary hover:bg-layer-1-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-accent-strong disabled:opacity-50";

export function GradientPicker({
    cover,
    onChange,
    disabled,
    preview,
}: {
    cover: ProjectCover | null | undefined;
    onChange: (cover: ProjectCover | null) => void;
    disabled?: boolean;
    /** Shows a project card with the chosen banner above the swatches. */
    preview?: { name: string; issueKey: string; icon: EntityIcon | string | null | undefined };
}) {
    const { t } = useTranslation();
    const id = useId();
    const listRef = useRef<HTMLDivElement>(null);
    const selected = parseProjectCover(cover)?.key ?? null;
    const [activeKey, setActiveKey] = useState<ProjectGradientKey | null>(null);
    const tabbableKey = activeKey ?? selected ?? projectBanners[0].key;

    useEffect(() => {
        listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }, []);

    function pick(key: ProjectGradientKey) {
        setActiveKey(key);
        onChange({ type: "gradient", key });
    }

    function pickRandom() {
        const others = projectBanners.filter((banner) => banner.key !== selected);
        pick(others[Math.floor(Math.random() * others.length)].key);
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const options = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0) return;
        const next =
            event.key === "ArrowRight" ? options[index + 1]
            : event.key === "ArrowLeft" ? options[index - 1]
            : event.key === "Home" ? options[0]
            : event.key === "End" ? options.at(-1)
            : event.key === "ArrowDown" ? optionInNextRow(options, index, 1)
            : event.key === "ArrowUp" ? optionInNextRow(options, index, -1)
            : undefined;
        if (!next) return;
        event.preventDefault();
        next.focus();
        next.scrollIntoView({ block: "nearest" });
    }

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {preview && (
                <div className="overflow-hidden rounded-lg border border-subtle" role="img" aria-label={t("appearance.bannerPreview")}>
                    <ProjectCoverHeader cover={selected ? { type: "gradient", key: selected } : null} icon={preview.icon} name={preview.name} issueKey={preview.issueKey} />
                </div>
            )}
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-tertiary">{t("appearance.projectBanner")}</p>
                <div className="flex items-center gap-1">
                    <button type="button" disabled={disabled} aria-pressed={!selected} onClick={() => onChange(null)} className={cx(toolButton, !selected && "bg-layer-1-hover text-primary")}>
                        <Ban className="size-3.5" aria-hidden="true" />
                        {t("appearance.noBanner")}
                    </button>
                    <button type="button" disabled={disabled} onClick={pickRandom} className={toolButton}>
                        <Shuffle className="size-3.5" aria-hidden="true" />
                        {t("appearance.randomBanner")}
                    </button>
                </div>
            </div>
            <div
                ref={listRef}
                role="listbox"
                aria-label={t("appearance.projectBanner")}
                onKeyDown={onKeyDown}
                className="-mx-1 flex max-h-[min(17rem,45vh)] flex-col gap-3 overflow-y-auto px-1 pt-0.5 pb-1"
            >
                {projectBannerGroups.map((group) => (
                    <div key={group} role="group" aria-labelledby={`${id}-${group}`}>
                        <p id={`${id}-${group}`} aria-hidden="true" className="mb-1.5 text-[11px] font-medium text-tertiary">
                            {t(GROUP_LABELS[group])}
                        </p>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
                            {projectBanners
                                .filter((banner) => banner.group === group)
                                .map((banner) => {
                                    const label = t(`appearance.${banner.labelKey}`);
                                    const isSelected = selected === banner.key;
                                    return (
                                        <Tooltip key={banner.key} title={label} delay={200} offset={4}>
                                            <button
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                aria-label={label}
                                                tabIndex={banner.key === tabbableKey ? 0 : -1}
                                                disabled={disabled}
                                                onFocus={() => setActiveKey(banner.key)}
                                                onClick={() => pick(banner.key)}
                                                className={cx(
                                                    "relative grid h-9 place-items-center rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent-strong disabled:opacity-50",
                                                    isSelected ? "ring-2 ring-accent-strong" : "ring-1 ring-white/10 ring-inset hover:ring-2 hover:ring-strong",
                                                )}
                                                style={{ backgroundImage: banner.css }}
                                            >
                                                {isSelected && (
                                                    <span className="grid size-5 place-items-center rounded-full bg-white text-black shadow-sm">
                                                        <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                                                    </span>
                                                )}
                                            </button>
                                        </Tooltip>
                                    );
                                })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** The option in the row above or below whose centre is closest, so arrows follow the grid even across groups. */
function optionInNextRow(options: HTMLButtonElement[], index: number, direction: 1 | -1) {
    const rects = options.map((option) => option.getBoundingClientRect());
    const current = rects[index];
    const rowTops = rects.map((rect) => rect.top).filter((top) => (direction === 1 ? top > current.top + 1 : top < current.top - 1));
    if (!rowTops.length) return undefined;
    const rowTop = direction === 1 ? Math.min(...rowTops) : Math.max(...rowTops);
    const center = current.left + current.width / 2;
    let best: HTMLButtonElement | undefined;
    let bestDistance = Infinity;
    rects.forEach((rect, candidate) => {
        if (Math.abs(rect.top - rowTop) > 1) return;
        const distance = Math.abs(rect.left + rect.width / 2 - center);
        if (distance < bestDistance) [best, bestDistance] = [options[candidate], distance];
    });
    return best;
}
