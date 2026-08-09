// // Convert LLM markdown + LaTeX output into readable plain text for RN <Text>.
// // Not a full parser — just aggressive normalization that removes MD syntax
// // and swaps common LaTeX for their Unicode equivalents.

// const supers: Record<string, string> = {
//   "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
//   "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
//   "+": "⁺", "-": "⁻", "n": "ⁿ",
// };
// const subs: Record<string, string> = {
//   "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
//   "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
// };

// const latex: Array<[RegExp, string]> = [
//   [/\\int\b/g, "∫"], [/\\sum\b/g, "Σ"], [/\\prod\b/g, "∏"],
//   [/\\infty\b/g, "∞"], [/\\pi\b/g, "π"], [/\\theta\b/g, "θ"],
//   [/\\alpha\b/g, "α"], [/\\beta\b/g, "β"], [/\\gamma\b/g, "γ"],
//   [/\\delta\b/g, "δ"], [/\\Delta\b/g, "Δ"], [/\\lambda\b/g, "λ"],
//   [/\\mu\b/g, "μ"], [/\\sigma\b/g, "σ"], [/\\omega\b/g, "ω"],
//   [/\\phi\b/g, "φ"], [/\\rho\b/g, "ρ"], [/\\tau\b/g, "τ"],
//   [/\\cdot\b/g, "·"], [/\\times\b/g, "×"], [/\\div\b/g, "÷"],
//   [/\\pm\b/g, "±"], [/\\mp\b/g, "∓"],
//   [/\\leq\b/g, "≤"], [/\\geq\b/g, "≥"], [/\\neq\b/g, "≠"],
//   [/\\approx\b/g, "≈"], [/\\equiv\b/g, "≡"],
//   [/\\to\b/g, "→"], [/\\rightarrow\b/g, "→"], [/\\Rightarrow\b/g, "⇒"],
//   [/\\leftarrow\b/g, "←"], [/\\Leftarrow\b/g, "⇐"],
//   [/\\ldots\b/g, "…"], [/\\dots\b/g, "…"],
//   [/\\left\b|\\right\b/g, ""],
//   [/\\quad\b|\\qquad\b|\\,|\\;|\\:/g, " "],
//   [/\\text\{([^}]*)\}/g, "$1"],
//   [/\\mathrm\{([^}]*)\}/g, "$1"],
//   [/\\mathbf\{([^}]*)\}/g, "$1"],
//   [/\\sqrt\{([^}]+)\}/g, "√($1)"],
//   [/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)"],
// ];

// function toSuper(s: string) {
//   return s.split("").map((c) => supers[c] ?? c).join("");
// }
// function toSub(s: string) {
//   return s.split("").map((c) => subs[c] ?? c).join("");
// }

// export function humanize(input: string): string {
//   if (!input) return "";
//   let s = input;

//   // Strip code fences ```...```
//   s = s.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, "$1");
//   // Inline code `x`
//   s = s.replace(/`([^`]+)`/g, "$1");

//   // LaTeX delimiters — keep content
//   s = s.replace(/\\\[([\s\S]*?)\\\]/g, "$1");
//   s = s.replace(/\\\(([\s\S]*?)\\\)/g, "$1");
//   s = s.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
//   s = s.replace(/\$([^$\n]+)\$/g, "$1");

//   // LaTeX commands
//   for (const [re, sub] of latex) s = s.replace(re, sub);

//   // Superscripts x^{123} or x^12 or x^2  (only digits and +- signs)
//   s = s.replace(/\^\{([^{}]+)\}/g, (_m, g) => toSuper(g));
//   s = s.replace(/\^([0-9+\-n])/g, (_m, g) => toSuper(g));

//   // Subscripts x_{ij} or x_2
//   s = s.replace(/_\{([0-9]+)\}/g, (_m, g) => toSub(g));
//   s = s.replace(/_([0-9])/g, (_m, g) => toSub(g));

//   // Markdown headings — drop the leading #s
//   s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");

//   // Bold **text** or __text__ → just text
//   s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
//   s = s.replace(/__([^_]+)__/g, "$1");
//   // Italic *text* or _text_ (avoid stray *)
//   s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, "$1$2");
//   s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, "$1$2");

//   // Bullet markers — normalize
//   s = s.replace(/^\s*[-*]\s+/gm, "• ");

//   // Blockquote > text
//   s = s.replace(/^>\s?/gm, "");

//   // Excess blank lines
//   s = s.replace(/\n{3,}/g, "\n\n");

//   return s.trim();
// }











































// Convert LLM markdown + LaTeX output into readable plain text for RN <Text>.
// Not a full parser — aggressive normalization that removes MD syntax and
// swaps common LaTeX for Unicode equivalents.

