const commands = {
        placeholder: "Search or type a command…", issuePlaceholder: "Type a command or search…", label: "Command palette", results: "Commands and results", noResults: "Nothing found",
        groupIssue: "Issue {{id}}", groupActions: "Actions", groupNavigation: "Go to", groupProjects: "Projects", groupIssues: "Issues", groupDocuments: "Documents",
        createIssue: "Create issue", createIssueIn: "Create issue in {{project}}",
        changeState: "Change state…", changePriority: "Change priority…", changeAssignee: "Change assignee…", changeLabels: "Change labels…",
        copyIssueLink: "Copy issue link", copyIssueId: "Copy issue ID",
        themeLight: "Switch to light theme", themeDark: "Switch to dark theme",
        showShortcuts: "Show keyboard shortcuts",
        goInbox: "Inbox", goMyIssues: "My issues", goSettings: "Settings", goProject: "Project overview",
        shortcutsTitle: "Keyboard shortcuts", shortcutsDescription: "Shortcuts don’t fire while you type in a field or the editor.", then: "then", or: "or",
        sectionGeneral: "General", sectionNavigation: "Navigation", sectionList: "Lists and board", sectionIssue: "Issue page",
        openPalette: "Open the command palette", openShortcuts: "Show this panel", newIssue: "Create an issue in the current project",
        moveDown: "Move down", moveUp: "Move up", openSelected: "Open the selected issue", toggleSelected: "Select the issue", selectRange: "Select a range", selectAll: "Select every issue", clearSelection: "Clear the selection",
        setState: "Change state", setPriority: "Change priority", setAssignee: "Change assignee", setEstimate: "Change estimate", setLabels: "Change labels", setDueDate: "Change due date", saveDescription: "Save the description",
    } as const;

export default commands;
