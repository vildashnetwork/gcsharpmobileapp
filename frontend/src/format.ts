// Convert LLM markdown + LaTeX output into readable plain text for RN <Text>.
// Not a full parser — just aggressive normalization that removes MD syntax
// and swaps common LaTeX for their Unicode equivalents.

const supers: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "n": "ⁿ",
};
const subs: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
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
  [/\\ldots\b/g, "…"], [/\\dots\b/g, "…"],
  [/\\left\b|\\right\b/g, ""],
  [/\\quad\b|\\qquad\b|\\,|\\;|\\:/g, " "],
  [/\\text\{([^}]*)\}/g, "$1"],
  [/\\mathrm\{([^}]*)\}/g, "$1"],
  [/\\mathbf\{([^}]*)\}/g, "$1"],
  [/\\sqrt\{([^}]+)\}/g, "√($1)"],
  [/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)"],
];

function toSuper(s: string) {
  return s.split("").map((c) => supers[c] ?? c).join("");
}
function toSub(s: string) {
  return s.split("").map((c) => subs[c] ?? c).join("");
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

  // LaTeX commands
  for (const [re, sub] of latex) s = s.replace(re, sub);

  // Superscripts x^{123} or x^12 or x^2  (only digits and +- signs)
  s = s.replace(/\^\{([^{}]+)\}/g, (_m, g) => toSuper(g));
  s = s.replace(/\^([0-9+\-n])/g, (_m, g) => toSuper(g));

  // Subscripts x_{ij} or x_2
  s = s.replace(/_\{([0-9]+)\}/g, (_m, g) => toSub(g));
  s = s.replace(/_([0-9])/g, (_m, g) => toSub(g));

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

  // Excess blank lines
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}
