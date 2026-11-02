import { describe, expect, test } from "bun:test";
import {
    BANNER_TEXT_OVERLAY_ALPHA,
    ICON_BACKING_DARK,
    ICON_BACKING_LIGHT,
    compositeColor,
    contrastRatio,
    getProjectBanner,
    parseProjectCover,
    projectBannerGroups,
    projectBanners,
    projectCoverSchema,
    projectGradientKeys,
    readableBacking,
    relativeLuminance,
} from "@rinia/shared";
import enAppearance from "../src/i18n/resources/en/appearance";
import ptAppearance from "../src/i18n/resources/pt-BR/appearance";

/** The banners shipped before the registry, with their exact CSS. Saved projects point at these keys. */
const ORIGINAL_BANNERS = {
    aurora: "linear-gradient(135deg, #134e4a 0%, #1d4ed8 52%, #6d28d9 100%)",
    dusk: "linear-gradient(135deg, #5b21b6 0%, #be185d 48%, #c2410c 100%)",
    ember: "linear-gradient(135deg, #7f1d1d 0%, #c2410c 50%, #a16207 100%)",
    lagoon: "linear-gradient(135deg, #155e75 0%, #0369a1 50%, #1e3a8a 100%)",
    midnight: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #312e81 100%)",
    orchid: "linear-gradient(135deg, #4a044e 0%, #9d174d 50%, #831843 100%)",
    pine: "linear-gradient(135deg, #14532d 0%, #166534 45%, #115e59 100%)",
    slate: "linear-gradient(135deg, #1e293b 0%, #334155 50%, #0f172a 100%)",
};

/** The icon colour picker's presets, the default icon colour, and the extremes. */
const ICON_COLORS = ["#8a8f98", "#5e6ad2", "#0097ff", "#26b5ce", "#4cb782", "#f2c94c", "#f2994a", "#eb5757", "#e255a1", "#9b51e0", "#000000", "#ffffff", "#808080", "#777777"];

describe("contrast", () => {
    test("relativeLuminance runs from black to white", () => {
        expect(relativeLuminance("#000000")).toBe(0);
        expect(relativeLuminance("#ffffff")).toBe(1);
        expect(relativeLuminance("#fff")).toBe(1);
    });

    test("contrastRatio matches known WCAG values", () => {
        expect(contrastRatio("#000000", "#ffffff")).toBe(21);
        expect(contrastRatio("#ffffff", "#000000")).toBe(21);
        expect(contrastRatio("#5e6ad2", "#5e6ad2")).toBe(1);
        expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
        expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    });

    test("compositeColor paints a translucent layer", () => {
        expect(compositeColor("#000000", "#ffffff", 0.5)).toBe("#808080");
        expect(compositeColor("#336699", "#000000", 0)).toBe("#336699");
        expect(compositeColor("#336699", "#000000", 1)).toBe("#000000");
    });

    test("readableBacking puts dark glyphs on light and light glyphs on dark", () => {
        expect(readableBacking("#000000")).toBe(ICON_BACKING_LIGHT);
        expect(readableBacking("#1e3a8a")).toBe(ICON_BACKING_LIGHT);
        expect(readableBacking("#ffffff")).toBe(ICON_BACKING_DARK);
        expect(readableBacking("#f2c94c")).toBe(ICON_BACKING_DARK);
    });

    test("readableBacking reaches 3:1 for middle colours too", () => {
        for (const color of ["#808080", "#777777", "#5e6ad2", "#eb5757", "#26b5ce"]) {
            expect(contrastRatio(color, readableBacking(color))).toBeGreaterThanOrEqual(3);
        }
        // The worst case sits where both backings contrast equally; it still clears 4:1.
        let worst = 21;
        for (let grey = 0; grey < 256; grey++) {
            const color = `#${grey.toString(16).padStart(2, "0").repeat(3)}`;
            worst = Math.min(worst, contrastRatio(color, readableBacking(color)));
        }
        expect(worst).toBeGreaterThan(4);
    });
});

describe("project banners", () => {
    test("keys are unique and every banner is in a known group", () => {
        expect(new Set(projectGradientKeys).size).toBe(projectGradientKeys.length);
        expect(projectBanners.map((banner) => banner.key)).toEqual(projectGradientKeys);
        for (const banner of projectBanners) expect(projectBannerGroups).toContain(banner.group);
        for (const group of projectBannerGroups) expect(projectBanners.some((banner) => banner.group === group)).toBe(true);
        expect(projectBanners.length).toBeGreaterThanOrEqual(30);
    });

    test("the original eight banners keep their keys and look", () => {
        for (const [key, css] of Object.entries(ORIGINAL_BANNERS)) {
            expect(projectGradientKeys).toContain(key as never);
            expect(getProjectBanner(key as keyof typeof ORIGINAL_BANNERS).css).toBe(css);
            expect(parseProjectCover({ type: "gradient", key })).toEqual({ type: "gradient", key } as never);
        }
    });

    test("every key is a valid cover and unknown keys are not", () => {
        for (const key of projectGradientKeys) expect(projectCoverSchema.safeParse({ type: "gradient", key }).success).toBe(true);
        expect(parseProjectCover({ type: "gradient", key: "unknown" })).toBeNull();
    });

    test("every banner is pure CSS with no network requests", () => {
        for (const banner of projectBanners) {
            expect(banner.css).not.toMatch(/https?:/);
            for (const match of banner.css.matchAll(/url\("([^"]*)"\)/g)) expect(match[1]).toStartWith("data:image/svg+xml,");
        }
    });

    test("every banner has a name in English and Portuguese", () => {
        for (const banner of projectBanners) {
            expect(enAppearance[banner.labelKey]).toBeTruthy();
            expect(ptAppearance[banner.labelKey]).toBeTruthy();
        }
    });

    test("white text reaches 4.5:1 on the lightest colour of every dark banner, under the card's shade", () => {
        for (const banner of projectBanners.filter((entry) => entry.tone === "dark")) {
            for (const color of banner.colors) {
                const shaded = compositeColor(color, "#000000", BANNER_TEXT_OVERLAY_ALPHA);
                expect({ banner: banner.key, color, ok: contrastRatio("#ffffff", shaded) >= 4.5 }).toEqual({ banner: banner.key, color, ok: true });
            }
        }
    });

    test("a coloured icon reaches 3:1 against its backing on every banner", () => {
        for (const banner of projectBanners) {
            for (const color of ICON_COLORS) {
                const ratio = contrastRatio(color, readableBacking(color));
                expect({ banner: banner.key, color, ok: ratio >= 3 }).toEqual({ banner: banner.key, color, ok: true });
            }
        }
    });
});
