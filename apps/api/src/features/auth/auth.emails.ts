import type { Locale } from "@rinia/shared";
import type { Email } from "../../lib/email";

interface Recipient {
    name: string;
    username: string;
    email: string;
    locale: string;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

const localeOf = (recipient: Recipient): Locale => (recipient.locale === "en" ? "en" : "pt-BR");

/** One short message in Rinia's plain look: a greeting, a few lines, and an optional button. */
function layout({ paragraphs, action, footer }: { paragraphs: string[]; action?: { label: string; url: string }; footer: string }) {
    const body = paragraphs.map((text) => `<p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#3f3f46">${text}</p>`).join("");
    const button = action
        ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#3f76ff;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">${escapeHtml(action.label)}</a></p>`
        : "";
    return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:480px;margin:0 auto;padding:32px;border-radius:12px;background:#ffffff;border:1px solid #e4e4e7">
<p style="margin:0 0 24px;font-size:16px;font-weight:700;color:#18181b">Rinia</p>${body}${button}
<p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#71717a">${footer}</p>
</div></body></html>`;
}

const RESET = {
    "pt-BR": {
        subject: "Redefina sua senha do Rinia",
        hello: (name: string) => `Olá, ${name}.`,
        self: (username: string) => `Recebemos um pedido para redefinir a senha da conta <strong>@${username}</strong>. Use o botão abaixo para escolher uma nova senha.`,
        admin: (username: string) => `Um administrador do Rinia enviou este link para você escolher uma nova senha para a conta <strong>@${username}</strong>.`,
        validity: (hours: number) => `O link vale por ${hours === 1 ? "1 hora" : `${hours} horas`} e só pode ser usado uma vez. Ao trocar a senha, você sai de todos os outros dispositivos.`,
        action: "Escolher nova senha",
        ignore: "Se você não pediu isso, ignore este e-mail. Sua senha continua a mesma.",
        plainLink: "Abra este endereço para escolher uma nova senha:",
    },
    en: {
        subject: "Reset your Rinia password",
        hello: (name: string) => `Hi ${name},`,
        self: (username: string) => `We received a request to reset the password of the account <strong>@${username}</strong>. Use the button below to choose a new password.`,
        admin: (username: string) => `A Rinia admin sent you this link to choose a new password for the account <strong>@${username}</strong>.`,
        validity: (hours: number) => `The link works for ${hours === 1 ? "1 hour" : `${hours} hours`} and only once. Changing your password signs you out of every other device.`,
        action: "Choose a new password",
        ignore: "If you did not ask for this, ignore this email. Your password stays the same.",
        plainLink: "Open this address to choose a new password:",
    },
} as const;

const stripTags = (html: string) => html.replace(/<[^>]+>/g, "");

export function passwordResetEmail(recipient: Recipient, link: string, options: { hours: number; byAdmin: boolean }): Email {
    const copy = RESET[localeOf(recipient)];
    const name = escapeHtml(recipient.name);
    const username = escapeHtml(recipient.username);
    const intro = options.byAdmin ? copy.admin(username) : copy.self(username);
    const paragraphs = [copy.hello(name), intro, copy.validity(options.hours)];
    return {
        to: recipient.email,
        subject: copy.subject,
        html: layout({ paragraphs, action: { label: copy.action, url: link }, footer: copy.ignore }),
        text: [copy.hello(recipient.name), stripTags(options.byAdmin ? copy.admin(recipient.username) : copy.self(recipient.username)), `${copy.plainLink}\n${link}`, copy.validity(options.hours), copy.ignore].join("\n\n"),
    };
}

const CHANGED = {
    "pt-BR": {
        subject: "Sua senha do Rinia foi alterada",
        hello: (name: string) => `Olá, ${name}.`,
        body: (username: string, when: string) => `A senha da conta <strong>@${username}</strong> foi alterada em ${when}. As outras sessões abertas foram encerradas.`,
        warning: "Se não foi você, fale agora com um administrador do Rinia.",
        footer: "Você recebeu este aviso porque a senha da sua conta mudou.",
    },
    en: {
        subject: "Your Rinia password was changed",
        hello: (name: string) => `Hi ${name},`,
        body: (username: string, when: string) => `The password of the account <strong>@${username}</strong> was changed on ${when}. Other open sessions were signed out.`,
        warning: "If this was not you, contact a Rinia admin right away.",
        footer: "You received this notice because your account's password changed.",
    },
} as const;

export function passwordChangedEmail(recipient: Recipient, changedAt: Date): Email {
    const locale = localeOf(recipient);
    const copy = CHANGED[locale];
    const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo", timeZoneName: "short" }).format(changedAt);
    const paragraphs = [copy.hello(escapeHtml(recipient.name)), copy.body(escapeHtml(recipient.username), when), copy.warning];
    return {
        to: recipient.email,
        subject: copy.subject,
        html: layout({ paragraphs, footer: copy.footer }),
        text: [copy.hello(recipient.name), stripTags(copy.body(recipient.username, when)), copy.warning].join("\n\n"),
    };
}
