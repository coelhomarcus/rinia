import { z } from "zod";

/**
 * What "Copy with prompt" puts in its Instructions block when neither the issue nor its project sets its own. Always
 * English, whatever the reader's language: the prompt goes to a model, and English costs it fewer tokens.
 */
export const DEFAULT_PROMPT_INSTRUCTIONS = [
    "Analyze the task described below and use all of the information provided as context.",
    "If the task requires implementation, first examine the project's existing structure and conventions.",
    "Respect the requirements, acceptance criteria, and decisions recorded in the comments.",
    "Do not assume the task has not been done yet: consider its current status and check what is still missing.",
    "When you finish, present the changes you made, the checks you ran, and anything still open.",
].join("\n\n");

/** Added after the instructions, whichever they are, when the issue links a file stored in Rinia. */
export const PROMPT_FILE_ACCESS = "Files stored in Rinia are absolute URLs under /api/files/. Fetch them with the same API token, in an Authorization: Bearer header. Without that token the file does not open.";

export const MAX_PROMPT_INSTRUCTIONS = 10_000;

/** A project's or an issue's own instructions. Blank, or null, falls back to the next level: issue → project → default. */
export const promptInstructionsSchema = z
    .string()
    .max(MAX_PROMPT_INSTRUCTIONS, `Instructions can contain at most ${MAX_PROMPT_INSTRUCTIONS.toLocaleString("en-US")} characters`)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value?.trim() ? value.trim() : null));

/** The instructions an issue's prompt uses: the issue's own, else its project's, else the default. */
export function resolvePromptInstructions(issueInstructions: string | null | undefined, projectInstructions: string | null | undefined) {
    return issueInstructions?.trim() || projectInstructions?.trim() || DEFAULT_PROMPT_INSTRUCTIONS;
}
