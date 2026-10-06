// ============================================================
//  Taxonomy dropdown labels with question totals
//
//  Subject / chapter / topic dropdowns show how many questions
//  already exist for that node, e.g. "Physics(24)".
// ============================================================

/** Node shape needed to render a count label (matches TaxonomyNode). */
type CountedNode = {
  questionCount?: number | null;
  children?: readonly CountedNode[];
};

/**
 * "Physics" + 24 → "Physics(24)". Nodes without a count keep their plain name.
 */
export function taxLabel(name: string, count?: number | null): string {
  return typeof count === "number" ? `${name}(${count})` : name;
}

/**
 * Total questions under a node. Class levels carry no count of their own,
 * so fall back to the sum of their children (subjects → chapters → topics).
 */
export function subtreeQuestionCount(node: CountedNode): number {
  if (typeof node.questionCount === "number") return node.questionCount;
  return (node.children ?? []).reduce<number>(
    (sum, child) => sum + subtreeQuestionCount(child),
    0
  );
}

/** Convenience: label for a whole subtree node, e.g. "Std 10(120)". */
export function nodeLabel(node: CountedNode & { name: string }): string {
  return taxLabel(node.name, subtreeQuestionCount(node));
}
