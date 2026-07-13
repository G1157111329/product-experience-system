'use client';

import { useEffect, useRef, useState } from 'react';
import { readJsonResponse } from '@/lib/http';
import { resolvePresignBatches } from '@/lib/presign-batches';

/** 签名 URL 全局缓存（避免重复请求） */
const globalCache = new Map<string, { url: string; expireAt: number }>();
const CACHE_TTL = 25 * 60 * 1000;

/** 正在进行的批量请求 */
let batchQueue: { filePath: string; resolve: (url: string) => void }[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

export const pendingMediaDataUrl =
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180"><rect width="240" height="180" rx="10" fill="#f7f2e9"/><text x="120" y="94" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#8a735c">正在加载素材</text></svg>',
  )}`;

export function isPendingMediaUrl(value: string | null | undefined): boolean {
  return value === pendingMediaDataUrl;
}

export const unavailableMediaDataUrl =
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180"><rect width="240" height="180" rx="10" fill="#f7f2e9"/><path d="M72 66h86a10 10 0 0 1 10 10v52a10 10 0 0 1-10 10H72a10 10 0 0 1-10-10V76a10 10 0 0 1 10-10Z" fill="none" stroke="#d8c7ad" stroke-width="4"/><path d="m76 122 28-28 22 22 13-13 29 29" fill="none" stroke="#d8c7ad" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="145" cy="85" r="8" fill="#d8c7ad"/><text x="120" y="154" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#8a735c">素材文件缺失</text></svg>',
  )}`;

export function isUnavailableMediaUrl(value: string | null | undefined): boolean {
  return value === unavailableMediaDataUrl;
}

function areUrlMapsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

function isDataUrl(value: string): boolean {
  return value.startsWith('data:');
}

function currentOrigin(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.origin;
}

export function isAllowedMediaSource(value: string, origin = currentOrigin()): boolean {
  if (
    value.startsWith('/api/materials/file/')
    || value.startsWith('/uploads/')
    || value.startsWith('/media/')
    || value.startsWith('blob:')
    || isDataUrl(value)
  ) return true;
  if (value.startsWith('https://')) return true;
  if (!value.startsWith('http://') || !origin) return false;
  try {
    return new URL(value).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

function isDirectMediaUrl(value: string): boolean {
  return isAllowedMediaSource(value);
}

export function toPublicMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isDirectMediaUrl(value)) return value;
  if (/^https?:\/\//i.test(value)) return null;
  return `/uploads/${value.replace(/^\/+/, '')}`;
}

function toStorageKey(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('/uploads/')) return value.slice('/uploads/'.length);
  if (value.startsWith('/api/materials/file/')) return null;
  if (/^(https?:|blob:|data:)/i.test(value)) return null;
  return value;
}

function getStorageKey(material: { file_url?: string | null; file_path?: string | null }): string | null {
  const filePath = toStorageKey(material.file_path);
  const fileUrl = toStorageKey(material.file_url);
  if (filePath && !isDirectMediaUrl(filePath)) return filePath;
  if (fileUrl && !isDirectMediaUrl(fileUrl)) return fileUrl;
  return null;
}

function getShareTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/reports\/share\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getReportIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const detailMatch = window.location.pathname.match(/^\/reports\/([^/]+)/);
  if (detailMatch && detailMatch[1] !== 'share' && detailMatch[1] !== 'print') {
    return decodeURIComponent(detailMatch[1]);
  }
  if (window.location.pathname === '/reports/print') {
    return new URLSearchParams(window.location.search).get('id');
  }
  return null;
}

/**
 * 批量请求签名 URL
 * 将短时间内的多次调用合并为一次 API 请求
 */
