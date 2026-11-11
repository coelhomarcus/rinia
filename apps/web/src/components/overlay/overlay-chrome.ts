/** Shared looks for dropdowns. Each includes `overlay-motion`, so anything built on them eases in and out. */
export const overlayChrome = {
    popup: "overlay-motion rounded-lg border border-subtle bg-menu shadow-overlay-200 outline-none",
    popupPadded: "overlay-motion rounded-lg border border-subtle bg-menu p-3 shadow-overlay-200 outline-none",
    menu: "overlay-motion rounded-lg border border-subtle bg-menu p-1 shadow-overlay-200 outline-none",
} as const;
