const agent = {
        apiTokens: "API tokens", apiTokensDescription: "Let tools such as Claude Code read and change Rinia for you. A token can do everything you can, or only read.",
        tokenName: "Token name", tokenNameHint: "Where it will be used, so you can recognize it later", tokenNamePlaceholder: "Claude Code on my laptop", tokenNamePlaceholderFor: "{{name}} on my laptop", createToken: "Create token",
        newToken: "Copy your new token", newTokenHint: "It will not be shown again. Keep it somewhere safe, like a password.", useInIntegrations: "Connect a tool with it in", hideToken: "I have copied it",
        tokenCreatedOn: "Created {{date}}", tokenLastUsed: "last used {{date}}", tokenNeverUsed: "never used", yourTokens: "Your tokens", noApiTokens: "No tokens yet.",
        revokeToken: "Revoke token", revokeTokenNamed: "Revoke {{name}}", revokeTokenDescription: "Anything using “{{name}}” loses access right away. This cannot be undone.",
        readOnly: "Read only", readOnlyHint: "The tool can look at projects, issues and pages, but not change anything.",
        expiry: "Expires", expiryHint: "After this the token stops working and you create a new one.", expiryDays: "In {{count}} days", expiryNever: "No expiry",
        expiryNeverWarning: "A token that never expires stays valid forever if it leaks, from an old laptop or an agent config. Prefer one that expires.",
        limitProjects: "Limit to some projects", limitProjectsHint: "By default a token reaches every project you belong to. Choose the ones it may use.", limitProjectsRequired: "Choose at least one project, or turn the limit off.", noProjectsToLimit: "You are not in any project yet.",
        expiresOn: "expires {{date}}", expiresInDays_one: "expires in {{count}} day", expiresInDays_other: "expires in {{count}} days", expiresToday: "expires today", expiredOn: "expired {{date}}", expired: "Expired", noExpiry: "no expiry",
        allProjects: "all projects", onlyProjects: "only {{projects}}", onlyProjectsDeleted: "no projects left",
        accessRead: "Read only", accessWrite: "Read and write", viaOAuth: "signed in with Rinia",
        couldNotLoadTokens: "Could not load your tokens.", couldNotCreateToken: "Could not create the token.", couldNotRevokeToken: "Could not revoke the token.",
    } as const;

export default agent;
