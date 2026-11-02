import type { EntityIcon, ProjectCover } from "@rinia/shared";
import { GradientCover } from "@/components/appearance/gradient-cover";
import { cx } from "@/utils/cx";
import { ProjectIcon } from "./project-icon";

/** The top of a project card: the banner, a bottom shade, and the icon, name and key over it. */
export function ProjectCoverHeader({
    cover,
    icon,
    name,
    issueKey,
    className,
}: {
    cover: ProjectCover | null | undefined;
    icon: EntityIcon | string | null | undefined;
    name: string;
    issueKey: string;
    className?: string;
}) {
    return (
        <div className={cx("relative h-24 shrink-0", className)}>
            <GradientCover cover={cover} className="absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
            <div className="absolute inset-x-0 bottom-2.5 flex h-8 items-center gap-2 px-3">
                <ProjectIcon icon={icon} className="size-7" backing="cover" />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-white">{name}</span>
                    <span className="block font-mono text-[10px] font-medium text-white/80">{issueKey}</span>
                </span>
            </div>
        </div>
    );
}
