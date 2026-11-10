import { Menu } from "@base-ui/react/menu";
import { MoreHorizontalOutline, ParentOutline } from "@makeplane/propel/icons";
import { Copy, GitBranch, History, Link2, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { cx } from "@/utils/cx";
import { menuItemClass, popupMotion } from "./styles";

export interface CopyActions {
    onCopyLink: () => void;
    onCopyId: () => void;
    onCopyBranch: () => void;
    onCopyPrompt: () => void;
    isCopying: boolean;
}

export function IssueActionsMenu({ onCopyLink, onCopyId, onCopyBranch, onCopyPrompt, isCopying, onAddRelation, onSetParent, onOpenHistory, onDelete }: CopyActions & { onAddRelation: () => void; onSetParent: () => void; onOpenHistory: () => void; onDelete: () => void }) {
    const { t } = useTranslation();
    return (
        <Menu.Root>
            <Menu.Trigger aria-label={t("issue.issueActions")} className="grid size-6 shrink-0 place-items-center rounded text-tertiary outline-none hover:bg-layer-transparent-hover hover:text-primary focus-visible:bg-layer-transparent-hover data-[popup-open]:bg-layer-transparent-hover">
                <MoreHorizontalOutline className="size-4" />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner sideOffset={6} align="start" className="z-50">
                    <Menu.Popup className={cx("w-60", overlayChrome.menu, popupMotion)}>
                        <Menu.Item className={menuItemClass} onClick={onCopyLink}><Link2 className="size-4 text-tertiary" />{t("issue.copyIssueLink")}</Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={onCopyId}><Copy className="size-4 text-tertiary" />{t("issue.copyIdentifier")}</Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={onCopyBranch}><GitBranch className="size-4 text-tertiary" />{t("issue.copyBranchName")}</Menu.Item>
                        <Menu.Item className={menuItemClass} disabled={isCopying} onClick={onCopyPrompt}><Sparkles className="size-4 text-tertiary" />{t("issue.copyWithPrompt")}</Menu.Item>
                        <Menu.Separator className="my-1 h-px bg-[var(--border-subtle)]" />
                        <Menu.Item className={menuItemClass} onClick={onAddRelation}><Link2 className="size-4 text-tertiary" />{t("issue.addRelation")}</Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={onSetParent}><ParentOutline className="size-4 text-tertiary" />{t("issue.addParent")}</Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={onOpenHistory}><History className="size-4 text-tertiary" />{t("issue.descriptionHistory")}</Menu.Item>
                        <Menu.Separator className="my-1 h-px bg-[var(--border-subtle)]" />
                        <Menu.Item className={cx(menuItemClass, "text-danger-primary data-highlighted:text-danger-primary")} onClick={onDelete}><Trash2 className="size-4" />{t("issue.deleteIssue")}</Menu.Item>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

/** Round copy shortcuts at the top of the properties rail. */
export function IssueQuickActions({ onCopyLink, onCopyId, onCopyBranch, onCopyPrompt, isCopying }: CopyActions) {
    const { t } = useTranslation();
    const actions: Array<[string, typeof Link2, () => void, boolean?]> = [
        [t("issue.copyIssueLink"), Link2, onCopyLink],
        [t("issue.copyIdentifier"), Copy, onCopyId],
        [t("issue.copyBranchName"), GitBranch, onCopyBranch],
        [t("issue.copyWithPrompt"), Sparkles, onCopyPrompt, isCopying],
    ];
    return (
        <div className="flex items-center justify-end gap-1.5">
            {actions.map(([label, Icon, onClick, disabled]) => (
                <ButtonUtility key={label} icon={Icon} size="sm" color="tertiary" tooltip={label} tooltipPlacement="bottom" isDisabled={disabled} onClick={onClick} className="size-8 rounded-full border border-subtle" />
            ))}
        </div>
    );
}
