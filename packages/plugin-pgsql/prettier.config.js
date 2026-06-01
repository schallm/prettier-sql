export default {
    plugins: ["./dist/index.js"],

    // ── SQL options ────────────────────────────────────────────────────────
    // sqlKeywordCase: "lower" | "upper" | "preserve"
    sqlKeywordCase: "lower",

    // sqlDensity: "compact" | "standard" | "spacious"
    sqlDensity: "standard",

    // sqlCommaStyle: "trailing" | "leading"
    sqlCommaStyle: "trailing",

    // ── Prettier options ───────────────────────────────────────────────────
    printWidth: 120,
    tabWidth: 4,
    singleQuote: true,
    trailingComma: "all",
};
