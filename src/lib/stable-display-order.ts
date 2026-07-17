type StableRow = {
  id: string;
  createdAt?: string | null;
  created_at?: string | null;
};

type FrozenIssueRow = StableRow & {
  sourceKind: 'sensory' | 'function' | 'comparison' | 'matrix';
};

type MaterialOrderRow = StableRow & {
  bindingOrder?: number | null;
  binding_order?: number | null;
  linkedAt?: string | null;
  linked_at?: string | null;
  boundAt?: string | null;
  bound_at?: string | null;
};

const ISSUE_SOURCE_RANK: Record<FrozenIssueRow['sourceKind'], number> = {
  sensory: 0,
  function: 1,
  comparison: 2,
  matrix: 3,
};

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function compareOptionalText(left: unknown, right: unknown): number {
  const a = text(left);
  const b = text(right);
  if (a && b) return a.localeCompare(b);
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function createdAt(row: StableRow): string {
  return text(row.createdAt ?? row.created_at);
}

export function sortCreatedAscending<T extends StableRow>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => (
    compareOptionalText(createdAt(left), createdAt(right)) || left.id.localeCompare(right.id)
  ));
}

export function sortFrozenIssues<T extends FrozenIssueRow>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => (
    ISSUE_SOURCE_RANK[left.sourceKind] - ISSUE_SOURCE_RANK[right.sourceKind]
    || compareOptionalText(createdAt(left), createdAt(right))
    || left.id.localeCompare(right.id)
  ));
}

function bindingOrder(row: MaterialOrderRow): number | null {
  const value = row.bindingOrder ?? row.binding_order;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function linkedAt(row: MaterialOrderRow): string {
  return text(row.linkedAt ?? row.linked_at ?? row.boundAt ?? row.bound_at);
}

export function sortMaterialsByBinding<T extends MaterialOrderRow>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const leftOrder = bindingOrder(left);
    const rightOrder = bindingOrder(right);
    const leftRank = leftOrder !== null ? 0 : linkedAt(left) ? 1 : 2;
    const rightRank = rightOrder !== null ? 0 : linkedAt(right) ? 1 : 2;
    return leftRank - rightRank
      || (leftOrder !== null && rightOrder !== null ? leftOrder - rightOrder : 0)
      || compareOptionalText(linkedAt(left), linkedAt(right))
      || compareOptionalText(createdAt(left), createdAt(right))
      || left.id.localeCompare(right.id);
  });
}
