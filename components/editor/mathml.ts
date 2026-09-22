// ============================================================
//  MathML → LaTeX converter.
//
//  Used when a user copies an equation from MathType / Word /
//  Wikipedia and pastes it into the equation editor. MathType
//  puts MathML on the clipboard; we convert it to $...$ LaTeX
//  so it becomes an editable math chip just like the Σ palette.
//
//  Covers the common MathML subset (fractions, roots, powers,
//  sub/superscripts, matrices, fences, greek, symbols, text).
// ============================================================

// Named math entities that XML parsers don't decode by default.
const NAMED_ENTITIES: Record<string, string> = {
  "&pi;": "\u03c0", "&Pi;": "\u03a0", "&alpha;": "\u03b1", "&beta;": "\u03b2",
  "&gamma;": "\u03b3", "&delta;": "\u03b4", "&Delta;": "\u0394",
  "&theta;": "\u03b8", "&Theta;": "\u0398", "&lambda;": "\u03bb",
  "&Lambda;": "\u039b", "&mu;": "\u03bc", "&sigma;": "\u03c3",
  "&Sigma;": "\u03a3", "&tau;": "\u03c4", "&phi;": "\u03c6",
  "&Phi;": "\u03a6", "&omega;": "\u03c9", "&Omega;": "\u03a9",
  "&epsilon;": "\u03b5", "&zeta;": "\u03b6", "&eta;": "\u03b7",
  "&kappa;": "\u03ba", "&xi;": "\u03be", "&rho;": "\u03c1", "&psi;": "\u03c8",
  "&times;": "\u00d7", "&divide;": "\u00f7", "&plusmn;": "\u00b1",
  "&mp;": "\u2213", "&middot;": "\u00b7", "&sdot;": "\u22c5",
  "&minus;": "\u2212", "&ndash;": "\u2013", "&mdash;": "\u2014",
  "&ne;": "\u2260", "&le;": "\u2264", "&ge;": "\u2265",
  "&infin;": "\u221e", "&int;": "\u222b", "&iint;": "\u222c",
  "&iiint;": "\u222d", "&sum;": "\u2211", "&prod;": "\u220f",
  "&part;": "\u2202", "&nabla;": "\u2207", "&radic;": "\u221a",
  "&rarr;": "\u2192", "&larr;": "\u2190", "&harr;": "\u2194",
  "&rArr;": "\u21d2", "&hArr;": "\u21d4", "&uarr;": "\u2191",
  "&darr;": "\u2193", "&isin;": "\u2208", "&notin;": "\u2209",
  "&ni;": "\u220b", "&cap;": "\u2229", "&cup;": "\u222a",
  "&sub;": "\u2282", "&sup;": "\u2283", "&sube;": "\u2286",
  "&supe;": "\u2287", "&nsub;": "\u2284", "&equiv;": "\u2261",
  "&cong;": "\u2245", "&asymp;": "\u2248", "&sim;": "\u223c",
  "&prop;": "\u221d", "&perp;": "\u22a5", "&parallel;": "\u2225",
  "&ang;": "\u2220", "&nbsp;": " ", "&prime;": "\u2032",
  "&Prime;": "\u2033", "&deg;": "\u00b0", "&circ;": "\u02c6",
  "&forall;": "\u2200", "&exist;": "\u2203", "&neg;": "\u00ac",
  "&ldquo;": "\u201c", "&rdquo;": "\u201d",
  "&lsquo;": "\u2018", "&rsquo;": "\u2019", "&hellip;": "\u2026",
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'",
};

const NAMED_RE = new RegExp(
  "&(?:" + Object.keys(NAMED_ENTITIES).map((k) => k.slice(1, -1)).join("|") + ");",
  "g"
);

