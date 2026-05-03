export interface ReqNode {
  text: string;
  type: 'AND' | 'OR' | 'N_OF' | 'COURSE' | 'ADDITIONAL';
  code?: string;
  n?: number;
  children?: ReqNode[];
}

export function satisfies(node: ReqNode, completed: Set<string>): boolean {
  switch (node.type) {
    case 'COURSE':   return !!node.code && completed.has(node.code);
    case 'AND':      return (node.children ?? []).every(c => satisfies(c, completed));
    case 'OR':       return (node.children ?? []).some(c => satisfies(c, completed));
    case 'N_OF': {
      const done = (node.children ?? []).filter(c => satisfies(c, completed)).length;
      return done >= (node.n ?? 1);
    }
    default:         return false;
  }
}

export function nodeProgress(node: ReqNode, completed: Set<string>): { done: number; total: number } {
  switch (node.type) {
    case 'COURSE':
      if (!node.code) return { done: 0, total: 0 };
      return { done: completed.has(node.code) ? 1 : 0, total: 1 };
    case 'OR':
      return { done: satisfies(node, completed) ? 1 : 0, total: 1 };
    case 'AND': {
      const children = node.children ?? [];
      return { done: children.filter(c => satisfies(c, completed)).length, total: children.length };
    }
    case 'N_OF': {
      const n = node.n ?? 1;
      return {
        done: Math.min((node.children ?? []).filter(c => satisfies(c, completed)).length, n),
        total: n,
      };
    }
    default:
      return { done: 0, total: 0 };
  }
}

export function courseCodes(node: ReqNode): string[] {
  if (node.type === 'COURSE' && node.code) return [node.code];
  return (node.children ?? []).flatMap(courseCodes);
}
