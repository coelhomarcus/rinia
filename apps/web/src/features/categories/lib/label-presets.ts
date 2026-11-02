export type LabelPresetName =
    | "bug" | "feature" | "improvement" | "design" | "refactor" | "chore" | "docs" | "test" | "research"
    | "frontend" | "backend" | "ui" | "ux" | "api" | "database" | "firmware" | "integration" | "devops"
    | "performance" | "security" | "accessibility" | "regression" | "breaking-change" | "technical-debt" | "dependencies";

export type LabelPresetGroupId = "type" | "area" | "technical";

export interface LabelPreset {
    name: LabelPresetName;
    color: string;
}

export interface LabelPresetGroup {
    id: LabelPresetGroupId;
    presets: LabelPreset[];
}

/**
 * Ready-made labels offered in the project's label settings. Status and priority are left out on purpose: the
 * workflow states and the priority field already cover them.
 */
export const LABEL_PRESET_GROUPS: LabelPresetGroup[] = [
    {
        id: "type",
        presets: [
            { name: "bug", color: "#f04438" },
            { name: "feature", color: "#17b26a" },
            { name: "improvement", color: "#2e90fa" },
            { name: "design", color: "#7a5af8" },
            { name: "refactor", color: "#15b79e" },
            { name: "chore", color: "#87888c" },
            { name: "docs", color: "#0070f3" },
            { name: "test", color: "#eaaa08" },
            { name: "research", color: "#f79009" },
        ],
    },
    {
        id: "area",
        presets: (["frontend", "backend", "ui", "ux", "api", "database", "firmware", "integration", "devops"] as const).map((name) => ({ name, color: "#2e90fa" })),
    },
    {
        id: "technical",
        presets: (["performance", "security", "accessibility", "regression", "breaking-change", "technical-debt", "dependencies"] as const).map((name) => ({ name, color: "#f79009" })),
    },
];
