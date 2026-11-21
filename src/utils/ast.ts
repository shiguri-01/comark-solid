import type { ElementNode, Node } from "comark";

export function getTag(node: ElementNode): string {
  return node[0];
}

export function getAttributes(node: ElementNode): Record<string, unknown> {
  return node[1];
}

export function getChildren(node: ElementNode): Node[] {
  const [, , ...children] = node;
  return children;
}

export function isElementNode(node: Node): node is ElementNode {
  return Array.isArray(node) && node.length >= 1 && typeof node[0] === "string";
}
