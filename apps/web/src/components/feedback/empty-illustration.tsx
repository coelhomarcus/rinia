import checkDark from "@/assets/illustrations/iso-48-check-two-tone-dark.svg";
import check from "@/assets/illustrations/iso-48-check-two-tone.svg";
import fileDark from "@/assets/illustrations/iso-48-file-two-tone-dark.svg";
import file from "@/assets/illustrations/iso-48-file-two-tone.svg";
import tagDark from "@/assets/illustrations/iso-48-tag-two-tone-dark.svg";
import tag from "@/assets/illustrations/iso-48-tag-two-tone.svg";
import briefcaseDark from "@/assets/illustrations/iso-240-briefcase-two-tone-dark.svg";
import briefcase from "@/assets/illustrations/iso-240-briefcase-two-tone.svg";
import crateDark from "@/assets/illustrations/iso-240-crate-two-tone-dark.svg";
import crate from "@/assets/illustrations/iso-240-crate-two-tone.svg";
import foldersDark from "@/assets/illustrations/iso-240-folders-two-tone-dark.svg";
import folders from "@/assets/illustrations/iso-240-folders-two-tone.svg";
import kanbanDark from "@/assets/illustrations/iso-240-kanban-two-tone-dark.svg";
import kanban from "@/assets/illustrations/iso-240-kanban-two-tone.svg";
import layoutDark from "@/assets/illustrations/iso-240-layout-two-tone-dark.svg";
import layout from "@/assets/illustrations/iso-240-layout-two-tone.svg";
import mailDark from "@/assets/illustrations/iso-240-mail-two-tone-dark.svg";
import mail from "@/assets/illustrations/iso-240-mail-two-tone.svg";
import settingsDark from "@/assets/illustrations/iso-240-settings-two-tone-dark.svg";
import settings from "@/assets/illustrations/iso-240-settings-two-tone.svg";
import { cx } from "@/utils/cx";

/** Overflow Design isometric stills, free tier, two-tone. https://www.overflow.design/isometric/?tier=free */
export const emptyIllustrations = {
    kanban: { light: kanban, dark: kanbanDark },
    mail: { light: mail, dark: mailDark },
    briefcase: { light: briefcase, dark: briefcaseDark },
    folders: { light: folders, dark: foldersDark },
    layout: { light: layout, dark: layoutDark },
    settings: { light: settings, dark: settingsDark },
    crate: { light: crate, dark: crateDark },
    tag: { light: tag, dark: tagDark },
    file: { light: file, dark: fileDark },
    check: { light: check, dark: checkDark },
} as const;

export type EmptyIllustrationName = keyof typeof emptyIllustrations;

const compact: Partial<Record<EmptyIllustrationName, boolean>> = {
    tag: true,
    file: true,
    check: true,
};

export function EmptyIllustration({ name, className }: { name: EmptyIllustrationName; className?: string }) {
    const drawing = emptyIllustrations[name];
    const size = compact[name] ? "h-28 w-28" : "h-40 w-40";
    return (
        <span className={cx("mb-4 grid place-items-center", className)} aria-hidden="true">
            <img src={drawing.light} alt="" className={cx(size, "dark:hidden")} />
            <img src={drawing.dark} alt="" className={cx(size, "hidden dark:block")} />
        </span>
    );
}
