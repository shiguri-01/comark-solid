import type { Node } from "comark";

export function getTag(node: Node): string | null {
  if (Array.isArray(node) && node.length >= 1 && typeof node[0] === "string") {
    return node[0];
  }

  return null;
}

export function getAttributes(node: Node): Record<string, unknown> {
  if (Array.isArray(node) && node.length >= 2) {
    return (node[1] as Record<string, unknown>) || {};
  }

  return {};
}

export function getChildren(node: Node): Node[] {
  if (Array.isArray(node) && node.length > 2) {
    return node.slice(2) as Node[];
  }

  return [];
}
