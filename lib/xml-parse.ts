// ============================================================
//  Minimal XML reader — no third-party dependency, Node-safe.
//
//  The bulk-question importer must read word/document.xml directly:
//  mammoth silently drops OMML equations ("An unrecognised element
//  was ignored: {…officeDocument/math}oMathPara") and flattens table
//  structure in raw-text mode. Both are fatal for a table-based
//  question template, so the OOXML is walked by hand instead.
//
//  This parser exists to serve that. It is deliberately not a
//  general-purpose XML library — it covers exactly the OOXML subset
//  Word emits and nothing else:
//
//    · the <?xml?> declaration, comments and CDATA (skipped)
//    · self-closing tags and attributes with single or double quotes
//    · namespace prefixes — only the local name is kept, because
//      OOXML leans on them to disambiguate (w:t vs m:t) but every
//      consumer here cares about the element, not the prefix
//    · the five XML entities plus numeric character references
//
//  Note this is NOT a replacement for components/editor/mathml.ts,
//  which converts MathML for the browser clipboard and relies on the
//  DOMParser global that Node does not provide.
// ============================================================

/** A parsed XML element. */
export type XmlNode = {
  /** Local name, namespace prefix stripped — "p" for `<w:p>`. */
  name: string;
  /** Attributes keyed by local name; namespace prefixes are stripped too. */
  attrs: Record<string, string>;
  /** Child elements in document order. */
  children: XmlNode[];
  /** Concatenated direct text content (not descendants'). */
  text: string;
};

/** The five predefined XML entities plus a small set Word likes to emit. */
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Strips a namespace prefix: "w:p" → "p", "p" → "p". */
function localName(qName: string): string {
  const colon = qName.indexOf(":");
  return colon === -1 ? qName : qName.slice(colon + 1);
}

/** Decodes XML entities and numeric character references in text/attrs. */
function decodeEntities(raw: string): string {
  if (!raw.includes("&")) return raw;
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body] ?? match;
  });
}

/** Reads one attribute name/value pair starting at `at`. */
function readAttribute(
  xml: string,
  at: number
): { qName: string; value: string; next: number } | null {
  // Attribute name: anything up to '=' (Word only emits simple names).
  const eq = xml.indexOf("=", at);
  if (eq === -1) return null;

  const qName = xml.slice(at, eq).trim();
  let cursor = eq + 1;
  while (cursor < xml.length && xml[cursor] === " ") cursor++;

  const quote = xml[cursor];
  if (quote !== '"' && quote !== "'") return null;
  const close = xml.indexOf(quote, cursor + 1);
  if (close === -1) return null;

  return {
    qName,
    value: decodeEntities(xml.slice(cursor + 1, close)),
    next: close + 1,
  };
}

/** Index of the `>` that closes a tag starting at `<`, skipping quoted values. */
function findTagEnd(xml: string, at: number): number {
  let cursor = at + 1;
  let quote: string | null = null;
  for (; cursor < xml.length; cursor++) {
    const ch = xml[cursor];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return cursor;
    }
  }
  return -1;
}

/** An element that closed itself has no separate end tag. */
function isSelfClosing(inner: string): boolean {
  return inner.endsWith("/");
}

/**
 * Parses an XML document into a tree.
 *
 * @returns the root element, or null when the input has no element at
 * all (empty string, or only a declaration/comments).
 */
export function parseXml(xml: string): XmlNode | null {
  if (!xml) return null;

  const root: XmlNode = { name: "#document", attrs: {}, children: [], text: "" };
  // `stack[0]` is the synthetic root; real elements are pushed above it.
  const stack: XmlNode[] = [root];
  let i = 0;

  while (i < xml.length) {
    const lt = xml.indexOf("<", i);

    // Trailing text after the last tag — belongs to the open element.
    if (lt === -1) {
      appendText(stack[stack.length - 1], xml.slice(i));
      break;
    }

    if (lt > i) appendText(stack[stack.length - 1], xml.slice(i, lt));

    // <?xml ?>, <!-- -->, <![CDATA[ ]]>, <!DOCTYPE >
    if (xml.startsWith("<?", lt)) {
      const close = xml.indexOf("?>", lt);
      i = close === -1 ? xml.length : close + 2;
      continue;
    }
    if (xml.startsWith("<!--", lt)) {
      const close = xml.indexOf("-->", lt);
      i = close === -1 ? xml.length : close + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const close = xml.indexOf("]]>", lt);
      const body = xml.slice(lt + 9, close === -1 ? xml.length : close);
      appendText(stack[stack.length - 1], body);
      i = close === -1 ? xml.length : close + 3;
      continue;
    }
    if (xml.startsWith("<!", lt)) {
      const close = xml.indexOf(">", lt);
      i = close === -1 ? xml.length : close + 1;
      continue;
    }

    const gt = findTagEnd(xml, lt);
    if (gt === -1) break;

    const inner = xml.slice(lt + 1, gt);

    // Closing tag — pop back to the matching element.
    if (inner.startsWith("/")) {
      const closing = localName(inner.slice(1).trim());
      for (let depth = stack.length - 1; depth > 0; depth--) {
        if (stack[depth].name === closing) {
          stack.length = depth;
          break;
        }
      }
      i = gt + 1;
      continue;
    }

    // Opening tag — the name runs until whitespace, "/" or ">".
    let cursor = 0;
    while (cursor < inner.length && !/[\s/>]/.test(inner[cursor])) cursor++;
    const qName = inner.slice(0, cursor);

    if (!qName) {
      i = gt + 1;
      continue;
    }

    const node: XmlNode = {
      name: localName(qName),
      attrs: {},
      children: [],
      text: "",
    };

    while (cursor < inner.length) {
      const attr = readAttribute(inner, cursor);
      if (!attr) break;
      node.attrs[localName(attr.qName)] = attr.value;
      cursor = attr.next;
    }

    stack[stack.length - 1].children.push(node);

    if (!isSelfClosing(inner)) stack.push(node);
    i = gt + 1;
  }

  return root.children[0] ?? null;
}

/** Accumulates a text run onto its parent element. */
function appendText(parent: XmlNode, chunk: string): void {
  if (!chunk) return;
  parent.text += decodeEntities(chunk);
}

// ------------------------------------------------------------
//  Traversal helpers
// ------------------------------------------------------------

/** Direct children with the given local name. */
export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((c) => c.name === name);
}

/** First direct child with the given local name, or null. */
export function childNamed(node: XmlNode, name: string): XmlNode | null {
  return node.children.find((c) => c.name === name) ?? null;
}

/** Every descendant (excluding `node`) in document order. */
export function descendants(node: XmlNode): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (n: XmlNode) => {
    for (const c of n.children) {
      out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

/**
 * All text in a subtree, in document order.
 *
 * OOXML splits a run's text across several `<w:t>` elements and can
 * interleave tabs and breaks, so consumers that want "what does this
 * cell say" need the flattened total rather than one element's text.
 */
export function textOf(node: XmlNode): string {
  let out = node.text;
  for (const c of node.children) out += textOf(c);
  return out;
}