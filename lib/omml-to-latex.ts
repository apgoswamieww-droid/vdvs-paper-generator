// ============================================================
//  OMML → LaTeX converter.
//
//  Word stores a native equation (Insert ▸ Equation) as OMML —
//  Office Math Markup Language, an XML vocabulary in the
//  "…/officeDocument/math" namespace. That is what a teacher gets
//  from Word, and from MathType when it is configured to convert to
//  OMML rather than embed an OLE object.
//
//  Why this exists: mammoth drops OMML completely, logging
//  "An unrecognised element was ignored: {…officeDocument/math}
//  oMathPara" and emitting nothing for the equation. A bulk-import
//  template filled with Word equations would silently lose every
//  formula, so the importer reads word/document.xml directly and runs
//  the math elements through here.
//
//  Scope is the subset school papers actually use — fractions, roots,
//  sub/superscripts, n-ary operators, fences, accents, matrices and
//  the ordinary symbol table. Anything outside it degrades to its
//  literal characters rather than throwing, so a partial conversion
//  is still better than losing the question.
//
//  Related: components/editor/mathml.ts converts MathML for the
//  browser clipboard. Different input format, different runtime; the
//  two deliberately do not share code.
// ============================================================

import { childNamed, childrenNamed, type XmlNode } from "./xml-parse";

// ------------------------------------------------------------
//  Symbol tables
// ------------------------------------------------------------

/** Unicode character → LaTeX command. */
const SYMBOLS: Record<string, string> = {
  "\u03c0": "\\pi", "\u03a0": "\\Pi",
  "\u03b1": "\\alpha", "\u03b2": "\\beta", "\u03b3": "\\gamma",
  "\u03b4": "\\delta", "\u0394": "\\Delta", "\u03b5": "\\epsilon",
  "\u03b6": "\\zeta", "\u03b7": "\\eta", "\u03b8": "\\theta",
  "\u0398": "\\Theta", "\u03b9": "\\iota", "\u03ba": "\\kappa",
  "\u03bb": "\\lambda", "\u039b": "\\Lambda", "\u03bc": "\\mu",
  "\u03bd": "\\nu", "\u03be": "\\xi", "\u03bf": "\\omicron",
  "\u03c1": "\\rho", "\u03c3": "\\sigma", "\u03a3": "\\Sigma",
  "\u03c2": "\\varsigma", "\u03c4": "\\tau", "\u03c5": "\\upsilon",
  "\u03a5": "\\Upsilon", "\u03c6": "\\phi", "\u03a6": "\\Phi",
  "\u03c7": "\\chi", "\u03c8": "\\psi", "\u03a8": "\\Psi",
  "\u03c9": "\\omega", "\u03a9": "\\Omega",
  "\u00d7": "\\times", "\u00f7": "\\div", "\u00b1": "\\pm",
  "\u2213": "\\mp", "\u00b7": "\\cdot", "\u22c5": "\\cdot",
  "\u2260": "\\neq", "\u2264": "\\leq", "\u2265": "\\geq",
  "\u221e": "\\infty", "\u222b": "\\int", "\u222c": "\\iint",
  "\u222d": "\\iiint", "\u2211": "\\sum", "\u220f": "\\prod",
  "\u2202": "\\partial", "\u2207": "\\nabla", "\u221a": "\\sqrt",
  "\u2192": "\\rightarrow", "\u2190": "\\leftarrow",
  "\u2194": "\\leftrightarrow", "\u21d2": "\\Rightarrow",
  "\u21d4": "\\Leftrightarrow", "\u21d1": "\\uparrow", "\u21d3": "\\downarrow",
  "\u2208": "\\in", "\u2209": "\\notin", "\u220b": "\\ni",
  "\u2229": "\\cap", "\u222a": "\\cup", "\u2282": "\\subset",
  "\u2283": "\\supset", "\u2286": "\\subseteq", "\u2287": "\\supseteq",
  "\u2261": "\\equiv", "\u2245": "\\cong", "\u2248": "\\approx",
  "\u223c": "\\sim", "\u221d": "\\propto", "\u22a5": "\\perp",
  "\u2225": "\\parallel", "\u2220": "\\angle", "\u25b3": "\\triangle",
  "\u25b2": "\\triangle", "\u2218": "\\circ", "\u00b0": "^{\\circ}",
  "\u2013": "-", "\u2014": "-", "\u2212": "-",
  "\u2032": "'", "\u2033": "''", "\u2200": "\\forall", "\u2203": "\\exists",
  "\u00ac": "\\neg", "\u2026": "\\ldots", "\u22ef": "\\cdots",
  "\u22ee": "\\vdots", "\u22f1": "\\ddots",
  "\u2115": "\\mathbb{N}", "\u2124": "\\mathbb{Z}",
  "\u211d": "\\mathbb{R}", "\u211a": "\\mathbb{Q}", "\u2102": "\\mathbb{C}",
};

