'use client';

import { useEffect, useRef, useState } from 'react';

/** 签名 URL 全局缓存（避免重复请求） */
const globalCache = new Map<string, { url: string; expireAt: number }>();
const CACHE_TTL = 7 * 24 * 3600 * 1000; // 7天缓存

/** 正在进行的批量请求 */
let batchQueue: { filePath: string; resolve: (url: string) => void }[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 批量请求签名 URL
 * 将短时间内的多次调用合并为一次 API 请求
 */
async function requestPresignedUrls(filePaths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (filePaths.length === 0) return result;

  try {
    const res = await fetch('/api/materials/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_paths: filePaths }),
    });
    const json = await res.json();
    if (json.code === 0 && json.data) {
      for (const item of json.data) {
        result.set(item.file_path, item.url);
        // 写入全局缓存
        globalCache.set(item.file_path, { url: item.url, expireAt: Date.now() + CACHE_TTL });
      }
    }
  } catch {
    // 请求失败时静默处理
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
        } else if (item.filePath.startsWith('http')) {
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
            item.resolve(urls.get(item.filePath) || item.filePath);
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

  // 优先使用 file_path（新数据）
  if (filePath && !filePath.startsWith('http')) {
    // 检查缓存
    const cached = globalCache.get(filePath);
    if (cached && cached.expireAt > Date.now()) {
      return cached.url;
    }
    // 返回 filePath，由 hook 异步签名
    return filePath;
  }

  // 兼容旧数据：file_url 是完整签名 URL
  if (fileUrl && fileUrl.startsWith('http')) {
    // 检查签名是否过期
    const signMatch = fileUrl.match(/[?&]sign=[^&]+/);
    if (signMatch) {
      // 有签名参数，可能过期了 - 尝试使用 file_path
      if (filePath && !filePath.startsWith('http')) {
        return filePath; // 返回 path，由 hook 异步签名
      }
      // 没有 file_path，直接返回旧 URL（可能过期）
      return fileUrl;
    }
    // 无签名参数，公开 URL，直接返回
    return fileUrl;
  }

  // 兜底
  return filePath || fileUrl || null;
}

/**
 * Hook: 获取单个素材的签名 URL
 * @param filePath file_path（相对路径）或 file_url（完整URL，兼容旧数据）
 */
export function usePresignedUrl(filePath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!filePath) return null;
    if (filePath.startsWith('http')) return filePath;
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
    if (filePath.startsWith('http')) {
      setUrl(filePath);
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
  materials: T[]
): Map<string, string> {
  const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const result = new Map<string, string>();
    const toRequest: string[] = [];

    for (const m of materials) {
      const filePath = m.file_path;
      const fileUrl = m.file_url;

      // 兼容旧数据：已经是完整URL
      if (fileUrl && fileUrl.startsWith('http') && !fileUrl.includes('sign=')) {
        result.set(m.id, fileUrl);
        continue;
      }

      // 有 file_path 且不是完整 URL
      if (filePath && !filePath.startsWith('http')) {
        const cached = globalCache.get(filePath);
        if (cached && cached.expireAt > Date.now()) {
          result.set(m.id, cached.url);
        } else {
          toRequest.push(filePath);
          result.set(m.id, filePath); // 临时占位
        }
        continue;
      }

      // 兼容旧数据：file_url 是签名 URL
      if (fileUrl) {
        result.set(m.id, fileUrl);
      }
    }

    setUrlMap(new Map(result));

    // 批量请求签名 URL
    if (toRequest.length > 0) {
      requestPresignedUrls(toRequest).then((urls) => {
        if (!mountedRef.current) return;
        for (const m of materials) {
          const filePath = m.file_path;
          if (filePath && toRequest.includes(filePath)) {
            const signedUrl = urls.get(filePath);
            if (signedUrl) {
              result.set(m.id, signedUrl);
            }
          }
        }
        setUrlMap(new Map(result));
      });
    }

    return () => {
      mountedRef.current = false;
    };
  }, [JSON.stringify(materials.map((m) => m.id))]);

  return urlMap;
}

/**
 * 服务端用：直接请求签名 URL（不使用 hook）
 */
export async function fetchPresignedUrl(filePath: string): Promise<string> {
  if (filePath.startsWith('http')) return filePath;

  const cached = globalCache.get(filePath);
  if (cached && cached.expireAt > Date.now()) return cached.url;

  const urls = await requestPresignedUrls([filePath]);
  return urls.get(filePath) || filePath;
}