async function requestPresignedUrls(filePaths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (filePaths.length === 0) return result;
  if (filePaths.length > 50) {
    const urlMap = await resolvePresignBatches(filePaths, async (batch) =>
      Object.fromEntries(await requestPresignedUrls(batch)));
    return new Map(Object.entries(urlMap));
  }

  try {
    const res = await fetch('/api/materials/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paths: filePaths,
        report_id: getReportIdFromLocation(),
        share_token: getShareTokenFromLocation(),
      }),
    });
    const json = await readJsonResponse<{ code: number; data?: Record<string, string> }>(res);
    if (json.code === 0 && json.data) {
      // 后端返回 { "path1": "url1", "path2": "url2" } 对象格式
      for (const [path, url] of Object.entries(json.data)) {
        if (typeof url === 'string') {
          result.set(path, url);
          // 写入全局缓存
          globalCache.set(path, { url, expireAt: Date.now() + CACHE_TTL });
        }
      }
    }
  } catch {
    // 请求失败时静默处理
  }
  for (const filePath of filePaths) {
    if (!result.has(filePath)) result.set(filePath, unavailableMediaDataUrl);
  }
  return result;
}

/**
 * 调度批量请求（合并短时间内的调用）
 */
function scheduleBatch(filePath: string, resolve: (url: string) => void) {
  batchQueue.push({ filePath, resolve });

  if (!batchTimer) {
    batchTimer = setTimeout(async () => {
      const items = [...batchQueue];
      batchQueue = [];
      batchTimer = null;

      // 过滤出需要请求的路径
      const toRequest: string[] = [];
      const cached: { filePath: string; resolve: (url: string) => void; url: string }[] = [];

      for (const item of items) {
        const cachedEntry = globalCache.get(item.filePath);
        if (cachedEntry && cachedEntry.expireAt > Date.now()) {
          cached.push({ ...item, url: cachedEntry.url });
        } else if (isDirectMediaUrl(item.filePath)) {
          // 兼容旧数据：已经是完整URL
          cached.push({ ...item, url: item.filePath });
        } else {
          toRequest.push(item.filePath);
        }
      }

      // 立即返回缓存结果
      for (const c of cached) {
        c.resolve(c.url);
      }

      // 批量请求未缓存的
      if (toRequest.length > 0) {
        const urls = await requestPresignedUrls(toRequest);
        for (const item of items) {
          if (toRequest.includes(item.filePath)) {
            const resolvedUrl = urls.get(item.filePath);
            item.resolve(
              resolvedUrl && !isUnavailableMediaUrl(resolvedUrl)
                ? resolvedUrl
                : toPublicMediaUrl(item.filePath) || item.filePath,
            );
          }
        }
      }
    }, 50); // 50ms 合并窗口
  }
}

/**
 * 获取素材的可访问 URL
 * 自动判断 file_path / file_url，返回签名后的临时 URL
 */
export function getMediaSrc(material: { file_url?: string | null; file_path?: string | null }): string | null {
  const filePath = material.file_path;
  const fileUrl = material.file_url;
  const storageKey = getStorageKey(material);

  // 优先使用 file_path，其次兼容旧数据里存到 file_url 的对象 key。
  if (storageKey) {
    // 检查缓存
    const cached = globalCache.get(storageKey);
    if (cached && cached.expireAt > Date.now()) {
      return cached.url;
    }
    // 返回对象 key，由 hook 异步签名
    return storageKey;
  }

  // 兼容旧数据：file_url 是完整签名 URL
  if (fileUrl && isDirectMediaUrl(fileUrl)) {
    // 检查签名是否过期
    const signMatch = fileUrl.match(/[?&]sign=[^&]+/);
    if (signMatch) {
      // 有签名参数，可能过期了 - 尝试使用 file_path
      if (filePath && !isDirectMediaUrl(filePath)) {
        return filePath; // 返回 path，由 hook 异步签名
      }
      // 没有 file_path，直接返回旧 URL（可能过期）
      return fileUrl;
    }
    // 无签名参数，公开 URL，直接返回
    return fileUrl;
  }

  // Never fall back to a non-HTTPS cross-origin URL. It may be an enterprise
  // network block page rather than the requested media asset.
  if (filePath && !/^https?:\/\//i.test(filePath)) return filePath;
  return null;
}

/**
 * Hook: 获取单个素材的签名 URL
 * @param filePath file_path（相对路径）或 file_url（完整URL，兼容旧数据）
 */
export function usePresignedUrl(filePath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!filePath) return null;
    if (isDirectMediaUrl(filePath)) return filePath;
    if (/^https?:\/\//i.test(filePath)) return null;
    const cached = globalCache.get(filePath);
    if (cached && cached.expireAt > Date.now()) return cached.url;
    return null;
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!filePath) {
      setUrl(null);
      return;
    }

    // 兼容旧数据：已经是完整URL
    if (isDirectMediaUrl(filePath)) {
      setUrl(filePath);
      return;
    }
    if (/^https?:\/\//i.test(filePath)) {
      setUrl(null);
      return;
    }

    const cached = globalCache.get(filePath);
    if (cached && cached.expireAt > Date.now()) {
      setUrl(cached.url);
      return;
    }

    scheduleBatch(filePath, (u) => {
      if (mountedRef.current) setUrl(u);
    });

    return () => {
      mountedRef.current = false;
    };
  }, [filePath]);

  return url;
}

