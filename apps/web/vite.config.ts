import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { serviceWorker } from "./vite-plugins/service-worker";

export default defineConfig({
    plugins: [react(), tailwindcss(), serviceWorker()],
    resolve: {
        alias: {
            "@": `${import.meta.dirname}/src`,
        },
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