// Unicode symbol → LaTeX command
const SYMBOL: Record<string, string> = {
  "\u03c0": "\\pi", "\u03a0": "\\Pi",
  "\u03b1": "\\alpha", "\u03b2": "\\beta", "\u03b3": "\\gamma",
  "\u03b4": "\\delta", "\u0394": "\\Delta", "\u03b8": "\\theta",
  "\u0398": "\\Theta", "\u03bb": "\\lambda", "\u039b": "\\Lambda",
  "\u03bc": "\\mu", "\u03c3": "\\sigma", "\u03a3": "\\Sigma",
  "\u03c4": "\\tau", "\u03c6": "\\phi", "\u03a6": "\\Phi",
  "\u03c9": "\\omega", "\u03a9": "\\Omega", "\u03b5": "\\epsilon",
  "\u03f5": "\\epsilon", "\u03b6": "\\zeta", "\u03b7": "\\eta",
  "\u03ba": "\\kappa", "\u03be": "\\xi", "\u03c1": "\\rho",
  "\u03c8": "\\psi", "\u03a8": "\\Psi", "\u03c5": "\\upsilon",
  "\u03a5": "\\Upsilon", "\u03b9": "\\iota",
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
  "\u2284": "\\not\\subset", "\u2285": "\\not\\supset",
  "\u2261": "\\equiv", "\u2245": "\\cong", "\u2248": "\\approx",
  "\u223c": "\\sim", "\u221d": "\\propto", "\u22a5": "\\perp",
  "\u2225": "\\parallel", "\u2220": "\\angle", "\u25b3": "\\triangle",
  "\u25b2": "\\triangle", "\u00b0": "^{\\circ}", "\u2218": "\\circ",
  "\u2212": "-", "\u2013": "-", "\u2014": "-", "\u2032": "'",
  "\u2033": "''", "\u2200": "\\forall", "\u2203": "\\exists",
  "\u00ac": "\\neg", "\u2026": "\\ldots", "\u22ef": "\\cdots",
  "\u22ee": "\\vdots", "\u22f1": "\\ddots",
  "\u2115": "\\mathbb{N}", "\u2124": "\\mathbb{Z}",
  "\u211d": "\\mathbb{R}", "\u211a": "\\mathbb{Q}",
  "\u2102": "\\mathbb{C}", "\u2119": "\\mathbb{P}",
};

// Common function words (as <mi>sin</mi> etc.)
const FUNCTIONS: Record<string, string> = {
  sin: "\\sin", cos: "\\cos", tan: "\\tan", cot: "\\cot", sec: "\\sec",
  csc: "\\csc", sinh: "\\sinh", cosh: "\\cosh", tanh: "\\tanh",
  log: "\\log", ln: "\\ln", lg: "\\lg", lim: "\\lim", limsup: "\\limsup",
  liminf: "\\liminf", max: "\\max", min: "\\min", det: "\\det",
  gcd: "\\gcd", arg: "\\arg", mod: "\\bmod", exp: "\\exp", deg: "\\deg",
};

function decodeNamedEntities(source: string): string {
  return source.replace(NAMED_RE, (name) => NAMED_ENTITIES[name] ?? name);
}

function symbolToLatex(ch: string): string {
  return SYMBOL[ch] ?? ch;
}

function wordToLatex(word: string): string {
  return FUNCTIONS[word] ?? word;
}

function convertText(text: string): string {
  let out = "";
  // decode leftover numeric refs (&amp;#x03C0;) just in case
  const decoded = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16))
  ).replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  // walk characters, mapping symbols
  let i = 0;
  while (i < decoded.length) {
    const ch = decoded[i];
    // two-char sequences first (e.g. \u2264 none) — single-char map is enough
    if (ch === "\\") {
      out += "\\backslash ";
      i += 1;
      continue;
    }
    out += symbolToLatex(ch);
    i += 1;
  }
  return out;
}

function isMathElement(el: Node): boolean {
  return el instanceof Element;
}

function local(el: Element): string {
  return (el.localName || el.tagName).toLowerCase();
}

function childElements(el: Element): Element[] {
  return Array.from(el.children);
}

// Convert an element's child nodes (elements + text).
function childrenToTex(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (isMathElement(node)) {
      out += elementToTex(node as Element);
    } else if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").trim();
      if (t) out += convertText(t);
    }
  }
  return out;
}

function firstTex(el: Element, index: number): string {
  const kids = childElements(el);
  const target = kids[index];
  return target ? elementToTex(target) : "";
}

