const agent = {
        apiTokens: "Tokens de API", apiTokensDescription: "Deixe ferramentas como o Claude Code ler e alterar o Rinia por você. Um token pode fazer tudo o que você pode.",
        tokenName: "Nome do token", tokenNameHint: "Onde ele será usado, para reconhecê-lo depois", tokenNamePlaceholder: "Claude Code no notebook", tokenNamePlaceholderFor: "{{name}} no notebook", createToken: "Criar token",
        newToken: "Copie seu novo token", newTokenHint: "Ele não será mostrado de novo. Guarde-o em um lugar seguro, como uma senha.", useInIntegrations: "Conecte uma ferramenta com ele em", hideToken: "Já copiei",
        tokenCreatedOn: "Criado em {{date}}", tokenLastUsed: "usado pela última vez em {{date}}", tokenNeverUsed: "nunca usado", yourTokens: "Seus tokens", noApiTokens: "Nenhum token ainda.",
        revokeToken: "Revogar token", revokeTokenNamed: "Revogar {{name}}", revokeTokenDescription: "O que estiver usando “{{name}}” perde o acesso na hora. Isso não pode ser desfeito.",
        couldNotLoadTokens: "Não foi possível carregar seus tokens.", couldNotCreateToken: "Não foi possível criar o token.", couldNotRevokeToken: "Não foi possível revogar o token.",
    } as const;

export default agent;
