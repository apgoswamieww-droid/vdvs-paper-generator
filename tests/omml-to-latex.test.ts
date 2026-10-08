import { describe, expect, it } from "vitest";
import { parseXml, childNamed, childrenNamed, textOf } from "@/lib/xml-parse";
import { ommlToLatex } from "@/lib/omml-to-latex";

// ============================================================
//  lib/xml-parse.ts + lib/omml-to-latex.ts
//
//  The fixtures below are hand-shaped to match what Word actually
//  writes for a native equation (Insert > Equation), because that is
//  the only thing this module has to survive.
// ============================================================

const doc = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
   <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:m="http://schemas.openxmlformats.org/officeDocument/math">
     <w:body>${body}</w:body>
   </w:document>`;

function oMath(inner: string): string {
  return `<m:oMath>${inner}</m:oMath>`;
}

const parseOmath = (inner: string) => {
  const root = parseXml(doc(oMath(inner)));
  const math = childNamed(root!, "body")!.children[0];
  return ommlToLatex(math);
};

describe("parseXml", () => {
  it("strips namespace prefixes so w:t and m:t are distinguishable", () => {
    const root = parseXml(doc(`<w:p><w:r><w:t>hello</w:t></w:r></w:p>`))!;
    const p = childNamed(root, "body")!.children[0];
    expect(p.name).toBe("p");
    expect(childrenNamed(p, "r")[0].name).toBe("r");
  });

  it("reads text, attributes and self-closing tags", () => {
    const root = parseXml(
      doc(`<w:tbl><w:tr><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr></w:tc></w:tr></w:tbl>`)
    )!;
    const tbl = childNamed(root, "body")!.children[0];
    const tc = childrenNamed(childrenNamed(tbl, "tr")[0], "tc")[0];
    expect(childNamed(tc, "tcPr")!.children[0].attrs.w).toBe("2000");
    expect(childNamed(tc, "tcPr")!.children[0].attrs.type).toBe("dxa");
  });

  it("decodes entities and numeric character references", () => {
    const root = parseXml(doc(`<w:p><w:r><w:t>a &amp; b &lt; c &#65; &#x2264;</w:t></w:r></w:p>`))!;
    const p = childNamed(root, "body")!.children[0];
    expect(textOf(p)).toBe("a & b < c A ≤");
  });

  it("preserves whitespace inside w:t (Word relies on xml:space)", () => {
    const root = parseXml(
      doc(`<w:p><w:r><w:t xml:space="preserve">  spaced  </w:t></w:r></w:p>`)
    )!;
    expect(textOf(root)).toContain("  spaced  ");
  });

  it("skips comments, declarations and CDATA", () => {
    const root = parseXml(
      `<?xml version="1.0"?><!-- a note --><root><![CDATA[<raw>]]></root>`
    )!;
    expect(root.name).toBe("root");
  });

  it("handles attribute values containing '>'", () => {
    const root = parseXml(`<a b="x > y"/>`)!;
    expect(root.attrs.b).toBe("x > y");
  });

  it("keeps sibling tables in document order", () => {
    const root = parseXml(
      doc(
        `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Q1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
          `<w:p><w:r><w:t>between</w:t></w:r></w:p>` +
          `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Q2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`
      )
    )!;
    const kids = childNamed(root, "body")!.children.map((c) => c.name);
    expect(kids).toEqual(["tbl", "p", "tbl"]);
  });

  it("returns null for empty input", () => {
    expect(parseXml("")).toBeNull();
    expect(parseXml("<?xml version=\"1.0\"?>")).toBeNull();
  });
});

describe("ommlToLatex", () => {
  it("converts a simple run", () => {
    expect(parseOmath(`<m:r><m:t>2x+5=15</m:t></m:r>`)).toBe("2x+5=15");
  });

  it("converts a fraction", () => {
    expect(
      parseOmath(
        `<m:f><m:fPr><m:ctrlPr/></m:fPr><m:num><m:r><m:t>d</m:t></m:r></m:num><m:den><m:r><m:t>dx</m:t></m:r></m:den></m:f>`
      )
    ).toBe("\\frac{d}{dx}");
  });

  it("converts a radical with and without a degree", () => {
    expect(
      parseOmath(
        `<m:rad><m:radPr><m:degHide m:val="1"/><m:ctrlPr/></m:radPr><m:deg/><m:e><m:r><m:t>144</m:t></m:r></m:e></m:rad>`
      )
    ).toBe("\\sqrt{144}");
    expect(
      parseOmath(
        `<m:rad><m:deg><m:r><m:t>3</m:t></m:r></m:deg><m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad>`
      )
    ).toBe("\\sqrt[3]{x}");
  });

  it("converts sub- and superscripts", () => {
    expect(
      parseOmath(
        `<m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>`
      )
    ).toBe("x^{2}");
    expect(
      parseOmath(
        `<m:sSub><m:e><m:r><m:t>a</m:t></m:r></m:e><m:sub><m:r><m:t>i</m:t></m:r></m:sub></m:sSub>`
      )
    ).toBe("a_{i}");
    expect(
      parseOmath(
        `<m:sSubSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sub><m:r><m:t>1</m:t></m:r></m:sub><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSubSup>`
      )
    ).toBe("x_{1}^{2}");
  });

  it("converts the full differentiate example Word produces", () => {
    // d/dx(x^2) = ?  — the case from the parser investigation.
    const tex = parseOmath(
      `<m:f><m:num><m:r><m:t>d</m:t></m:r></m:num><m:den><m:r><m:t>dx</m:t></m:r></m:den></m:f>` +
        `<m:r><m:t>(</m:t></m:r>` +
        `<m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>` +
        `<m:r><m:t>) = ?</m:t></m:r>`
    );
    expect(tex).toBe("\\frac{d}{dx}(x^{2}) = ?");
  });

  it("converts an n-ary operator with limits", () => {
    expect(
      parseOmath(
        `<m:nary><m:naryPr><m:chr m:val="\u2211"/><m:limLoc m:val="undOvr"/></m:naryPr>` +
          `<m:sub><m:r><m:t>i=1</m:t></m:r></m:sub><m:sup><m:r><m:t>n</m:t></m:r></m:sup>` +
          `<m:e><m:r><m:t>i</m:t></m:r></m:e></m:nary>`
      )
    ).toBe("\\sum^{n}_{i=1}i");
  });

  it("converts delimiters and honours custom fence characters", () => {
    expect(
      parseOmath(`<m:d><m:dPr/><m:e><m:r><m:t>x+y</m:t></m:r></m:e></m:d>`)
    ).toBe("( x+y )");
    expect(
      parseOmath(
        `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e><m:r><m:t>x</m:t></m:r></m:e></m:d>`
      )
    ).toBe("[ x ]");
  });

  it("converts greek letters and operators to LaTeX commands", () => {
    expect(parseOmath(`<m:r><m:t>\u03c0</m:t></m:r>`)).toBe("\\pi");
    expect(parseOmath(`<m:r><m:t>\u2264</m:t></m:r>`)).toBe("\\leq");
    expect(parseOmath(`<m:r><m:t>\u221a</m:t></m:r>`)).toBe("\\sqrt");
  });

  it("keeps function names as LaTeX commands", () => {
    expect(parseOmath(`<m:r><m:t>sin</m:t></m:r>`)).toBe("\\sin");
  });

  it("converts a matrix", () => {
    expect(
      parseOmath(
        `<m:m><m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>2</m:t></m:r></m:e></m:mr>` +
          `<m:mr><m:e><m:r><m:t>3</m:t></m:r></m:e><m:e><m:r><m:t>4</m:t></m:r></m:e></m:mr></m:m>`
      )
    ).toBe("\\begin{matrix}1 & 2 \\\\ 3 & 4\\end{matrix}");
  });

  it("returns an empty string for an empty equation", () => {
    expect(parseOmath("")).toBe("");
  });

  it("keeps unknown structures' text instead of dropping it", () => {
    // A maths construct outside the supported subset must not silently
    // delete the question's content.
    const tex = parseOmath(`<m:unknownThing><m:r><m:t>42</m:t></m:r></m:unknownThing>`);
    expect(tex).toContain("42");
  });
});