(function () {
    var key = "rinia-theme";
    var preference = "system";
    var resolved = "dark";
    try {
        var stored = localStorage.getItem(key);
        if (stored === "light" || stored === "light-contrast") preference = "light";
        else if (stored === "dark" || stored === "dark-contrast") preference = "dark";
    } catch (e) {}
    if (preference === "system") {
        try {
            resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        } catch (e) {}
    } else {
        resolved = preference;
    }
    var root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-theme-preference", preference);
    root.style.colorScheme = resolved === "dark" ? "dark" : "light";
    root.classList.toggle("dark-mode", resolved === "dark");
    // The browser and installed-app title bar take this colour; applyTheme keeps it in sync afterwards.
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", resolved === "dark" ? "#090909" : "#ebebeb");
    try {
        var locale = localStorage.getItem("rinia.locale.anonymous");
        if (locale === "en" || locale === "pt-BR") root.lang = locale;
    } catch (e) {}
    var density = "comfortable";
    try {
        var storedDensity = localStorage.getItem("rinia.density");
        if (storedDensity === "compact" || storedDensity === "comfortable") density = storedDensity;
    } catch (e) {}
    root.setAttribute("data-density", density);
})();
