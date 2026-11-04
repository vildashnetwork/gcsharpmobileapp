/**
 * Codemod: converts every screen/component to the reactive theme system.
 *
 * For each file that imports `theme`:
 *   1. `const styles = StyleSheet.create({...})` becomes
 *      `const createStyles = (t: Palette) => StyleSheet.create({...})`
 *      with `theme.` → `t.` inside, and hardcoded "#fff" backgrounds
 *      mapped to palette tokens.
 *   2. A module-level rebuild subscription is appended so the `styles`
 *      binding is recreated whenever the palette changes — helpers outside
 *      the screen function pick up light/dark with no prop drilling.
 *   3. `useTheme()` is inserted into the default-exported screen so it
 *      re-renders on theme changes (inline `theme.X` reads are reactive).
 *   4. Required imports are added.
 *
 * Commented-out legacy code (lines starting with //) is left untouched.
 * Run: node scripts/apply-dark-theme.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SKIP = new Set([
    path.join(ROOT, "src", "theme.ts"),
    path.join(ROOT, "src", "theme-context.tsx"),
]);

function walk(dir, acc) {
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return acc;
    }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (["node_modules", "generated", ".expo", "android", "ios", "assets"].includes(e.name)) continue;
            walk(p, acc);
        } else if (/\.(tsx|ts)$/.test(e.name)) {
            acc.push(p);
        }
    }
    return acc;
}

const files = [
    ...walk(path.join(ROOT, "app"), []),
    ...walk(path.join(ROOT, "src"), []),
].filter((f) => !SKIP.has(f));

const EXTRA_THEME_IMPORT =
    'import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";';
const USE_THEME_IMPORT = 'import { useTheme } from "@/src/theme-context";';

const isComment = (t) =>
    t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");

const changed = [];
for (const file of files) {
    const orig = fs.readFileSync(file, "utf8");
    const lines = orig.split("\n");

    // Locate the active theme import and the (single) active styles block.
    let hasThemeImport = false;
    let stylesStart = -1;
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (isComment(t)) continue;
        if (/import\s*\{[^}]*\btheme\b[^}]*\}\s*from\s*["'][^"']*theme["']/.test(lines[i])) {
            hasThemeImport = true;
        }
        if (stylesStart === -1 && /^const styles = StyleSheet\.create\(\{\s*$/.test(lines[i])) {
            stylesStart = i;
        }
    }

    if (!hasThemeImport && stylesStart === -1) continue; // nothing theme-related

    // Find the end of the styles block by brace depth.
    let stylesEnd = -1;
    if (stylesStart !== -1) {
        let depth = 0;
        for (let i = stylesStart; i < lines.length; i++) {
            const t = lines[i].trim();
            if (t.startsWith("//")) continue;
            for (const ch of t) {
                if (ch === "{") depth++;
                else if (ch === "}") depth--;
            }
            if (depth === 0 && i > stylesStart && /\}\)\s*;\s*$/.test(t)) {
                stylesEnd = i;
                break;
            }
        }
    }

    const out = [];
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();
        const isActive = !isComment(trimmed);

        if (isActive && i === stylesStart) {
            out.push("const createStyles = (t: Palette) => StyleSheet.create({");
            continue;
        }

        if (isActive && stylesEnd !== -1 && i === stylesEnd) {
            out.push(line);
            out.push("");
            out.push("// Rebuild the module styles whenever the active palette changes so");
            out.push("// every consumer (including helper components outside the screen");
            out.push("// function) picks up light/dark without prop drilling.");
            out.push("let styles = createStyles(getPaletteSnapshot());");
            out.push("subscribeTheme(() => {");
            out.push("  styles = createStyles(getPaletteSnapshot());");
            out.push("});");
            continue;
        }

        if (isActive && stylesStart !== -1 && stylesEnd !== -1 && i > stylesStart && i < stylesEnd) {
            // Inside the styles factory.
            line = line.replace(/\btheme\./g, "t.");
            line = line.replace(
                /(backgroundColor|borderColor)\s*:\s*["']#fff(?:fff)?["']/gi,
                "$1: t.surfaceSecondary"
            );
            line = line.replace(/color\s*:\s*["']#fff(?:fff)?["']/gi, "color: t.onBrandPrimary");
            line = line.replace(/:\s*["']#fff(?:fff)?["']/gi, ": t.surfaceSecondary");
            out.push(line);
            continue;
        }

        if (isActive) {
            // Inline styles outside the factory — keep theme. (reactive proxy)
            line = line.replace(
                /(backgroundColor|borderColor)\s*:\s*["']#fff(?:fff)?["']/gi,
                "$1: theme.surfaceSecondary"
            );
        }

        out.push(line);

        // Append the extra theme imports right after the existing one.
        if (
            isActive &&
            /import\s*\{[^}]*\btheme\b[^}]*\}\s*from\s*["'][^"']*theme["']/.test(line) &&
            !orig.includes("getPaletteSnapshot")
        ) {
            out.push(EXTRA_THEME_IMPORT);
        }
    }

    let src = out.join("\n");

    // Insert useTheme() into the default-exported screen component.
    const m = src.match(/^export default function \w+\s*\([^)]*\)\s*\{\s*$/m);
    if (m && m.index !== undefined) {
        const at = m.index + m[0].length;
        src =
            src.slice(0, at) +
            "\n  useTheme(); // re-render this screen when light/dark changes" +
            src.slice(at);
        if (!/from ["']@\/src\/theme-context["']/.test(src)) {
            src = src.replace(
                /(import\s*\{[^}]*\btheme\b[^}]*\}\s*from\s*["'][^"']*theme["'];\r?\n)/,
                "$1" + USE_THEME_IMPORT + "\n"
            );
        }
    }

    if (src !== orig) {
        fs.writeFileSync(file, src, "utf8");
        changed.push(path.relative(ROOT, file));
    }
}

console.log(`Updated ${changed.length} file(s):`);
changed.forEach((f) => console.log("  " + f));