const projects = {
        project: "Project", updated: "Updated", noProjects: "No projects yet",
        projectStatus: "Project status",
        workflowSummary: "A quick view of the work across your workflow.", issueCount_one: "{{count}} issue", issueCount_other: "{{count}} issues",
        addStatus: "Add a status to start organizing issues.", estimate: "Estimate",
        points: "{{count}} points", views: "Project views", viewsDescription: "Choose the workspace that matches the way you want to work.",
        board: "Board", browseIssues: "Browse, filter, and update the project work.", moveIssues: "Move issues through their statuses.",
        mainDocument: "Keep the project's main document in one place.", createProject: "Create project", projectName: "Project name", projectId: "Project ID",
        projectIdHint: "Used as the prefix for issue identifiers.", projectIssueKeyHint: "2–8 letters or numbers, used in issue identifiers. Leave blank to generate automatically.", description: "Description", describeProject: "Describe your project...", repository: "Repository URL", icon: "Project icon",
        chooseIcon: "Choose project icon", chooseAnIcon: "Choose an icon", loadingIcons: "Loading icons…", deleteDescription: "All issues, documents, states, labels, and memberships in {{name}} will be permanently deleted. This cannot be undone.", enterProjectName: "Enter the project name", couldNotDelete: "Could not delete the project. Try again.",
        projectCreated: "Project created.", projectKeyInUse: "Project ID is already in use.", deleteProject: "Delete project", openRepository: "Open repository", couldNotCreate: "Could not create the project.",
        noDescription: "No description", updatedAt: "Updated {{date}}",
        homeResources: "Project resources", homeResourcesHint: "Add documents to keep what the team needs to know in one place.", viewMembers: "View members",
        addDescription: "Add a description…", goTo: "Go to",
        deleteProjectPrompt: "To confirm, type “{{phrase}}”", deletePhrase: "delete my project", confirmDelete: "Delete my project",
        columnActions: "Column actions", hideColumn: "Hide column", manageStates: "Manage states", showColumn: "Show column", hiddenColumns: "Hidden columns", showAllColumns: "Show all columns", noHiddenColumns: "No hidden columns", columnHidden: "Column hidden",
    } as const;

export default projects;
