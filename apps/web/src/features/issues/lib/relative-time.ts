export function formatFullIssueDate(value: string, locale: string) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatDistanceToNow(value: string, locale: string) {
    const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (minutes < 60) return formatter.format(-minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (hours < 24) return formatter.format(-hours, "hour");
    return formatter.format(-Math.round(hours / 24), "day");
}
