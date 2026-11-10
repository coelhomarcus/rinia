(function () {
    var key = "rinia-theme";
    var preference = "dark";
    try {
        var stored = localStorage.getItem(key);
        if (stored === "light" || stored === "light-contrast") preference = "light";
        else if (stored === "system") preference = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (e) {}
    var resolved = preference;
    var root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-theme-preference", preference);
    root.style.colorScheme = resolved.indexOf("dark") !== -1 ? "dark" : "light";
    root.classList.toggle("dark-mode", resolved.indexOf("dark") !== -1);
    // The browser and installed-app title bar take this colour; applyTheme keeps it in sync afterwards.
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", resolved.indexOf("dark") !== -1 ? "#090909" : "#f4f4f5");
    try {
        var locale = localStorage.getItem("rinia.locale.anonymous");
        if (locale === "en" || locale === "pt-BR") root.lang = locale;
    } catch (e) {}
})();
