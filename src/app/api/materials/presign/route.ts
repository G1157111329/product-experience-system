import { NextRequest, NextResponse } from 'next/server';
import { generatePresignedUrl } from '@/lib/server/storage';

// POST /api/materials/presign - 批量获取素材签名URL
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paths, file_paths } = body as { paths?: string[]; file_paths?: string[] };
    const requestedPaths = Array.isArray(paths) ? paths : file_paths;

    if (!requestedPaths || !Array.isArray(requestedPaths) || requestedPaths.length === 0) {
      return NextResponse.json({ code: 1, message: 'paths 参数必填' }, { status: 400 });
    }

    // 限制单次最多50个
    const limitedPaths = requestedPaths.slice(0, 50);

    // 并行生成签名URL（有效期7天）
    const results = await Promise.allSettled(
      limitedPaths.map(async (path) => {
        try {
          const url = await generatePresignedUrl({
            key: path,
            expireTime: 86400 * 7,
          });
          return { path, url };
        } catch (err) {
          console.error('[presign] Failed for path:', path, err);
          return { path, url: null };
        }
      })
    );

    const urlMap: Record<string, string> = {};
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.url) {
        urlMap[result.value.path] = result.value.url;
      }
    }

    return NextResponse.json({ code: 0, data: urlMap });
  } catch (error) {
    console.error('[presign] Error:', error);
    return NextResponse.json(
      { code: 1, message: '生成签名URL失败' },
      { status: 500 }
    );
  }
}
