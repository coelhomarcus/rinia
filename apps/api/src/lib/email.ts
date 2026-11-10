import { env } from "../config/env";
import { logFor } from "./request-context";

export interface Email {
    to: string;
    subject: string;
    html: string;
    text: string;
}

const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

/** Thrown when Resend refuses or cannot be reached. Carries the status, never the key or the message body. */
export class EmailError extends Error {
    constructor(readonly status: number | null) {
        super(status ? `Resend answered ${status}` : "Resend could not be reached");
    }
}

/**
 * Sends one email through Resend's HTTP API. Without Resend set up it only logs, so
 * development works without an account.
 */
export async function sendEmail(email: Email): Promise<void> {
    const log = logFor("email");
    if (!env.emailEnabled) {
        // The text holds the link a developer needs to follow; production never reaches this line with email off.
        log.info({ event: "email.skipped", subject: email.subject, text: env.NODE_ENV === "development" ? email.text : undefined }, "email is not set up, so nothing was sent");
        return;
    }
    let response: Response;
    try {
        response = await fetch(RESEND_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
    } catch (error) {
        log.error({ event: "email.failed", err: error }, "could not reach Resend");
        throw new EmailError(null);
    }
    if (!response.ok) {
        // Resend's error names the problem (an unverified domain, a bad key) without echoing secrets.
        const detail = await response.text().catch(() => "");
        log.error({ event: "email.failed", status: response.status, detail: detail.slice(0, 500) }, "Resend refused an email");
        throw new EmailError(response.status);
    }
    log.info({ event: "email.sent", subject: email.subject }, "email sent");
}
