type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
    hChildren?: Array<{ type: string; value: string }>;
  };
};

const REF_PATTERN = /\[(ref[_-]?\d+)\]/gi;
const FENCE_PATTERN = /^```/gm;
const BLOCK_SEPARATOR_PATTERN = /\n[ \t]*\n/g;
const STREAMING_LINE_BOUNDARY_PATTERN =
  /^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s?)/;

export function normalizeInlineReferenceClusters(content: string) {
  const refPattern = String.raw`\[ref[_-]?\d+\]`;
  const connectorPattern = String.raw`(?:\u548c|\u4e0e|\u53ca|\u3001|,|\uff0c|and|&)`;
  const connectorGroupPattern = new RegExp(
    String.raw`(${refPattern})\s*${connectorPattern}\s*(${refPattern})`,
    "gi"
  );

  let normalized = content;

  while (connectorGroupPattern.test(normalized)) {
    normalized = normalized.replace(connectorGroupPattern, "$1$2");
    connectorGroupPattern.lastIndex = 0;
  }

  return normalized;
}

export function repairStreamingMarkdown(content: string) {
  const fenceCount = content.match(FENCE_PATTERN)?.length ?? 0;

  if (fenceCount % 2 !== 0) return `${content}\n\`\`\``;

  let repairedContent = content;

  if (countUnescapedInlineBackticks(repairedContent) % 2 !== 0) {
    repairedContent += "`";
  }

  if (countUnescapedToken(repairedContent, "**") % 2 !== 0) {
    repairedContent += "**";
  }

  return repairedContent;
}

export function splitStreamingMarkdown(content: string) {
  if (!content) return { stable: "", active: "" };

  const openFenceStart = findOpenFenceStart(content);
  if (openFenceStart > 0) {
    return {
      stable: content.slice(0, openFenceStart).trimEnd(),
      active: content.slice(openFenceStart).replace(/^\n+/, ""),
    };
  }

  let lastBoundaryEnd = -1;
  for (const match of content.matchAll(BLOCK_SEPARATOR_PATTERN)) {
    lastBoundaryEnd = (match.index ?? 0) + match[0].length;
  }

  if (lastBoundaryEnd > 0 && lastBoundaryEnd < content.length) {
    return {
      stable: content.slice(0, lastBoundaryEnd).trimEnd(),
      active: content.slice(lastBoundaryEnd),
    };
  }

  const lastLineBreak = content.lastIndexOf("\n");
  if (lastLineBreak > 0 && lastLineBreak < content.length - 1) {
    const activeLine = content.slice(lastLineBreak + 1);
    if (shouldSplitActiveLine(activeLine)) {
      return {
        stable: content.slice(0, lastLineBreak).trimEnd(),
        active: activeLine,
      };
    }
  }

  return { stable: "", active: content };
}

export function splitStreamingMarkdownTail(content: string) {
  if (!content) return { settled: "", active: "" };

  if (findOpenFenceStart(content) >= 0) {
    return { settled: "", active: content };
  }

  const trimmedEnd = content.replace(/[ \t]+$/g, "");
  if (trimmedEnd.endsWith("\n")) {
    return { settled: trimmedEnd, active: "" };
  }

  const lastLineBreak = trimmedEnd.lastIndexOf("\n");
  if (lastLineBreak < 0) return { settled: "", active: trimmedEnd };

  return {
    settled: trimmedEnd.slice(0, lastLineBreak + 1),
    active: trimmedEnd.slice(lastLineBreak + 1),
  };
}

export function remarkChatReferences() {
  return (tree: MarkdownNode) => {
    transformReferenceTextNodes(tree);
  };
}

function transformReferenceTextNodes(node: MarkdownNode) {
  if (!node.children) return;

  node.children = node.children.flatMap((child) => {
    if (child.type === "text" && child.value) {
      return splitReferenceTextNode(child.value);
    }

    transformReferenceTextNodes(child);
    return child;
  });
}

function splitReferenceTextNode(value: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(REF_PATTERN)) {
    const fullMatch = match[0];
    const refId = match[1];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push({ type: "text", value: value.slice(lastIndex, index) });
    }

    nodes.push({
      type: "chatReference",
      children: [{ type: "text", value: `[${refId}]` }],
      data: {
        hName: "sup",
        hProperties: { className: ["chat-ref"] },
        hChildren: [{ type: "text", value: `[${refId}]` }],
      },
    });

    lastIndex = index + fullMatch.length;
  }

  if (lastIndex < value.length) {
    nodes.push({ type: "text", value: value.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [{ type: "text", value }];
}

function countUnescapedInlineBackticks(content: string) {
  let count = 0;

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "`") continue;
    if (content[index - 1] === "\\") continue;

    const previous = content[index - 1];
    const next = content[index + 1];

    if (previous === "`" || next === "`") continue;

    count += 1;
  }

  return count;
}

function countUnescapedToken(content: string, token: string) {
  let count = 0;
  let index = 0;

  while (index < content.length) {
    const nextIndex = content.indexOf(token, index);
    if (nextIndex === -1) break;

    if (content[nextIndex - 1] !== "\\") {
      count += 1;
    }

    index = nextIndex + token.length;
  }

  return count;
}

function findOpenFenceStart(content: string) {
  const matches = Array.from(content.matchAll(FENCE_PATTERN));
  if (matches.length % 2 === 0) return -1;

  return matches[matches.length - 1]?.index ?? -1;
}

function shouldSplitActiveLine(line: string) {
  if (!line.trim()) return false;
  if (STREAMING_LINE_BOUNDARY_PATTERN.test(line)) return true;

  return line.length >= 24;
}
