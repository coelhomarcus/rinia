import type { ProjectCover } from "@rinia/shared";
import { getProjectBanner, parseProjectCover } from "@rinia/shared";
import { cx } from "@/utils/cx";

export function GradientCover({ cover, className }: { cover: ProjectCover | null | undefined; className?: string }) {
    const parsed = parseProjectCover(cover);
    return (
        <div
            className={cx("overflow-hidden bg-surface-2", className)}
            style={parsed ? { backgroundImage: getProjectBanner(parsed.key).css } : undefined}
        />
    );
}
