/**
 * What each project role may do. The API enforces this map on every route, realtime channel and MCP tool, and the web
 * app reads the same map to hide what the role cannot do, so the two never disagree.
 */
export const projectRoleValues = ["owner", "admin", "member", "viewer", "guest"] as const;
export type ProjectRole = (typeof projectRoleValues)[number];

/** Roles that can be given to someone. A project has one owner, who changes only through a transfer. */
export const assignableProjectRoleValues = ["admin", "member", "viewer", "guest"] as const;
export type AssignableProjectRole = (typeof assignableProjectRoleValues)[number];

const EVERYONE = projectRoleValues;
const MANAGERS = ["owner", "admin"] as const;
const EDITORS = ["owner", "admin", "member"] as const;
const READERS = ["owner", "admin", "member", "viewer"] as const;

/**
 * Guests see only what was shared with them: the issues and pages someone shared, and the issues assigned to them. An
 * action that reads one issue or page (comments, reactions, following) is checked against that, too.
 */
export const projectPermissions = {
    /** Open the project at all: its name, states, labels and members. */
    "project.read": EVERYONE,
    /** Name, key, description, icon and the project page's settings. */
    "project.update": MANAGERS,
    "project.delete": ["owner"],
    "project.transfer": ["owner"],
    /** The project's overview page, which every editor writes. */
    "project.page.update": EDITORS,
    "project.stats": READERS,

    "members.manage": MANAGERS,
    "states.manage": MANAGERS,
    /** Create labels, and edit or delete the ones you created. */
    "labels.create": EDITORS,
    /** Edit or delete anyone's label. */
    "labels.manage": MANAGERS,

    /** See every issue. Guests see only the ones shared with or assigned to them. */
    "issues.readAll": READERS,
    "issues.write": EDITORS,
    "comments.write": [...EDITORS, "guest"],
    "reactions.write": EVERYONE,
    "issues.follow": EVERYONE,

    /** See every page. Guests see only the ones shared with them. */
    "pages.readAll": READERS,
    "pages.write": EDITORS,
    /** Delete a page someone else wrote. */
    "pages.deleteAny": MANAGERS,
    "pages.export": READERS,

    "files.write": EDITORS,
    /** Share an issue or a page with a guest. */
    "shares.manage": EDITORS,

    /** Save personal views. */
    "views.create": READERS,
    /** Share a view with the project. */
    "views.share": EDITORS,
    /** Rename or delete a view someone else shared. */
    "views.manageShared": MANAGERS,
} as const satisfies Record<string, readonly ProjectRole[]>;

export type ProjectAction = keyof typeof projectPermissions;
export const projectActionValues = Object.keys(projectPermissions) as ProjectAction[];

export function can(role: ProjectRole | null | undefined, action: ProjectAction): boolean {
    return !!role && (projectPermissions[action] as readonly ProjectRole[]).includes(role);
}

/**
 * Whether `actor` may change `target`'s membership, and give them `nextRole` when there is one. The owner is out of
 * reach: nobody removes or demotes them, and becoming owner is a transfer, not a role change.
 */
export function canManageMember(actor: ProjectRole | null | undefined, target: ProjectRole, nextRole?: ProjectRole): boolean {
    if (!can(actor, "members.manage")) return false;
    if (target === "owner" || nextRole === "owner") return false;
    return true;
}
