const profile = {
        changeEmail: "Change email", changeEmailDescription: "We will send a confirmation link to the new address. Your current email keeps working until you open the link.",
        newEmail: "New email", sendConfirmation: "Send confirmation", couldNotChangeEmail: "Could not ask to change the email.",
        pendingEmail: "Waiting for confirmation", pendingEmailHint: "We sent a link to {{email}}. The email changes only when you open the link, which works until {{date}}.", cancelEmailChange: "Cancel change",
        password: "Password", passwordDescription: "Changing your password signs you out of other devices. This one stays signed in.", currentPassword: "Current password", newPassword: "New password",
        confirmNewPassword: "Confirm new password", changePassword: "Change password", passwordChanged: "Password changed. Other devices were signed out.", couldNotChangePassword: "Could not change the password.",
        fullName: "Full name", username: "Username", usernameHint: "One word, like a nickname or first name", email: "Email", profilePhoto: "Profile photo", profilePhotoUrl: "Profile photo URL", addPhoto: "Add profile photo", changePhoto: "Change profile photo", removePhoto: "Remove photo",
        profileSaved: "Profile saved.", couldNotSave: "Could not save the profile.", couldNotUpdatePhoto: "Could not update the photo.",
        languageDescription: "Choose the language used across Rinia.",
        theme: "Theme", themeDescription: "Choose the appearance used across Rinia.",
        density: "Density", densityDescription: "How much fits in lists, on the board, and in the sidebar.",
        densityComfortable: "Comfortable", densityCompact: "Compact", densityNotSynced: "Density was not saved. It still applies on this device.",
        themeSystem: "System", themeLight: "Light", themeDark: "Dark", themeLightContrast: "Light high contrast", themeDarkContrast: "Dark high contrast",
    } as const;

export default profile;
