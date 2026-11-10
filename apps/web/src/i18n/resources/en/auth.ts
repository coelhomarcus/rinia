const auth = {
        forgotPassword: "Forgot your password?", forgotPasswordTitle: "Recover access", forgotPasswordDescription: "Enter your username or email and we will send a link to choose a new password.",
        sendResetLink: "Send link", resetLinkSent: "If an account matches that username or email, we sent a link to its email. Check your spam too. The link works for 1 hour.",
        couldNotSendLink: "Could not send the link.", recoveryUnavailable: "Recovery by email is not set up on this server. Ask an admin to reset your password.",
        backToSignIn: "Back to sign in", resetPasswordTitle: "Choose a new password", resetPasswordDescription: "Saving signs you out of every device, and you sign in again with the new password.",
        newPassword: "New password", confirmPassword: "Confirm new password", saveNewPassword: "Save new password", couldNotResetPassword: "Could not reset the password.",
        requestNewLink: "Ask for a new link", passwordResetDone: "Password changed. Sign in with your new password.",
        signIn: "Sign in", signInContinue: "Sign in to your account to continue", usernameOrEmail: "Username or email", password: "Password",
        noAccount: "Don't have an account?", createAccount: "Create an account", registrationRequiresCode: "Registration requires a special invitation code",
        name: "Name", username: "Username", email: "Email", specialCode: "Special code", usernameHint: "Lowercase letters, numbers, and _ only",
        passwordHint: "At least 8 characters", alreadyHaveAccount: "Already have an account?", unableToSignIn: "Unable to sign in",
        unableToCreateAccount: "Unable to create the account", footer: "Rinia · Your projects, in one place.", loadingSession: "Loading your session…", loadingPage: "Loading authentication page",
    } as const;

export default auth;
