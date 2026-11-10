const security = {
        description: "Your password and the devices signed in to your account.",
        activeSessions: "Active sessions", activeSessionsDescription: "Browsers signed in to your account. Sign out any you do not recognize.",
        thisDevice: "This device", activeNow: "Active now", lastSeen: "Seen {{when}}", signedInOn: "Signed in on {{date}}",
        browserOn: "{{browser}} on {{os}}", unknownDevice: "Unknown device",
        signOut: "Sign out", signOutSession: "Sign out session", signOutSessionDescription: "{{device}} will be signed out at once and have to sign in again.",
        signOutOthers: "Sign out of other devices",
        signOutOthersDescription_one: "{{count}} other device will be signed out at once. This one stays signed in.",
        signOutOthersDescription_other: "{{count}} other devices will be signed out at once. This one stays signed in.",
        couldNotSignOut: "Could not sign out the session.", couldNotLoadSessions: "Could not load the sessions.",
    } as const;

export default security;
