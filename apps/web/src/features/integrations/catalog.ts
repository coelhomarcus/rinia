import type { SnippetLanguage } from "./highlight";
import { logos, type Logo } from "./logos";

/** A translation key in the `integrations` namespace. */
export type IntegrationText = `integrations.${string}`;

export type IntegrationCategory = "ai" | "engineering" | "communication";

export interface SetupStep {
    text: IntegrationText;
    /** Something to paste, built from the server address and the token (a placeholder until one is created). */
    snippet?: { language: SnippetLanguage; code: (setup: { url: string; token: string }) => string };
}

interface IntegrationBase {
    slug: string;
    name: string;
    category: IntegrationCategory;
    logo: Logo;
    tagline: IntegrationText;
}

/**
 * A tool that connects through Rinia's MCP server today. Most can do it two ways: sign in with Rinia (OAuth), where
 * the person allows the tool in the browser and nothing is copied, or an API token for machines without a browser.
 */
export interface McpIntegration extends IntegrationBase {
    available: true;
    website: string;
    /** Steps when the tool signs in with Rinia. */
    signInSteps?: SetupStep[];
    /** Steps with an API token, which the page offers to create first. */
    tokenSteps?: SetupStep[];
    note?: IntegrationText;
}

export interface UpcomingIntegration extends IntegrationBase {
    available: false;
}

export type Integration = McpIntegration | UpcomingIntegration;

export const TOKEN_PLACEHOLDER = "rinia_...";

/**
 * Every integration, in the order the catalog shows them. The setup formats follow each client's documentation for a
 * remote HTTP server: its OAuth sign-in, or a static bearer header.
 */
export const integrations: Integration[] = [
    {
        slug: "claude-code",
        name: "Claude Code",
        category: "ai",
        logo: logos.claudeCode,
        tagline: "integrations.claudeCodeTagline",
        available: true,
        website: "https://claude.com/product/claude-code",
        signInSteps: [
            { text: "integrations.claudeCodeStep1", snippet: { language: "bash", code: ({ url }) => `claude mcp add --transport http rinia ${url}` } },
            { text: "integrations.claudeCodeSignIn" },
        ],
        tokenSteps: [
            {
                text: "integrations.claudeCodeStep1",
                snippet: {
                    language: "bash",
                    code: ({ url, token }) => [`claude mcp add --transport http rinia \\`, `  ${url} \\`, `  --header "Authorization: Bearer ${token}"`].join("\n"),
                },
            },
            { text: "integrations.claudeCodeStep2" },
        ],
    },
    {
        slug: "claude",
        name: "Claude",
        category: "ai",
        logo: logos.claude,
        tagline: "integrations.claudeTagline",
        available: true,
        website: "https://claude.ai",
        // Claude connects from Anthropic's cloud and signs in on its own; it has no place for a token.
        signInSteps: [
            { text: "integrations.claudeStep1" },
            { text: "integrations.claudeStep2", snippet: { language: "text", code: ({ url }) => url } },
            { text: "integrations.claudeStep3" },
        ],
        note: "integrations.claudeNote",
    },
    {
        slug: "github-copilot",
        name: "GitHub Copilot",
        category: "ai",
        logo: logos.githubCopilot,
        tagline: "integrations.copilotTagline",
        available: true,
        website: "https://code.visualstudio.com/docs/copilot/chat/mcp-servers",
        signInSteps: [
            { text: "integrations.copilotStep1", snippet: { language: "json", code: ({ url }) => JSON.stringify({ servers: { rinia: { type: "http", url } } }, null, 2) } },
            { text: "integrations.copilotSignIn" },
        ],
        tokenSteps: [
            {
                text: "integrations.copilotStep1",
                // The token is asked for when the server starts, so it never sits in a file that may be committed.
                snippet: {
                    language: "json",
                    code: ({ url }) =>
                        JSON.stringify(
                            {
                                inputs: [{ type: "promptString", id: "rinia-token", description: "Rinia API token", password: true }],
                                servers: { rinia: { type: "http", url, headers: { Authorization: "Bearer ${input:rinia-token}" } } },
                            },
                            null,
                            2,
                        ),
                },
            },
            { text: "integrations.copilotStep2" },
        ],
    },
    {
        slug: "codex",
        name: "Codex",
        category: "ai",
        logo: logos.codex,
        tagline: "integrations.codexTagline",
        available: true,
        website: "https://developers.openai.com/codex",
        signInSteps: [
            { text: "integrations.codexStep2", snippet: { language: "toml", code: ({ url }) => [`[mcp_servers.rinia]`, `url = "${url}"`].join("\n") } },
            { text: "integrations.codexSignIn", snippet: { language: "bash", code: () => "codex mcp login rinia" } },
        ],
        tokenSteps: [
            { text: "integrations.codexStep1", snippet: { language: "bash", code: ({ token }) => `export RINIA_TOKEN="${token}"` } },
            {
                text: "integrations.codexStep2",
                snippet: { language: "toml", code: ({ url }) => [`[mcp_servers.rinia]`, `url = "${url}"`, `bearer_token_env_var = "RINIA_TOKEN"`].join("\n") },
            },
            { text: "integrations.codexStep3" },
        ],
    },
    {
        slug: "gemini-cli",
        name: "Gemini CLI",
        category: "ai",
        logo: logos.geminiCli,
        tagline: "integrations.geminiTagline",
        available: true,
        website: "https://github.com/google-gemini/gemini-cli",
        signInSteps: [
            { text: "integrations.geminiStep1", snippet: { language: "json", code: ({ url }) => JSON.stringify({ mcpServers: { rinia: { httpUrl: url } } }, null, 2) } },
            { text: "integrations.geminiSignIn" },
        ],
        tokenSteps: [
            {
                text: "integrations.geminiStep1",
                snippet: { language: "json", code: ({ url, token }) => JSON.stringify({ mcpServers: { rinia: { httpUrl: url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2) },
            },
            { text: "integrations.geminiStep2" },
        ],
    },
    {
        slug: "mcp",
        name: "MCP",
        category: "ai",
        logo: logos.mcp,
        tagline: "integrations.mcpTagline",
        available: true,
        website: "https://modelcontextprotocol.io",
        signInSteps: [
            { text: "integrations.mcpStep1", snippet: { language: "text", code: ({ url }) => url } },
            { text: "integrations.mcpSignIn" },
        ],
        tokenSteps: [
            { text: "integrations.mcpStep1", snippet: { language: "text", code: ({ url }) => url } },
            { text: "integrations.mcpStep2", snippet: { language: "text", code: ({ token }) => `Authorization: Bearer ${token}` } },
        ],
    },
    { slug: "github", name: "GitHub", category: "engineering", logo: logos.github, tagline: "integrations.githubTagline", available: false },
    { slug: "slack", name: "Slack", category: "communication", logo: logos.slack, tagline: "integrations.slackTagline", available: false },
    { slug: "discord", name: "Discord", category: "communication", logo: logos.discord, tagline: "integrations.discordTagline", available: false },
];

export const integrationCategories: Array<{ id: IntegrationCategory; label: IntegrationText }> = [
    { id: "ai", label: "integrations.categoryAi" },
    { id: "engineering", label: "integrations.categoryEngineering" },
    { id: "communication", label: "integrations.categoryCommunication" },
];

export function findIntegration(slug: string | undefined): McpIntegration | undefined {
    const found = integrations.find((integration) => integration.slug === slug);
    return found?.available ? found : undefined;
}

/** Where tools reach Rinia's MCP server: the same origin as the app, which serves or proxies the API. */
export function mcpServerUrl() {
    return `${window.location.origin}/api/mcp`;
}