const supers: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "n": "ⁿ",
};
const subs: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋",
  // Common variable-subscript letters (sequences like a_n, a_i, x_k) —
  // limited to the letters Unicode actually has subscript glyphs for.
  // Letters without a Unicode subscript form are left unchanged by toSub().
  "a": "ₐ", "e": "ₑ", "h": "ₕ", "i": "ᵢ", "j": "ⱼ", "k": "ₖ",
  "l": "ₗ", "m": "ₘ", "n": "ₙ", "o": "ₒ", "p": "ₚ", "r": "ᵣ",
  "s": "ₛ", "t": "ₜ", "u": "ᵤ", "v": "ᵥ", "x": "ₓ",
};

const latex: Array<[RegExp, string]> = [
  [/\\int\b/g, "∫"], [/\\sum\b/g, "Σ"], [/\\prod\b/g, "∏"],
  [/\\infty\b/g, "∞"], [/\\pi\b/g, "π"], [/\\theta\b/g, "θ"],
  [/\\alpha\b/g, "α"], [/\\beta\b/g, "β"], [/\\gamma\b/g, "γ"],
  [/\\delta\b/g, "δ"], [/\\Delta\b/g, "Δ"], [/\\lambda\b/g, "λ"],
  [/\\mu\b/g, "μ"], [/\\sigma\b/g, "σ"], [/\\omega\b/g, "ω"],
  [/\\phi\b/g, "φ"], [/\\rho\b/g, "ρ"], [/\\tau\b/g, "τ"],
  [/\\cdot\b/g, "·"], [/\\times\b/g, "×"], [/\\div\b/g, "÷"],
  [/\\pm\b/g, "±"], [/\\mp\b/g, "∓"],
  [/\\leq\b/g, "≤"], [/\\geq\b/g, "≥"], [/\\neq\b/g, "≠"],
  [/\\approx\b/g, "≈"], [/\\equiv\b/g, "≡"],
  [/\\to\b/g, "→"], [/\\rightarrow\b/g, "→"], [/\\Rightarrow\b/g, "⇒"],
  [/\\leftarrow\b/g, "←"], [/\\Leftarrow\b/g, "⇐"],
  [/\\iff\b/g, "⇔"], [/\\implies\b/g, "⇒"],
  [/\\ldots\b/g, "…"], [/\\dots\b/g, "…"],
  [/\\cdots\b/g, "⋯"], [/\\vdots\b/g, "⋮"], [/\\ddots\b/g, "⋱"],
  // Set theory / logic — common in "range/domain" style answers
  [/\\in\b/g, "∈"], [/\\notin\b/g, "∉"],
  [/\\subseteq\b/g, "⊆"], [/\\subset\b/g, "⊂"],
  [/\\supseteq\b/g, "⊇"], [/\\supset\b/g, "⊃"],
  [/\\cup\b/g, "∪"], [/\\cap\b/g, "∩"], [/\\setminus\b/g, "∖"],
  [/\\forall\b/g, "∀"], [/\\exists\b/g, "∃"],
  [/\\emptyset\b/g, "∅"], [/\\varnothing\b/g, "∅"],
  [/\\land\b|\\wedge\b/g, "∧"], [/\\lor\b|\\vee\b/g, "∨"], [/\\neg\b/g, "¬"],
  [/\\partial\b/g, "∂"], [/\\nabla\b/g, "∇"],
  [/\\mid\b/g, " | "], [/\\colon\b/g, ":"],
  [/\\left\b|\\right\b/g, ""],
  [/\\quad\b|\\qquad\b|\\,|\\;|\\:|\\!|\\ /g, " "],
  [/\\text\{([^}]*)\}/g, "$1"],
  [/\\mathrm\{([^}]*)\}/g, "$1"],
  [/\\mathbf\{([^}]*)\}/g, "$1"],
  [/\\mathbb\{([^}]*)\}/g, "$1"],
];

// \frac and \sqrt need balanced-brace matching, not a single regex —
// \frac{\frac{1}{2}}{3} has nested braces that a naive [^}]+ regex
// truncates at the first inner "}". This walks the string once, finds
// each \frac{ or \sqrt{ token, and extracts its argument(s) by counting
// brace depth so nesting is handled correctly (recursively, since the
// extracted argument itself may contain another \frac/\sqrt).
function extractBraced(s: string, start: number): [string, number] {
  // s[start] must be "{". Returns [content, indexAfterClosingBrace].
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return [s.slice(start + 1, i), i + 1];
    }
  }
  // Unbalanced — return what we have rather than throwing, so malformed
  // AI output degrades gracefully instead of crashing the render.
  return [s.slice(start + 1), s.length];
}

