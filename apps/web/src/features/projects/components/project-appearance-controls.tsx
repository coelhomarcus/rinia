import { Popover } from "@base-ui/react/popover";
import type { EntityIcon, UpdateProjectInput } from "@rinia/shared";
import { useState } from "react";
import { AppearancePicker, appearancePopupClass } from "@/components/appearance/appearance-picker";
import { useUpdateProject } from "../hooks/use-projects";
import { DEFAULT_PROJECT_ICON, ProjectIcon } from "./project-icon";
import { useTranslation } from "react-i18next";

function asEntityIcon(icon: EntityIcon | string | null | undefined): EntityIcon {
    if (icon && typeof icon === "object") return icon;
    return { type: "icon", key: (typeof icon === "string" && icon) || DEFAULT_PROJECT_ICON };
}

export function ProjectIconControl({
    projectId,
    icon,
    isProjectOwner,
    className,
    iconClassName,
}: {
    projectId: string;
    icon: EntityIcon | string | null | undefined;
    isProjectOwner: boolean;
    className?: string;
    iconClassName?: string;
}) {
    const { t } = useTranslation();
    const update = useUpdateProject(projectId);
    const [open, setOpen] = useState(false);
    const appearance = asEntityIcon(icon);
    const disabled = !isProjectOwner || update.isPending;

    if (!isProjectOwner) {
        return (
            <span className={className}>
                <ProjectIcon icon={appearance} className={iconClassName} tile />
            </span>
        );
    }

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger disabled={disabled} aria-label={t("settings.changeProjectIcon")} className={className}>
                <ProjectIcon icon={appearance} className={iconClassName} tile />
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner side="bottom" align="start" sideOffset={8} collisionPadding={12} className="z-[60]">
                    <Popover.Popup className={appearancePopupClass}>
                        <Popover.Title className="sr-only">{t("settings.projectIcon")}</Popover.Title>
                        <AppearancePicker
                            projectId={projectId}
                            value={icon && typeof icon === "object" ? icon : undefined}
                            onChange={(iconAppearance) => update.mutate({ iconAppearance: iconAppearance as UpdateProjectInput["iconAppearance"] })}
                            onComplete={() => setOpen(false)}
                        />
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}

