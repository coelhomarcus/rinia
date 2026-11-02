import { compositeColor } from "./contrast";

/**
 * Every project banner, as data. A project stores only `{ type: "gradient", key }`; the look, group and
 * tone live here, so a banner can be restyled without touching saved projects. Keys are permanent:
 * add new ones, never rename or remove one, or projects that use it lose their banner.
 */

export type ProjectBannerGroup = "linear" | "mesh" | "solid" | "pattern";
/** Whether the banner is dark (white text on top) or light (dark text). Every banner is dark for now. */
export type ProjectBannerTone = "dark" | "light";

interface BannerLook {
    group: ProjectBannerGroup;
    tone: ProjectBannerTone;
    /** A CSS `background-image` value. */
    css: string;
    /** Every opaque colour a pixel of the banner can take, for contrast checks. */
    colors: readonly string[];
}

/** Alpha of the card's `from-black/55` bottom overlay where the project name starts, about 53px into the 96px banner. */
export const BANNER_TEXT_OVERLAY_ALPHA = 0.3;

const stopList = (stops: readonly (readonly [string, number])[]) => stops.map(([color, at]) => `${color} ${at}%`).join(", ");

function linear(stops: readonly (readonly [string, number])[], angle = 135): BannerLook {
    return { group: "linear", tone: "dark", css: `linear-gradient(${angle}deg, ${stopList(stops)})`, colors: stops.map(([color]) => color) };
}

/** Soft colour blobs (`[color, x%, y%]`) over a two-stop base. */
function mesh(base: readonly [string, string], blobs: readonly (readonly [string, number, number])[]): BannerLook {
    const layers = blobs.map(([color, x, y]) => `radial-gradient(at ${x}% ${y}%, ${color} 0px, transparent 55%)`);
    return { group: "mesh", tone: "dark", css: [...layers, `linear-gradient(135deg, ${base[0]} 0%, ${base[1]} 100%)`].join(", "), colors: [...base, ...blobs.map(([color]) => color)] };
}

function solid(color: string): BannerLook {
    return { group: "solid", tone: "dark", css: `linear-gradient(${color}, ${color})`, colors: [color] };
}

/**
 * A white SVG tile repeated over a two-stop base. `ink` is the strongest white the tile paints
 * (line opacity, or the sum where lines cross), so `colors` holds the lightest pixel too.
 */
function pattern(svg: string, ink: number, base: readonly [string, string]): BannerLook {
    const tile = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' ${svg}</svg>`)}")`;
    return {
        group: "pattern",
        tone: "dark",
        css: `${tile}, linear-gradient(135deg, ${base[0]} 0%, ${base[1]} 100%)`,
        colors: [...base, ...base.map((color) => compositeColor(color, "#ffffff", ink))],
    };
}

