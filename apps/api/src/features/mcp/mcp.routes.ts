import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { cleanClientName } from "@rinia/shared";
import { Router, type Request } from "express";
import { env } from "../../config/env";
import { asyncHandler } from "../../middleware/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { createMcpServer } from "./mcp.server";

/** Links in results open where the request came in, unless APP_URL says where Rinia lives. */
function appBaseUrl(req: Request) {
    return env.APP_URL ?? `${req.protocol}://${req.get("host")}`;
}

/** HTTP libraries and browsers say nothing about which tool is behind them. */
const GENERIC_USER_AGENT = /^(node|undici|axios|curl|wget|python|aiohttp|httpx|go-http-client|okhttp|got|fetch|mozilla)\b/i;

/**
 * The tool behind a request. An `initialize` message names it as `clientInfo.name`; later requests in this stateless
 * server do not, so they fall back to the first product in the User-Agent unless that is only an HTTP library.
 */
function mcpClient(req: Request): string | null {
    const info = (req.body as { method?: unknown; params?: { clientInfo?: { name?: unknown } } } | undefined);
    if (info?.method === "initialize") return cleanClientName(info.params?.clientInfo?.name);
    const product = req.get("user-agent")?.trim().split(/[\s/]/)[0] ?? "";
    return GENERIC_USER_AGENT.test(product) ? null : cleanClientName(product);
}

/**
 * The MCP endpoint for AI tools such as Claude Code, over streamable HTTP. It is stateless: each request carries its
 * API token and gets a server of its own, so a revoked token stops working at the next call.
 */
export const mcpRouter = Router();

mcpRouter.use((_req, res, next) => {
    // Tells MCP clients that a refused request needs a bearer token, instead of leaving them to look for OAuth.
    res.set("WWW-Authenticate", 'Bearer realm="Rinia"');
    next();
}, requireAuth);

mcpRouter.post(
    "/",
    asyncHandler(async (req, res) => {
        const server = createMcpServer({ user: req.user!, baseUrl: appBaseUrl(req), client: mcpClient(req) });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on("close", () => {
            void transport.close();
            void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    }),
);

// Without sessions there is no stream for the server to push on and nothing to end.
mcpRouter.all("/", (_req, res) => {
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
});