/**
 * Hook: 批量获取素材的签名 URL
 * @param materials 素材数组
 * @returns Map<materialId, signedUrl>
 */
export function usePresignedUrls<T extends { id: string; file_url?: string | null; file_path?: string | null }>(
  materials: T[],
  options?: { unavailableUrl?: string },
): Map<string, string> {
  const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);
  const materialSignature = materials
    .map((m) => `${m.id}:${m.file_path ?? ''}:${m.file_url ?? ''}`)
    .join('|');
  const unavailableUrl = options?.unavailableUrl;

  useEffect(() => {
    mountedRef.current = true;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const materialSnapshot = materials;

    const result = new Map<string, string>();
    const toRequest: string[] = [];

    for (const m of materialSnapshot) {
      const filePath = getStorageKey(m);
      const fileUrl = m.file_url;

      // 兼容旧数据：已经是完整URL
      if (!filePath && fileUrl && isDirectMediaUrl(fileUrl) && !fileUrl.includes('sign=')) {
        result.set(m.id, fileUrl);
        continue;
      }

      // 有对象 key 且不是完整 URL
      if (filePath) {
        const cached = globalCache.get(filePath);
        if (cached && cached.expireAt > Date.now()) {
          result.set(m.id, cached.url);
        } else {
          toRequest.push(filePath);
          result.set(m.id, pendingMediaDataUrl); // 临时占位，避免旧对象 key 被浏览器当成相对路径请求
        }
        continue;
      }

      // 兼容旧数据：file_url 是签名 URL
      if (fileUrl && isDirectMediaUrl(fileUrl)) {
        result.set(m.id, fileUrl);
      }
    }

    setUrlMap((previous) => (
      areUrlMapsEqual(previous, result) ? previous : new Map(result)
    ));

    // 批量请求签名 URL
    if (toRequest.length > 0) {
      requestPresignedUrls(toRequest).then((urls) => {
        if (!mountedRef.current || runIdRef.current !== runId) return;
        for (const m of materialSnapshot) {
          const filePath = getStorageKey(m);
          if (filePath && toRequest.includes(filePath)) {
            const signedUrl = urls.get(filePath);
            result.set(
              m.id,
              signedUrl && !isUnavailableMediaUrl(signedUrl)
                ? signedUrl
                : unavailableUrl || toPublicMediaUrl(filePath) || filePath,
            );
          }
        }
        setUrlMap((previous) => (
          areUrlMapsEqual(previous, result) ? previous : new Map(result)
        ));
      });
    }

    return () => {
      mountedRef.current = false;
    };
  // materialSignature fully represents every material field read by this effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialSignature, unavailableUrl]);

  return urlMap;
}

/**
 * 服务端用：直接请求签名 URL（不使用 hook）
 */
export async function fetchPresignedUrl(filePath: string): Promise<string> {
  if (isDirectMediaUrl(filePath)) return filePath;
  if (/^https?:\/\//i.test(filePath)) return '';

  const cached = globalCache.get(filePath);
  if (cached && cached.expireAt > Date.now()) return cached.url;

  const urls = await requestPresignedUrls([filePath]);
  const resolvedUrl = urls.get(filePath);
  return resolvedUrl && !isUnavailableMediaUrl(resolvedUrl) ? resolvedUrl : filePath;
}
