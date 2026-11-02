import type { TFunction } from "i18next";
import type { ProjectCardSummary, ProjectMemberPreview } from "../api";

export interface ProjectGroup {
    /** The owner's id, or "none" for projects whose owner left. Stable, so a group's open state can be remembered. */
    key: string;
    label: string;
    mine: boolean;
    owner: ProjectMemberPreview | null;
    projects: ProjectCardSummary[];
}

/**
 * Splits projects by who owns them: the viewer's own first, then everyone else's by name, then any without an
 * owner. Projects keep their order inside each group.
 */
export function groupProjectsByOwner(projects: ProjectCardSummary[], userId: string | undefined, t: TFunction): ProjectGroup[] {
    const groups = new Map<string, ProjectGroup>();
    for (const project of projects) {
        const owner = project.owner;
        const key = owner?.id ?? "none";
        let group = groups.get(key);
        if (!group) {
            const mine = !!owner && owner.id === userId;
            // A first name keeps the label short in the sidebar.
            const label = mine ? t("nav.yourProjects") : owner ? t("nav.projectsOf", { name: owner.name.trim().split(/\s+/)[0] || owner.name }) : t("nav.otherProjects");
            group = { key, label, mine, owner, projects: [] };
            groups.set(key, group);
        }
        group.projects.push(project);
    }
    const rank = (group: ProjectGroup) => (group.mine ? 0 : group.key === "none" ? 2 : 1);
    return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}
