type ApiPerformanceMeta = Record<string, string | number | boolean | null | undefined>;

const DEFAULT_WARN_MS = 800;

export function createApiTimer(name: string, warnMs = DEFAULT_WARN_MS) {
  const startedAt = Date.now();
  return (meta: ApiPerformanceMeta = {}) => {
    const durationMs = Date.now() - startedAt;
    if (durationMs < warnMs) return;
    console.warn(`[api.performance] ${name} ${durationMs}ms`, meta);
  };
}
