export const PRESIGN_BATCH_SIZE = 50;

export async function resolvePresignBatches(
  paths: string[],
  requestBatch: (paths: string[]) => Promise<Record<string, string>>,
) {
  const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
  const result: Record<string, string> = {};

  for (let index = 0; index < unique.length; index += PRESIGN_BATCH_SIZE) {
    const batch = unique.slice(index, index + PRESIGN_BATCH_SIZE);
    try {
      Object.assign(result, await requestBatch(batch));
    } catch {
      // A failed storage batch must not prevent later media from resolving.
    }
  }

  return result;
}
