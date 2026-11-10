import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const source = ["**/*.{ts,tsx}"];

/** The type-checked preset stays visible, and the rules we enforce fail the build. */
function asWarnings(config) {
    const rules = {};
    for (const [name, value] of Object.entries(config.rules ?? {})) {
        const level = Array.isArray(value) ? value[0] : value;
        rules[name] = level === "error" || level === 2 ? (Array.isArray(value) ? ["warn", ...value.slice(1)] : "warn") : value;
    }
    return { ...config, files: source, rules };
}

const a11yRules = Object.fromEntries(Object.keys(jsxA11y.flatConfigs.recommended.rules).map((rule) => [rule, "warn"]));

export default tseslint.config(
    {
        ignores: ["**/dist/**", "**/node_modules/**", "**/.vite/**", "**/tests/**", "**/tests-db/**", "**/scripts/**", "**/drizzle.config.ts"],
    },
    ...tseslint.configs.recommendedTypeChecked.map(asWarnings),
    {
        files: source,
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/no-floating-promises": "error",
            // Event handlers, in JSX or in option objects, are fire-and-forget. A promise handed to a void callback such as an Express handler still has to be handled.
            "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false, properties: false } }],
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
        },
    },
    {
        files: source,
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
            "jsx-a11y": jsxA11y,
        },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            // Missing dependencies are reported, and tightened once each effect is checked.
            "react-hooks/exhaustive-deps": "warn",
            "react-refresh/only-export-components": "warn",
            ...a11yRules,
        },
    },
);
