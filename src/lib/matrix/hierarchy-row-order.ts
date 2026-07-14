type HierarchyOrderedRow = {
  id: string;
  level1NodeId: string;
  level2NodeId: string | null;
  level3NodeId: string | null;
  visibleRowIndex: number;
};

function sortOrderFor(nodeId: string | null, sortOrderByNodeId: ReadonlyMap<string, number>) {
  return nodeId ? sortOrderByNodeId.get(nodeId) ?? Number.MAX_SAFE_INTEGER : 0;
}

/** Sort leaf rows by their displayed hierarchy, not by the time children were created. */
export function orderRowsByHierarchy<T extends HierarchyOrderedRow>(
  rows: readonly T[],
  sortOrderByNodeId: ReadonlyMap<string, number>,
): T[] {
  return [...rows].sort((left, right) =>
    sortOrderFor(left.level1NodeId, sortOrderByNodeId) - sortOrderFor(right.level1NodeId, sortOrderByNodeId)
    || sortOrderFor(left.level2NodeId, sortOrderByNodeId) - sortOrderFor(right.level2NodeId, sortOrderByNodeId)
    || sortOrderFor(left.level3NodeId, sortOrderByNodeId) - sortOrderFor(right.level3NodeId, sortOrderByNodeId)
    || left.visibleRowIndex - right.visibleRowIndex,
  );
}
