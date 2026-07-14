export type CurrentMatrixCandidate = {
  id: string;
  status: string;
  meaningful: boolean;
  updatedAt: string | null;
  contentUpdatedAt: string | null;
};

function timestamp(value: string | null) {
  const time = value ? Date.parse(value) : Number.NEGATIVE_INFINITY;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Prefer the newest non-archived matrix that contains real input, evidence,
 * narrative, or issue content. Empty drafts are only a fallback.
 */
export function selectCurrentMatrix<T extends CurrentMatrixCandidate>(matrices: T[]): T | null {
  const active = matrices.filter((matrix) => matrix.status !== 'archived');
  const candidates = active.some((matrix) => matrix.meaningful)
    ? active.filter((matrix) => matrix.meaningful)
    : active;
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, matrix) => {
    const latestTime = timestamp(latest.contentUpdatedAt ?? latest.updatedAt);
    const matrixTime = timestamp(matrix.contentUpdatedAt ?? matrix.updatedAt);
    return matrixTime > latestTime ? matrix : latest;
  });
}
