import { describe, expect, test } from "bun:test";
import { DEFAULT_PROMPT_INSTRUCTIONS, MAX_PROMPT_INSTRUCTIONS, resolvePromptInstructions, updateIssueSchema, updateProjectSchema } from "@rinia/shared";

describe("prompt instructions", () => {
    test("a project and an issue keep the text as written, trimmed", () => {
        expect(updateProjectSchema.parse({ promptInstructions: "  Leia o README.\n\nDepois teste.  " }).promptInstructions).toBe("Leia o README.\n\nDepois teste.");
        expect(updateIssueSchema.parse({ promptInstructions: "Only fix the bug." }).promptInstructions).toBe("Only fix the bug.");
    });

    test("blank or null restores the default, and leaving it out changes nothing", () => {
        expect(updateProjectSchema.parse({ promptInstructions: "" }).promptInstructions).toBeNull();
        expect(updateIssueSchema.parse({ promptInstructions: "   " }).promptInstructions).toBeNull();
        expect(updateIssueSchema.parse({ promptInstructions: null }).promptInstructions).toBeNull();
        expect("promptInstructions" in updateIssueSchema.parse({ title: "Renamed" })).toBe(false);
    });

    test("refuses text past the limit", () => {
        expect(updateProjectSchema.safeParse({ promptInstructions: "a".repeat(MAX_PROMPT_INSTRUCTIONS + 1) }).success).toBe(false);
    });

    test("resolve issue, then project, then the default", () => {
        expect(resolvePromptInstructions("Issue.", "Project.")).toBe("Issue.");
        expect(resolvePromptInstructions(null, "Project.")).toBe("Project.");
        expect(resolvePromptInstructions(" ", null)).toBe(DEFAULT_PROMPT_INSTRUCTIONS);
    });
});
