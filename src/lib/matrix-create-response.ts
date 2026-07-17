type MatrixCreatePayload = {
  code?: number;
  data?: { id?: unknown };
  error?: unknown;
};

/** Supports both the legacy `{ code: 0 }` body and the v1 API envelope. */
export function getCreatedMatrixId(responseOk: boolean, payload: MatrixCreatePayload): string | null {
  if (!responseOk || payload.error) return null;
  const id = payload.data?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
