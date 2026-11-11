const myIssues = {
        title: "My issues", assigned: "Assigned", created: "Created", following: "Subscribed", activity: "Activity", tabs: "Which issues",
        project: "Project", couldNotLoad: "Could not load your issues.", conditionProject: "project {{value}}",
        emptyAssignedTitle: "Nothing is assigned to you", emptyAssigned: "Issues assigned to you in any project show up here.",
        emptyCreatedTitle: "You haven't created any issues", emptyCreated: "Issues you create in any project show up here.",
        emptyActivityTitle: "No recent activity", emptyActivity: "Issues you create, change, comment on, or react to show up here, the latest first.",
        emptyFollowingTitle: "You aren't subscribed to any issues", emptyFollowing: "You follow the issues you create, are assigned, comment on, or are mentioned in. To follow any other, use the bell on its page.",
    } as const;

export default myIssues;
