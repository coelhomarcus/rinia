import { checkRichText, type RichTextProfile } from "@rinia/shared/src/rich-text-schema";
import { HttpError } from "./http-error";

/**
 * Refuses rich text the editors cannot open, whether it comes from the app, the REST API or an agent. An editor shows
 * such content empty and its next save would erase it, so it is better to say what is wrong while the sender can fix it.
 */
export function assertRichText(document: unknown, profile: RichTextProfile) {
    if (document === undefined) return;
    const result = checkRichText(document, profile);
    if (!result.ok) throw new HttpError(400, result.message, "errors.unsupportedContent");
}