function resolveFracAndSqrt(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("\\frac{", i)) {
      const [num, afterNum] = extractBraced(s, i + 5);
      if (s[afterNum] === "{") {
        const [den, afterDen] = extractBraced(s, afterNum);
        out += `(${resolveFracAndSqrt(num)})/(${resolveFracAndSqrt(den)})`;
        i = afterDen;
        continue;
      }
    }
    if (s.startsWith("\\sqrt{", i)) {
      const [arg, after] = extractBraced(s, i + 5);
      out += `√(${resolveFracAndSqrt(arg)})`;
      i = after;
      continue;
    }
    out += s[i];
    i++;
  }
  return out;
}

function toSuper(s: string) {
  return s.split("").map((c) => supers[c] ?? c).join("");
}
function toSub(s: string) {
  return s.split("").map((c) => subs[c] ?? c).join("");
}

// Formats a \begin{cases}...\end{cases} block as one "value, if condition"
// line per row, since that's the semantically meaningful way to read a
// piecewise definition as plain text.
function formatCases(inner: string): string {
  const rows = inner
    .split(/\\\\/)
    .map((r) => r.trim())
    .filter(Boolean);
  return rows
    .map((row) => {
      const parts = row.split("&").map((p) => p.trim());
      if (parts.length === 2) return `• ${parts[0]}, if ${parts[1]}`;
      return `• ${row}`;
    })
    .join("\n");
}

export function humanize(input: string): string {
  if (!input) return "";
  let s = input;

  // Strip code fences ```...```
  s = s.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, "$1");
  // Inline code `x`
  s = s.replace(/`([^`]+)`/g, "$1");

  // LaTeX delimiters — keep content
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, "$1");
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, "$1");
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  s = s.replace(/\$([^$\n]+)\$/g, "$1");

  // Piecewise definitions — handle before generic environment stripping
  // and before the generic "\\" → newline pass, since it needs the raw
  // "\\" row separators and "&" alignment markers intact.
  s = s.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_m, inner) =>
    formatCases(inner)
  );

  // Other LaTeX environments (align, aligned, array, matrix, ...) — strip
  // the begin/end tags (and any array column spec like {ll}), keep content.
  s = s.replace(/\\begin\{[a-zA-Z*]+\}(\{[^}]*\})?/g, "");
  s = s.replace(/\\end\{[a-zA-Z*]+\}/g, "");
  // Alignment ampersands inside what used to be align/array blocks read
  // fine as plain spacing once the columns are gone.
  s = s.replace(/&/g, " ");

  // LaTeX line breaks ("\\") → newline. Must run before the LaTeX command
  // table below, and after the cases/align handling above already
  // consumed the "\\" separators it cared about.
  s = s.replace(/\\\\\s*/g, "\n");

  // \frac and \sqrt — balanced-brace aware, handles nesting correctly
  s = resolveFracAndSqrt(s);

  // LaTeX commands
  for (const [re, sub] of latex) s = s.replace(re, sub);

  // Escaped literal braces \{ \} (actual displayed braces, e.g. set
  // notation) → plain { }. Must run after the command table above, since
  // \frac{...}{...} etc. use *unescaped* braces as grouping delimiters —
  // those are already consumed by the time we get here.
  s = s.replace(/\\\{/g, "{").replace(/\\\}/g, "}");

  // Superscripts x^{123} or x^12 or x^2 (digits and +- signs)
  s = s.replace(/\^\{([^{}]+)\}/g, (_m, g) => toSuper(g));
  s = s.replace(/\^([0-9+\-n])/g, (_m, g) => toSuper(g));

  // Subscripts x_{ij} or x_2 or x_n (digits and common letters).
  // Require an immediately preceding letter/digit/closing-brace with no
  // space — real LaTeX subscripts are always attached directly to a
  // symbol (x_2, a_n). Markdown italics (_word_) start after whitespace
  // or at the beginning of a line/string, so this lookbehind keeps the
  // two from colliding.
  s = s.replace(/(?<=[0-9a-zA-Z}])_\{([0-9a-zA-Z+\-]+)\}/g, (_m, g) => toSub(g));
  s = s.replace(/(?<=[0-9a-zA-Z}])_([0-9a-zA-Z])/g, (_m, g) => toSub(g));

  // Markdown headings — drop the leading #s
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  // Bold **text** or __text__ → just text
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  // Italic *text* or _text_ (avoid stray *)
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, "$1$2");
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, "$1$2");

  // Bullet markers — normalize
  s = s.replace(/^\s*[-*]\s+/gm, "• ");

  // Blockquote > text
  s = s.replace(/^>\s?/gm, "");

  // Collapse runs of spaces created by removed commands (e.g. "\qquad",
  // stripped "&" alignment markers) without touching intentional newlines.
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/ +\n/g, "\n");
  s = s.replace(/\n +/g, "\n");

  // Excess blank lines
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}