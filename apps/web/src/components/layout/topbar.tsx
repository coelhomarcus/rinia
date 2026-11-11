import type { ReactNode } from "react";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AppIcons } from "@/components/foundations/icons";
import { useTranslation } from "react-i18next";

interface TopbarProps {
    title?: ReactNode;
    actions?: ReactNode;
    onBack?: () => void;
}
export function Topbar({ title, actions, onBack }: TopbarProps) {
    const { t } = useTranslation();
    return (
        <header className="flex h-[45px] shrink-0 select-none items-center justify-between gap-3 border-b border-subtle px-3.5">
            <div className="flex min-w-0 items-center gap-2">
                {onBack && <ButtonUtility icon={AppIcons.Back} color="tertiary" tooltip={t("common.back")} onClick={onBack} />}
                <div className="min-w-0 truncate text-sm font-medium text-primary">{title}</div>
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
    );
}
