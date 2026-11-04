/**
 * Adds useTheme() to child components that build themed styles but don't
 * subscribe themselves (OfflineBanner, StreakBadge, StreakCelebration,
 * VideoSolutionPlayer). Run: node scripts/add-use-theme-to-components.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const files = [
    "src/components/OfflineBanner.tsx",
    "src/components/StreakBadge.tsx",
    "src/components/StreakCelebration.tsx",
    "src/components/VideoSolutionPlayer.tsx",
];

for (const rel of files) {
    const abs = path.join(ROOT, rel);
    let s = fs.readFileSync(abs, "utf8");
    if (s.includes("useTheme()")) {
        console.log("skip (already hooked): " + rel);
        continue;
    }
    if (!s.includes("theme-context")) {
        s = s.replace(
            /(import \{ getPaletteSnapshot, subscribeTheme, type Palette \} from ["']@\/src\/theme["'];)/,
            "$1\nimport { useTheme } from \"@/src/theme-context\";"
        );
    }
    // Insert into the first exported function component (export function /
    // export default function), skipping plain helper functions.
    const re = /(export (?:default )?function \w+\s*\([^)]*\)\s*\{\n)/;
    const m = s.match(re);
    if (m) {
        const at = m.index + m[0].length;
        s = s.slice(0, at) + "  useTheme(); // re-render when light/dark changes\n" + s.slice(at);
        fs.writeFileSync(abs, s, "utf8");
        console.log("hooked: " + rel);
    } else {
        console.log("MANUAL: " + rel);
    }
}