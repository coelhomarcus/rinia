import { Crown } from "lucide-react";
import { type AssignableProjectRole, assignableProjectRoleValues } from "@rinia/shared";
import { useTranslation } from "react-i18next";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Select } from "@/components/base/select/select";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import type { ProjectMember } from "../api";
import { useTransferProject, useUpdateMemberRole } from "../hooks/use-project-members";
import { useProjectPermissions } from "../hooks/use-project-permissions";
import { useRoleHints, useRoleLabels } from "../hooks/use-role-labels";

/** Picks a role from the ones that can be given. The owner is not one: that changes by transferring the project. */
export function RolePicker({ value, onChange, isDisabled, label, className }: { value: AssignableProjectRole; onChange: (role: AssignableProjectRole) => void; isDisabled?: boolean; label: string; className?: string }) {
    const labels = useRoleLabels();
    const hints = useRoleHints();
    return (
        <Select
            size="sm"
            className={className ?? "w-32"}
            aria-label={label}
            selectedKey={value}
            isDisabled={isDisabled}
            onSelectionChange={(key) => {
                if (typeof key === "string" && key !== value) onChange(key as AssignableProjectRole);
            }}
            items={assignableProjectRoleValues.map((id) => ({ id, label: labels[id], supportingText: hints[id] }))}
        >
            {(item) => <Select.Item key={item.id} id={item.id} supportingText={item.supportingText}>{item.label}</Select.Item>}
        </Select>
    );
}

/** A member's role: a picker for whoever may change it, the role's name for everyone else. */
export function MemberRoleControl({ projectId, member }: { projectId: string; member: ProjectMember }) {
    const { t } = useTranslation();
    const labels = useRoleLabels();
    const { canManage } = useProjectPermissions(projectId);
    const update = useUpdateMemberRole(projectId);
    if (member.role === "owner" || !canManage(member.role)) {
        return <span className={member.role === "owner" ? "font-medium text-accent-primary" : "text-secondary"}>{labels[member.role]}</span>;
    }
    return (
        <div className="flex flex-col items-end gap-1">
            <RolePicker
                value={member.role}
                isDisabled={update.isPending}
                label={t("settings.roleOf", { name: member.name })}
                onChange={(role) => update.mutate({ userId: member.id, role })}
            />
            {update.isError && <span role="alert" className="text-xs text-error-primary">{t("settings.couldNotChangeRole")}</span>}
        </div>
    );
}

/** Lets the owner hand the project to another member, who must not be a guest. */
export function TransferOwnershipButton({ projectId, member }: { projectId: string; member: ProjectMember }) {
    const { t } = useTranslation();
    const { can } = useProjectPermissions(projectId);
    const transfer = useTransferProject(projectId);
    if (!can("project.transfer") || member.role === "owner" || member.role === "guest") return null;
    return (
        <ConfirmDialog
            trigger={<ButtonUtility icon={Crown} size="sm" color="tertiary" tooltip={t("settings.transferOwnershipTo", { name: member.name })} isDisabled={transfer.isPending} />}
            title={t("settings.transferOwnership")}
            description={t("settings.transferOwnershipDescription", { name: member.name, username: member.username })}
            confirmLabel={t("settings.transferOwnership")}
            isPending={transfer.isPending}
            onConfirm={() => transfer.mutate(member.id)}
        />
    );
}