const BANNERS = {
    aurora: linear([["#134e4a", 0], ["#1d4ed8", 52], ["#6d28d9", 100]]),
    dusk: linear([["#5b21b6", 0], ["#be185d", 48], ["#c2410c", 100]]),
    ember: linear([["#7f1d1d", 0], ["#c2410c", 50], ["#a16207", 100]]),
    lagoon: linear([["#155e75", 0], ["#0369a1", 50], ["#1e3a8a", 100]]),
    midnight: linear([["#0f172a", 0], ["#1e3a5f", 55], ["#312e81", 100]]),
    orchid: linear([["#4a044e", 0], ["#9d174d", 50], ["#831843", 100]]),
    pine: linear([["#14532d", 0], ["#166534", 45], ["#115e59", 100]]),
    slate: linear([["#1e293b", 0], ["#334155", 50], ["#0f172a", 100]]),
    cobalt: linear([["#1e3a8a", 0], ["#1d4ed8", 55], ["#3730a3", 100]]),
    copper: linear([["#431407", 0], ["#9a3412", 55], ["#b45309", 100]]),
    berry: linear([["#831843", 0], ["#a21caf", 55], ["#6b21a8", 100]]),
    glacier: linear([["#0f766e", 0], ["#0e7490", 50], ["#334155", 100]]),

    nebula: mesh(["#1e1b4b", "#312e81"], [["#a21caf", 12, 18], ["#0e7490", 88, 28], ["#4f46e5", 52, 100]]),
    lava: mesh(["#450a0a", "#7f1d1d"], [["#dc2626", 18, 82], ["#c2410c", 85, 15], ["#be123c", 62, 95]]),
    tide: mesh(["#042f2e", "#134e4a"], [["#0f766e", 15, 25], ["#2563eb", 85, 75], ["#0e7490", 75, 5]]),
    twilight: mesh(["#172554", "#1e1b4b"], [["#7c3aed", 85, 15], ["#db2777", 15, 90], ["#4338ca", 40, 30]]),
    grove: mesh(["#052e16", "#14532d"], [["#15803d", 18, 20], ["#0f766e", 85, 85], ["#4d7c0f", 82, 10]]),
    smoke: mesh(["#18181b", "#27272a"], [["#475569", 20, 30], ["#52525b", 82, 72], ["#334155", 60, 0]]),

    ink: solid("#18181b"),
    navy: solid("#1e3a8a"),
    wine: solid("#881337"),
    moss: solid("#3f6212"),
    plum: solid("#581c87"),
    graphite: solid("#374151"),
    teal: solid("#115e59"),

    dots: pattern(`width='16' height='16'><circle cx='3' cy='3' r='1.5' fill='white' fill-opacity='0.22'/>`, 0.22, ["#312e81", "#3730a3"]),
    grid: pattern(`width='20' height='20'><path d='M20 0H0V20' fill='none' stroke='white' stroke-opacity='0.1'/>`, 0.1, ["#1e293b", "#0f172a"]),
    stripes: pattern(`width='12' height='12'><path d='M-3 3l6-6M0 12L12 0M9 15l6-6' stroke='white' stroke-opacity='0.09' stroke-width='2'/>`, 0.09, ["#134e4a", "#115e59"]),
    waves: pattern(`width='40' height='12'><path d='M0 6c5-5 15-5 20 0s15 5 20 0' fill='none' stroke='white' stroke-opacity='0.11' stroke-width='1.5'/>`, 0.11, ["#1e3a8a", "#172554"]),
    blueprint: pattern(
        `width='40' height='40'><path d='M40 0H0V40' fill='none' stroke='white' stroke-opacity='0.16'/><path d='M20 0V40M0 20H40' fill='none' stroke='white' stroke-opacity='0.07'/>`,
        1 - (1 - 0.16) * (1 - 0.07),
        ["#1e40af", "#1e3a8a"],
    ),
    crosses: pattern(`width='24' height='24'><path d='M12 8v8M8 12h8' stroke='white' stroke-opacity='0.13' stroke-width='1.5'/>`, 0.13, ["#4c0519", "#881337"]),
    zigzag: pattern(`width='20' height='10'><path d='M0 8l5-5 5 5 5-5 5 5' fill='none' stroke='white' stroke-opacity='0.1' stroke-width='1.5'/>`, 0.1, ["#14532d", "#064e3b"]),
} satisfies Record<string, BannerLook>;

export type ProjectGradientKey = keyof typeof BANNERS;
export const projectGradientKeys = Object.keys(BANNERS) as [ProjectGradientKey, ...ProjectGradientKey[]];

export interface ProjectBanner extends BannerLook {
    key: ProjectGradientKey;
    /** The banner's name under `appearance.` in the web app's translations. */
    labelKey: `banner${Capitalize<ProjectGradientKey>}`;
}

export const projectBannerGroups: readonly ProjectBannerGroup[] = ["linear", "mesh", "solid", "pattern"];

export const projectBanners: readonly ProjectBanner[] = projectGradientKeys.map((key) => ({
    key,
    labelKey: `banner${key[0].toUpperCase()}${key.slice(1)}` as ProjectBanner["labelKey"],
    ...BANNERS[key],
}));

const bannersByKey = new Map(projectBanners.map((banner) => [banner.key, banner]));

export function getProjectBanner(key: ProjectGradientKey): ProjectBanner {
    return bannersByKey.get(key)!;
}
