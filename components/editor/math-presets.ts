// ============================================================
//  Math palette preset data (MathType-like).
//  Each preset carries LaTeX that gets inserted inside $...$.
// ============================================================

export type MathPreset = { label: string; tex: string };

export type MathCategory = {
  id: string;
  name: string;
  presets: MathPreset[];
};

export const MATH_CATEGORIES: MathCategory[] = [
  {
    id: "fractions",
    name: "Fractions",
    presets: [
      { label: "a/b", tex: "\\frac{a}{b}" },
      { label: "x ÷ y", tex: "\\frac{x}{y}" },
      { label: "Mixed", tex: "2 + \\frac{1}{2}" },
      { label: "Expression", tex: "\\frac{a+b}{c-d}" },
      { label: "Of number", tex: "\\frac{3}{4}" },
      { label: "Ratio", tex: "\\frac{a}{b} = \\frac{c}{d}" },
    ],
  },
  {
    id: "roots",
    name: "Roots",
    presets: [
      { label: "Sqrt", tex: "\\sqrt{x}" },
      { label: "n-th root", tex: "\\sqrt[n]{x}" },
      { label: "Sqrt frac", tex: "\\sqrt{\\frac{a}{b}}" },
      { label: "Cube root", tex: "\\sqrt[3]{x}" },
      { label: "Square of 2", tex: "\\sqrt{2}" },
    ],
  },
  {
    id: "powers",
    name: "Powers",
    presets: [
      { label: "x²", tex: "x^{2}" },
      { label: "x³", tex: "x^{3}" },
      { label: "xⁿ", tex: "x^{n}" },
      { label: "e^x", tex: "e^{x}" },
      { label: "10ⁿ", tex: "10^{n}" },
      { label: "x⁻¹", tex: "x^{-1}" },
    ],
  },
  {
    id: "subscripts",
    name: "Subscript",
    presets: [
      { label: "aᵢ", tex: "a_{i}" },
      { label: "xᵢ²", tex: "x_{i}^{2}" },
      { label: "log base", tex: "\\log_{a} x" },
      { label: "a₁,a₂", tex: "a_{1}, a_{2}" },
    ],
  },
  {
    id: "matrices",
    name: "Matrices",
    presets: [
      { label: "2×2", tex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
      { label: "2×2 det", tex: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}" },
      { label: "3×1 column", tex: "\\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix}" },
      { label: "1×3 row", tex: "\\begin{pmatrix} a & b & c \\end{pmatrix}" },
      { label: "2×3", tex: "\\begin{pmatrix} 1 & 2 & 3 \\\\ 4 & 5 & 6 \\end{pmatrix}" },
    ],
  },
  {
    id: "calculus",
    name: "Calculus",
    presets: [
      { label: "Integral", tex: "\\int_{a}^{b} f(x) \\, dx" },
      { label: "Double", tex: "\\iint_{R} f(x,y) \\, dA" },
      { label: "Triple", tex: "\\iiint_{V} f \\, dV" },
      { label: "Limit", tex: "\\lim_{x \\to 0} f(x)" },
      { label: "Derivative", tex: "\\frac{d}{dx} f(x)" },
      { label: "Partial", tex: "\\frac{\\partial f}{\\partial x}" },
    ],
  },
  {
    id: "sequences",
    name: "Sum / Prod",
    presets: [
      { label: "Sum", tex: "\\sum_{i=1}^{n} a_{i}" },
      { label: "Product", tex: "\\prod_{i=1}^{n} a_{i}" },
      { label: "Union", tex: "\\cup_{i=1}^{n} A_{i}" },
      { label: "Intersection", tex: "\\cap_{i=1}^{n} A_{i}" },
    ],
  },
  {
    id: "greek",
    name: "Greek",
    presets: [
      { label: "alpha", tex: "\\alpha" },
      { label: "beta", tex: "\\beta" },
      { label: "gamma", tex: "\\gamma" },
      { label: "delta", tex: "\\delta" },
      { label: "theta", tex: "\\theta" },
      { label: "lambda", tex: "\\lambda" },
      { label: "mu", tex: "\\mu" },
      { label: "pi", tex: "\\pi" },
      { label: "sigma", tex: "\\sigma" },
      { label: "phi", tex: "\\phi" },
      { label: "omega", tex: "\\omega" },
      { label: "epsilon", tex: "\\epsilon" },
    ],
  },
  {
    id: "symbols",
    name: "Symbols",
    presets: [
      { label: "Degree", tex: "30^{\\circ}" },
      { label: "Times", tex: "\\times" },
      { label: "Divide", tex: "\\div" },
      { label: "Plus-minus", tex: "\\pm" },
      { label: "Approx", tex: "\\approx" },
      { label: "Not equal", tex: "\\neq" },
      { label: "Less/eq", tex: "\\leq" },
      { label: "Great/eq", tex: "\\geq" },
      { label: "Infinity", tex: "\\infty" },
      { label: "Arrow", tex: "\\rightarrow" },
      { label: "Dots", tex: "\\ldots" },
      { label: "Percent", tex: "\\%" },
    ],
  },
  {
    id: "geometry",
    name: "Geometry",
    presets: [
      { label: "Angle", tex: "\\angle ABC" },
      { label: "Segment", tex: "\\overline{AB}" },
      { label: "Ray", tex: "\\overrightarrow{AB}" },
      { label: "Triangle", tex: "\\triangle ABC" },
      { label: "Perp", tex: "\\perp" },
      { label: "Parallel", tex: "\\parallel" },
    ],
  },
];