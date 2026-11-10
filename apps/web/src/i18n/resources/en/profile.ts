const profile = {
        password: "Password", passwordDescription: "Changing your password signs you out of other devices. This one stays signed in.", currentPassword: "Current password", newPassword: "New password",
        confirmNewPassword: "Confirm new password", changePassword: "Change password", passwordChanged: "Password changed. Other devices were signed out.", couldNotChangePassword: "Could not change the password.",
        fullName: "Full name", username: "Username", usernameHint: "One word, like a nickname or first name", email: "Email", profilePhoto: "Profile photo", profilePhotoUrl: "Profile photo URL", addPhoto: "Add profile photo", changePhoto: "Change profile photo", removePhoto: "Remove photo",
        profileSaved: "Profile saved.", couldNotSave: "Could not save the profile.", couldNotUpdatePhoto: "Could not update the photo.",
        languageDescription: "Choose the language used across Rinia.",
        theme: "Theme", themeDescription: "Choose the appearance used across Rinia.",
        themeSystem: "System", themeLight: "Light", themeDark: "Dark", themeLightContrast: "Light high contrast", themeDarkContrast: "Dark high contrast",
    } as const;

export default profile;