/** Multi-letter runs that name a function rather than a product of variables. */
const FUNCTIONS: Record<string, string> = {
  sin: "\\sin", cos: "\\cos", tan: "\\tan", cot: "\\cot",
  sec: "\\sec", csc: "\\csc", sinh: "\\sinh", cosh: "\\cosh",
  tanh: "\\tanh", log: "\\log", ln: "\\ln", lg: "\\lg",
  lim: "\\lim", limsup: "\\limsup", liminf: "\\liminf",
  max: "\\max", min: "\\min", det: "\\det", gcd: "\\gcd",
  arg: "\\arg", exp: "\\exp", deg: "\\deg", mod: "\\bmod",
};

/** Escape the characters LaTeX treats as syntax. */
function escapeLatex(s: string): string {
  return s.replace(/([\\{}%$#&_])/g, "\\$1");
}

/** Maps one character to LaTeX, falling back to the character itself. */
function symbol(ch: string): string {
  return SYMBOLS[ch] ?? ch;
}

/** Maps a run of characters, leaving multi-letter function names alone. */
function textToLatex(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (/^[a-z]+$/.test(trimmed) && FUNCTIONS[trimmed]) return FUNCTIONS[trimmed];
  return Array.from(trimmed).map(symbol).join("");
}

// ------------------------------------------------------------
//  OMML structure
// ------------------------------------------------------------

/**
 * `<m:r>` carries the literal characters, optionally preceded by an
 * `<m:rPr>` run-property block that holds formatting we discard.
 */
function runToLatex(node: XmlNode): string {
  let out = "";
  for (const child of node.children) {
    if (child.name === "t") out += textToLatex(child.text);
    else if (child.name === "br") out += " ";
  }
  return out;
}

/** Renders the `<m:e>` child — the repeated element of a scripted object. */
function elementOf(node: XmlNode): string {
  const e = childNamed(node, "e");
  return e ? childrenToLatex(e) : "";
}

/**
 * `m:d` (delimiter) wraps its contents in a fence. Open/close characters
 * live in `m:dPr`; the common case is a plain bracket pair.
 */
function delimitersOf(node: XmlNode): { open: string; close: string } {
  const pr = childNamed(node, "dPr");
  const beg = pr ? childNamed(pr, "begChr") : null;
  const end = pr ? childNamed(pr, "endChr") : null;
  return {
    open: beg?.attrs.val ?? "(",
    close: end?.attrs.val ?? ")",
  };
}

/**
 * n-ary operators (sum, integral, product…) carry their own sub/superscript
 * inside `m:sub` / `m:sup`, and the operator glyph in `m:naryPr`.
 */
function naryToLatex(node: XmlNode): string {
  const pr = childNamed(node, "naryPr");
  const chr = pr ? childNamed(pr, "chr")?.attrs.val : undefined;
  const op = chr ? symbol(chr) : "\\sum";
  const sub = childNamed(node, "sub");
  const sup = childNamed(node, "sup");
  const e = elementOf(node);

  const chunks: string[] = [op];
  if (sup) chunks.push(`^{${childrenToLatex(sup)}}`);
  if (sub) chunks.push(`_{${childrenToLatex(sub)}}`);
  chunks.push(e);
  return chunks.join("");
}

/** Renders a named child, or "" when the element is absent. */
function namedChild(node: XmlNode, name: string): string {
  const child = childNamed(node, name);
  return child ? childrenToLatex(child) : "";
}

/** Accents (`m:acc`) are a base character plus a combining mark. */
function accentToLatex(node: XmlNode): string {
  const pr = childNamed(node, "accPr");
  const chr = pr?.attrs.chr;
  const base = elementOf(node);
  const byChar: Record<string, string> = {
    "\u0302": "\\hat", "\u0303": "\\tilde", "\u0304": "\\bar",
    "\u0305": "\\overline", "\u0307": "\\dot", "\u0308": "\\ddot",
    "\u030c": "\\check", "\u20d7": "\\vec",
  };
  const cmd = (chr && byChar[chr]) || (chr === "\u0301" ? "\\acute" : "\\hat");
  return `${cmd}{${base}}`;
}

/** Matrices and determinants: `<m:m>` rows `<m:mr>` cells `<m:e>`. */
function matrixToLatex(node: XmlNode, env: string): string {
  const rows = childrenNamed(node, "mr").map((row) =>
    childrenNamed(row, "e").map(childrenToLatex).join(" & ")
  );
  return `\\begin{${env}}${rows.join(" \\\\ ")}\\end{${env}}`;
}

// ------------------------------------------------------------
//  Dispatch
// ------------------------------------------------------------

/** Renders one OMML element's children. */
export function childrenToLatex(node: XmlNode): string {
  let out = "";
  for (const child of node.children) out += elementToLatex(child);
  return out;
}

/** Renders a single OMML element. */
export function elementToLatex(node: XmlNode): string {
  switch (node.name) {
    // The equation root and pass-through containers. <m:num>, <m:den>,
    // <m:deg>, <m:sub>, <m:sup> and <m:lim> are rendered by the cases
    // that read them, so they only ever need their own children.
    case "oMath":
    case "oMathPara":
    case "e":
    case "num":
    case "den":
    case "deg":
    case "sub":
    case "sup":
    case "lim":
    case "fName":
    case "func":
    case "box":
    case "borderBox":
    case "phant":
    case "groupChr":
      return childrenToLatex(node);

    case "r":
      return runToLatex(node);

    // Fractions — <m:fPr> may carry <m:type> for skew/stacked variants.
    // Children are looked up by NAME, never by index: OMML puts property
    // blocks (<m:fPr>, <m:radPr>, …) in the same child list as the content,
    // so positional indexing would read the property block as the operand.
    case "f": {
      const fPr = childNamed(node, "fPr");
      const type = fPr ? childNamed(fPr, "type")?.attrs.val : undefined;
      const num = namedChild(node, "num");
      const den = namedChild(node, "den");
      if (type === "skw") return `${num}/${den}`;
      if (type === "lin") return `${num} \\over ${den}`;
      return `\\frac{${num || "1"}}{${den || "1"}}`;
    }

    // Roots — <m:deg/> with an empty body means the degree is hidden.
    case "rad": {
      const deg = childNamed(node, "deg");
      const radicand = namedChild(node, "e");
      const degPr = childNamed(node, "radPr");
      const hidden = degPr ? childNamed(degPr, "degHide")?.attrs.val === "1" : false;
      const degree = deg ? childrenToLatex(deg).trim() : "";
      if (hidden || !degree) return `\\sqrt{${radicand}}`;
      return `\\sqrt[${degree}]{${radicand}}`;
    }

    // Scripts
    case "sSup":
      return `${elementOf(node)}^{${namedChild(node, "sup")}}`;
    case "sSub":
      return `${elementOf(node)}_{${namedChild(node, "sub")}}`;
    case "sSubSup":
      return `${elementOf(node)}_{${namedChild(node, "sub")}}^{${namedChild(node, "sup")}}`;
    case "sPre":
      return `{}_{${namedChild(node, "sub")}}^{${namedChild(node, "sup")}}${elementOf(node)}`;

    // Limits — <m:limLow>/<m:limUpp> carry their limit in <m:lim>,
    // not in <m:sub>/<m:sup>.
    case "limLow":
      return `${elementOf(node)}_{${namedChild(node, "lim")}}`;
    case "limUpp":
      return `${elementOf(node)}^{${namedChild(node, "lim")}}`;

    case "nary":
      return naryToLatex(node);

    case "acc":
      return accentToLatex(node);

    // Fences
    case "d": {
      const { open, close } = delimitersOf(node);
      const pr = childNamed(node, "dPr");
      const sep = pr?.children.find((c) => c.name === "sepChr")?.attrs.val ?? "";
      const parts = childrenNamed(node, "e").map(childrenToLatex);
      const body = sep ? parts.join(symbol(sep)) : parts.join(" ");
      return `${open} ${body} ${close}`;
    }

    // Matrices / determinants
    case "m":
      return matrixToLatex(node, "matrix");
    case "eqArr":
      return matrixToLatex(node, "cases");

    case "func": {
      const name = childNamed(node, "fName");
      return `${name ? childrenToLatex(name) : "\\operatorname{f}"}`;
    }

    // A few string-ish wrappers: keep their text, mark it as text.
    case "ctrlPr":
      return "";

    default: {
      // Unknown structure — fall back to any text it still holds rather
      // than dropping it, so the question survives with partial maths.
      const literal = node.text.trim();
      if (literal) return escapeLatex(literal);
      return childrenToLatex(node);
    }
  }
}

// ------------------------------------------------------------
//  Public API
// ------------------------------------------------------------

/**
 * Converts one parsed `<m:oMath>` element to a LaTeX string.
 * Returns "" when the node yields nothing usable.
 */
export function ommlToLatex(node: XmlNode): string {
  const tex = elementToLatex(node).trim();
  return tex.replace(/\s+/g, " ").trim();
}

/**
 * Wraps LaTeX in the `$…$` delimiters the app stores inline in
 * `questionText`. Returns "" for empty input so callers can test with
 * a falsy check rather than comparing strings.
 */
export function toInlineMath(tex: string): string {
  const trimmed = tex.trim();
  return trimmed ? `$${trimmed}$` : "";
}