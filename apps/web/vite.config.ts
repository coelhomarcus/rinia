import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { serviceWorker } from "./vite-plugins/service-worker";

/** `node_modules/<package>/` for any of these packages, wherever the package manager put them. */
const packages = (...names: string[]) => new RegExp(`[\\\\/]node_modules[\\\\/](?:${names.join("|")})[\\\\/]`);

/**
 * Libraries that only some pages need, each in a chunk of its own. Without a group, the bundler puts them with whatever
 * app code shares their importers, and a page that needs a hook from that code downloads the editor with it.
 */
const vendorGroups = [
    // The editor and everything it syncs with: pages, issue descriptions and comments.
    { name: "editor", test: packages("@tiptap", "prosemirror-[^\\\\/]+", "linkifyjs", "orderedmap", "rope-sequence", "w3c-keyname", "crelt", "yjs", "lib0", "y-[^\\\\/]+") },
    // Drag and drop, on the board and in lists that can be reordered.
    { name: "dnd", test: packages("@dnd-kit") },
    // Syntax highlighting, for the code samples of the integration pages.
    { name: "highlight", test: packages("@twinkleplop") },
];

export default defineConfig({
    plugins: [react(), tailwindcss(), serviceWorker()],
    resolve: {
        alias: {
            "@": `${import.meta.dirname}/src`,
        },
    },
    build: {
        rolldownOptions: { output: { codeSplitting: { includeDependenciesRecursively: false, groups: vendorGroups } } },
        // `scripts/check-bundle-size.mjs` holds the real budget, per route; this only keeps the build log quiet about the editor.
        chunkSizeWarningLimit: 700,
    },
    server: {
        proxy: {
            // `ws` also forwards the realtime socket at /api/realtime.
            "/api": { target: "http://localhost:3000", ws: true },
            // OAuth discovery for MCP clients that connect through the dev server.
            "/.well-known/oauth-authorization-server": "http://localhost:3000",
            "/.well-known/oauth-protected-resource": "http://localhost:3000",
        },
    },
});
