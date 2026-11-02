const oauth = {
        title: "Allow {{app}} to use Rinia?", signedInAs: "Signed in as @{{username}}",
        asksWrite: "{{app}} will be able to read and change your projects, issues and pages, as you.", asksRead: "{{app}} will be able to read your projects, issues and pages, as you, but not change them.",
        returnsTo: "You will be sent back to {{host}}.", readOnly: "Read only", readOnlyHint: "Let it look, but not change anything.",
        allow: "Allow", deny: "Deny", revokeHint: "You can remove its access any time under Settings → API tokens.",
        invalidTitle: "This sign-in link does not work", invalidRequest: "Start the sign-in again from the app you were connecting.",
    } as const;

export default oauth;
