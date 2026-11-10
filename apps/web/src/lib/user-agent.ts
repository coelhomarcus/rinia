/** A browser and system recognized from a User-Agent header, enough for someone to tell their sessions apart. */
export interface DeviceDescription {
    browser: string | null;
    os: string | null;
    mobile: boolean;
}

// Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari".
const BROWSERS: Array<[RegExp, string]> = [
    [/\bEdg(?:e|A|iOS)?\//, "Edge"],
    [/\b(?:OPR|Opera)\//, "Opera"],
    [/\bSamsungBrowser\//, "Samsung Internet"],
    [/\b(?:Firefox|FxiOS)\//, "Firefox"],
    [/\b(?:Chrome|CriOS|Chromium)\//, "Chrome"],
    [/\bVersion\/[\d.]+.*Safari\//, "Safari"],
];

const SYSTEMS: Array<[RegExp, string]> = [
    [/\b(?:iPhone|iPod)\b/, "iPhone"],
    [/\biPad\b/, "iPad"],
    [/\bAndroid\b/, "Android"],
    [/\bWindows\b/, "Windows"],
    [/\bCrOS\b/, "ChromeOS"],
    [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
    [/\bLinux\b/, "Linux"],
];

export function describeUserAgent(userAgent: string | null | undefined): DeviceDescription {
    const value = userAgent ?? "";
    const browser = BROWSERS.find(([pattern]) => pattern.test(value))?.[1] ?? null;
    const os = SYSTEMS.find(([pattern]) => pattern.test(value))?.[1] ?? null;
    return { browser, os, mobile: /\bMobi|\biPhone\b|\bAndroid\b.*\bMobile\b/.test(value) };
}
