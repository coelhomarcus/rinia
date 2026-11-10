const errors = {
        resetLinkInvalid: "Este link é inválido ou expirou.", incorrectPassword: "A senha atual está incorreta.", emailUnavailable: "O envio de e-mails não está configurado neste servidor.", emailFailed: "Não foi possível enviar o e-mail. Tente novamente mais tarde.", tooManyPasswordAttempts: "Muitas tentativas com senha. Tente novamente em alguns minutos.",
        notAuthenticated: "Você não está autenticado", invalidSession: "Sessão inválida ou expirada", invalidData: "Confira os campos destacados.", unsupportedContent: "Este conteúdo tem blocos que este campo não aceita.",
        requestFailed: "Não foi possível concluir a solicitação.", internal: "Ocorreu um erro interno. Tente novamente.",
        tooLarge: "Este documento é grande demais para salvar. Divida o conteúdo em páginas menores.",
        projectNotFound: "Projeto não encontrado", issueNotFound: "Tarefa não encontrada", documentNotFound: "Documento não encontrado", viewNotFound: "View não encontrada",
        notFound: "O item solicitado não foi encontrado.", accountFieldInUse: "Este campo ({{field}}) já está em uso.", requestLimit: "Muitas solicitações. Tente novamente mais tarde.",
        accountSuspended: "Esta conta está suspensa. Fale com um administrador.", ownAccount: "Você não pode fazer isso com a sua própria conta.", incorrectCredentials: "Usuário ou senha incorretos", invalidSpecialCode: "Código especial inválido", projectKeyInUse: "Este ID de projeto já está em uso",
        projectKeyLocked: "O ID do projeto não pode ser alterado depois da criação da primeira tarefa", membershipRequired: "Você não é membro deste projeto",
        permissionDenied: "Você não tem permissão para realizar esta ação.", conflict: "Este item foi atualizado em outro lugar. Atualize e tente novamente.",
        tooManyLoginAttempts: "Muitas tentativas de acesso. Tente novamente em alguns minutos.", tooManyRegistrationAttempts: "Muitas tentativas de cadastro. Tente novamente mais tarde.",
        saveConflict: "Esta página foi atualizada em outro lugar. Seu rascunho foi mantido.", issueDescriptionConflict: "A descrição desta tarefa foi atualizada em outro lugar. Seu rascunho foi mantido.", screenFailureTitle: "Algo deu errado", screenFailureDescription: "O Rinia não conseguiu abrir esta tela. Recarregue a página ou volte aos projetos.", goToProjects: "Ir para projetos", reloadPage: "Recarregar página", notFoundTitle: "404 · Não encontrado", pageMissing: "Esta página não existe.", pageMissingDescription: "O link pode estar desatualizado ou a página pode ter sido movida.", goHome: "Ir para o início",
    } as const;

export default errors;
