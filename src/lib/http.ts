export async function readJsonResponse<T = unknown>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(response.ok ? '服务器返回了空响应' : `请求失败 (${response.status})`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`服务器返回了无法解析的数据 (${response.status})`);
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload
      ? String((payload as { message?: unknown }).message || '')
      : '';
    throw new Error(message || `请求失败 (${response.status})`);
  }

  return payload as T;
}

export async function fetchJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  return readJsonResponse<T>(response);
}

export function getErrorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
