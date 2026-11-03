const projectStats = {
        title: "Activity", since: "Since {{date}}", perDay: "per day", perWeek: "per week", perMonth: "per month", loading: "Loading project activity", loadFailed: "Couldn’t load the project’s activity.",
        openIssues: "Open issues", completedSince: "Completed issues", longestStreak: "Longest streak", currentStreak: "Current streak",
        streakDays_zero: "0 days", streakDays_one: "{{count}} day", streakDays_other: "{{count}} days",
        heatmapLabel: "Activity map for the past year", heatmapSummary_zero: "No activity in the past year", heatmapSummary_one: "{{count}} action in the past year", heatmapSummary_other: "{{count}} actions in the past year",
        less: "Less", more: "More", noActivity: "No activity",
        completedCount_one: "{{count}} completed", completedCount_other: "{{count}} completed",
        createdCount_one: "{{count}} created", createdCount_other: "{{count}} created",
        updatedCount_one: "{{count}} update", updatedCount_other: "{{count}} updates",
        completedTitle: "Completed issues", completedTotal_zero: "No issues completed", completedTotal_one: "{{count}} issue completed", completedTotal_other: "{{count}} issues completed",
        createdTitle: "Created issues", createdTotal_zero: "No issues created", createdTotal_one: "{{count}} issue created", createdTotal_other: "{{count}} issues created",
        peopleTitle: "Performance by person", peopleHint: "Since the project was created. A completed issue counts for whoever it is assigned to.", person: "Person", completed: "Completed", open: "Open", created: "Created",
        seriesWeb: "In the app", seriesMcp: "Through MCP", total: "Total", today: "Today", date: "Date",
        tableCaption: "Values by day",
    } as const;

export default projectStats;
