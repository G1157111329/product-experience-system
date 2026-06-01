import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';

// POST /api/materials/presign - 批量获取素材签名URL
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paths } = body as { paths: string[] };

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ code: 1, message: 'paths 参数必填' }, { status: 400 });
    }

    // 限制单次最多50个
    const limitedPaths = paths.slice(0, 50);

    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL!,
      accessKey: process.env.OSS_ACCESS_KEY_ID!,
      secretKey: process.env.OSS_ACCESS_KEY_SECRET!,
      bucketName: process.env.COZE_BUCKET_NAME!,
      region: process.env.OSS_REGION || 'cn-beijing',
    });

    // 并行生成签名URL（有效期7天）
    const results = await Promise.allSettled(
      limitedPaths.map(async (path) => {
        try {
          const url = await storage.generatePresignedUrl({
            key: path,
            expireTime: 86400 * 7, // 7天有效期
          });
          return { path, url };
        } catch {
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
