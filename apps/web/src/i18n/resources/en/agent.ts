const agent = {
        apiTokens: "API tokens", apiTokensDescription: "Let tools such as Claude Code read and change Rinia for you. A token can do everything you can.",
        tokenName: "Token name", tokenNameHint: "Where it will be used, so you can recognize it later", tokenNamePlaceholder: "Claude Code on my laptop", tokenNamePlaceholderFor: "{{name}} on my laptop", createToken: "Create token",
        newToken: "Copy your new token", newTokenHint: "It will not be shown again. Keep it somewhere safe, like a password.", useInIntegrations: "Connect a tool with it in", hideToken: "I have copied it",
        tokenCreatedOn: "Created {{date}}", tokenLastUsed: "last used {{date}}", tokenNeverUsed: "never used", yourTokens: "Your tokens", noApiTokens: "No tokens yet.",
        revokeToken: "Revoke token", revokeTokenNamed: "Revoke {{name}}", revokeTokenDescription: "Anything using “{{name}}” loses access right away. This cannot be undone.",
        couldNotLoadTokens: "Could not load your tokens.", couldNotCreateToken: "Could not create the token.", couldNotRevokeToken: "Could not revoke the token.",
    } as const;

export default agent;
