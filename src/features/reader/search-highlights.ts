interface HighlightConstructor {
  new (...ranges: Range[]): Highlight;
}

const pageRanges = new Map<number, Range[]>();
const pageActive = new Map<number, Range>();

function highlightConstructor(): HighlightConstructor | null {
  const ctor = (window as unknown as { Highlight?: HighlightConstructor }).Highlight;
  return typeof ctor === 'function' ? ctor : null;
}

function refresh(): void {
  if (!CSS.highlights) return;
  const HighlightCtor = highlightConstructor();
  if (!HighlightCtor) return;
  const all = [...pageRanges.values()].flat();
  if (all.length > 0) CSS.highlights.set('folio-search', new HighlightCtor(...all));
  else CSS.highlights.delete('folio-search');
  const active = [...pageActive.values()];
  if (active.length > 0) CSS.highlights.set('folio-search-active', new HighlightCtor(...active));
  else CSS.highlights.delete('folio-search-active');
}

export function setPageSearchRanges(pageIndex: number, ranges: Range[], activeRange?: Range): void {
  pageRanges.set(pageIndex, ranges);
  if (activeRange) pageActive.set(pageIndex, activeRange);
  else pageActive.delete(pageIndex);
  refresh();
}

export function clearPageSearchRanges(pageIndex: number): void {
  pageRanges.delete(pageIndex);
  pageActive.delete(pageIndex);
  refresh();
}

export function findTextRanges(
  root: HTMLElement,
  query: string,
  caseSensitive = false,
): Range[] {
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  if (!needle) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let text = '';
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue ?? '';
    if (value.length > 0) {
      nodes.push({ node: node as Text, start: text.length, end: text.length + value.length });
      text += value;
    }
    node = walker.nextNode();
  }
  if (nodes.length === 0) return [];
  const haystack = caseSensitive ? text : text.toLocaleLowerCase();
  const ranges: Range[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    const end = index + needle.length;
    const startNode = nodes.find((entry) => index >= entry.start && index < entry.end);
    const endNode = nodes.find((entry) => end > entry.start && end <= entry.end);
    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode.node, index - startNode.start);
      range.setEnd(endNode.node, end - endNode.start);
      ranges.push(range);
    }
    from = index + Math.max(1, needle.length);
  }
  return ranges;
}
