const agent = {
        apiTokens: "Tokens de API", apiTokensDescription: "Deixe ferramentas como o Claude Code ler e alterar o Rinia por você. Um token pode fazer tudo o que você pode, ou só ler.",
        tokenName: "Nome do token", tokenNameHint: "Onde ele será usado, para reconhecê-lo depois", tokenNamePlaceholder: "Claude Code no notebook", tokenNamePlaceholderFor: "{{name}} no notebook", createToken: "Criar token",
        newToken: "Copie seu novo token", newTokenHint: "Ele não será mostrado de novo. Guarde-o em um lugar seguro, como uma senha.", useInIntegrations: "Conecte uma ferramenta com ele em", hideToken: "Já copiei",
        tokenCreatedOn: "Criado em {{date}}", tokenLastUsed: "usado pela última vez em {{date}}", tokenNeverUsed: "nunca usado", yourTokens: "Seus tokens", noApiTokens: "Nenhum token ainda.",
        revokeToken: "Revogar token", revokeTokenNamed: "Revogar {{name}}", revokeTokenDescription: "O que estiver usando “{{name}}” perde o acesso na hora. Isso não pode ser desfeito.",
        readOnly: "Somente leitura", readOnlyHint: "A ferramenta pode ver projetos, tarefas e páginas, mas não alterar nada.",
        expiry: "Expira", expiryHint: "Depois disso o token deixa de funcionar e você cria outro.", expiryDays: "Em {{count}} dias", expiryNever: "Sem expiração",
        expiryNeverWarning: "Um token que nunca expira continua valendo para sempre se vazar, de um notebook antigo ou da configuração de um agente. Prefira um que expire.",
        limitProjects: "Limitar a alguns projetos", limitProjectsHint: "Por padrão, um token alcança todos os projetos de que você participa. Escolha os que ele pode usar.", limitProjectsRequired: "Escolha ao menos um projeto, ou desligue o limite.", noProjectsToLimit: "Você ainda não está em nenhum projeto.",
        expiresOn: "expira em {{date}}", expiresInDays_one: "expira em {{count}} dia", expiresInDays_other: "expira em {{count}} dias", expiresToday: "expira hoje", expiredOn: "expirou em {{date}}", expired: "Expirado", noExpiry: "sem expiração",
        allProjects: "todos os projetos", onlyProjects: "somente {{projects}}", onlyProjectsDeleted: "nenhum projeto restante",
        accessRead: "Somente leitura", accessWrite: "Leitura e escrita", viaOAuth: "conectado pelo Rinia",
        couldNotLoadTokens: "Não foi possível carregar seus tokens.", couldNotCreateToken: "Não foi possível criar o token.", couldNotRevokeToken: "Não foi possível revogar o token.",
    } as const;

export default agent;