export function elementToTex(el: Element): string {
  const tag = local(el);

  switch (tag) {
    case "math":
    case "mrow":
    case "mstyle":
    case "mpadded":
    case "menclose":
      return childrenToTex(el);

    case "semantics": {
      const content = childElements(el).find((c) => {
        const n = local(c);
        return n !== "annotation" && n !== "annotation-xml";
      });
      return content ? elementToTex(content) : childrenToTex(el);
    }

    case "mfrac": {
      const num = firstTex(el, 0);
      const den = firstTex(el, 1);
      return `\\frac{${num || "1"}}{${den || "1"}}`;
    }

    case "msqrt":
      return `\\sqrt{${childrenToTex(el)}}`;

    case "mroot": {
      const base = firstTex(el, 0);
      const index = firstTex(el, 1);
      return `\\sqrt[${index || "n"}]{${base}}`;
    }

    case "msup": {
      const base = firstTex(el, 0);
      const exp = firstTex(el, 1);
      return `{${base}}^{${exp}}`;
    }

    case "msub": {
      const base = firstTex(el, 0);
      const sub = firstTex(el, 1);
      return `{${base}}_{${sub}}`;
    }

    case "msubsup": {
      const base = firstTex(el, 0);
      const sub = firstTex(el, 1);
      const sup = firstTex(el, 2);
      return `{${base}}_{${sub}}^{${sup}}`;
    }

    case "munder": {
      const base = firstTex(el, 0);
      const under = firstTex(el, 1);
      return `\\underset{${under}}{${base}}`;
    }

    case "mover": {
      const base = firstTex(el, 0);
      const kids = childElements(el);
      if (!kids[1]) return base;
      const over = elementToTex(kids[1]);
      if (over === "\\rightarrow") return `\\overrightarrow{${base}}`;
      if (over === "\\leftrightarrow") return `\\overleftrightarrow{${base}}`;
      if (over === "\\leftarrow") return `\\overleftarrow{${base}}`;
      if (over === "=" || over === "\u203e") return `\\overline{${base}}`;
      return `\\overset{${over}}{${base}}`;
    }

    case "mtable": {
      const rows = childElements(el).map((tr) => {
        const cells = childElements(tr).map((td) => childrenToTex(td));
        return cells.join(" & ");
      });
      return `\\begin{matrix}${rows.join(" \\\\ ")} \\end{matrix}`;
    }

    case "mtr":
      return childElements(el)
        .map((td) => childrenToTex(td))
        .join(" & ");

    case "mtd":
      return childrenToTex(el);

    case "mfenced": {
      const open = el.getAttribute("open") ?? "(";
      const close = el.getAttribute("close") ?? ")";
      const sep = el.getAttribute("separators") ?? ",";
      const parts = childElements(el).map(elementToTex);
      let joined = "";
      if (parts.length > 1) {
        joined = parts[0];
        for (let i = 1; i < parts.length; i++) {
          joined += (sep[i - 1] ?? sep[0] ?? "") + parts[i];
        }
      } else if (parts.length === 1) {
        joined = parts[0];
      }
      const o = convertText(open.trim());
      const c = convertText(close.trim());
      return `${o} ${joined} ${c}`;
    }

    case "mtext":
      return `\\text{${(el.textContent ?? "").replace(/([{}_%$#])/g, "\\$1")}}`;

    case "mi":
    case "mn":
    case "mo": {
      const raw = (el.textContent ?? "").trim();
      if (!raw) return "";
      if (tag === "mi" && /^[a-zA-Z]+$/.test(raw)) {
        // sin, cos, log… or single-letter variable
        return wordToLatex(raw);
      }
      return convertText(raw);
    }

    case "mspace":
      return "\\,";

    default:
      return childrenToTex(el);
  }
}

/**
 * Convert a MathML string to LaTeX. Returns "" if it can't be parsed.
 */
export function mathmlToLatex(mml: string): string {
  if (!mml || !mml.includes("<")) return "";
  const source = decodeNamedEntities(mml);
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(source, "application/xml");
  } catch {
    return "";
  }
  if (!doc || doc.querySelector("parsererror")) {
    // fall back to lenient HTML parsing
    try {
      doc = new DOMParser().parseFromString(source, "text/html");
    } catch {
      return "";
    }
  }
  const math =
    (doc.querySelector("math") as Element | null) ?? findMath(doc.documentElement);
  if (!math) return "";
  const tex = elementToTex(math).trim();
  return tex ? tex.replace(/\s+/g, " ").trim() : "";
}

function findMath(node: Element | null): Element | null {
  if (!node) return null;
  if (local(node) === "math") return node;
  for (const child of Array.from(node.children)) {
    const found = findMath(child);
    if (found) return found;
  }
  return null;
}

/**
 * Pull the MathML <math> fragment out of the clipboard (works on
 * rich-text HTML as well as plain MathML text). Returns "" if none.
 */
export function getMathMLFromClip(clip: DataTransfer): string {
  const html = clip.getData("text/html");
  if (html && /<math[\s>]/i.test(html)) {
    const rich = new DOMParser().parseFromString(html, "text/html");
    const el = (rich.querySelector("math") as Element | null) ?? findMath(rich.documentElement);
    if (el) return el.outerHTML;
  }
  const plain = clip.getData("text/plain");
  if (plain && /^\s*<math[\s>]/i.test(plain)) return plain;
  return "";
}