import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

// Allow up to 100MB file uploads with extended timeout
export const maxDuration = 120; // seconds - extended for large video uploads
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const record_id = formData.get('record_id') as string | null;
    const task_id = formData.get('task_id') as string | null;
    const recipe_step_id = formData.get('recipe_step_id') as string | null;
    const recipe_library_step_id = formData.get('recipe_library_step_id') as string | null;
    const recipe_id = formData.get('recipe_id') as string | null;

    if (!file) {
      return NextResponse.json({ code: 1, message: '缺少文件' }, { status: 400 });
    }

    if (!task_id && !recipe_library_step_id) {
      return NextResponse.json({ code: 1, message: '缺少必要参数(需提供task_id或recipe_library_step_id)' }, { status: 400 });
    }

    // 文件大小校验 (100MB)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ code: 1, message: '文件大小超过100MB限制' }, { status: 400 });
    }

    // 文件类型校验
    const allowedTypes = ['image/', 'video/'];
    if (!allowedTypes.some(t => file.type.startsWith(t))) {
      return NextResponse.json({ code: 1, message: '仅支持图片和视频文件' }, { status: 400 });
    }

    const materialType = file.type.startsWith('image/') ? 'image' : 'video';

    // Use streaming for large files (>5MB)
    const isLargeFile = file.size > 5 * 1024 * 1024;
    let buffer: Buffer;
    try {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } catch (bufErr) {
      console.error('[upload] Buffer creation failed:', bufErr);
      return NextResponse.json({ code: 1, message: `文件读取失败(${(file.size / 1024 / 1024).toFixed(1)}MB)，请重试` }, { status: 500 });
    }

    const timestamp = Date.now();
    const folderId = recipe_library_step_id || task_id || 'unknown';
    const fileName = `experience-media/${folderId}/${materialType}/${timestamp}_${file.name}`;

    // 上传到对象存储 (with retry for large files)
    let fileKey: string | undefined;
    const maxRetries = isLargeFile ? 2 : 0;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        fileKey = await storage.uploadFile({
          fileContent: buffer,
          fileName,
          contentType: file.type,
        });
        break;
      } catch (uploadErr) {
        console.error(`[upload] S3 upload attempt ${attempt + 1} failed:`, uploadErr);
        if (attempt === maxRetries) {
          return NextResponse.json({
            code: 1,
            message: `文件上传失败(${(file.size / 1024 / 1024).toFixed(1)}MB)，请检查网络后重试`
          }, { status: 500 });
        }
        // Wait before retry
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    if (!fileKey) {
      return NextResponse.json({ code: 1, message: '文件上传失败' }, { status: 500 });
    }

    // 生成访问URL
    let fileUrl: string;
    try {
      fileUrl = await storage.generatePresignedUrl({ key: fileKey, expireTime: 86400 * 30 });
    } catch (urlErr) {
      console.error('[upload] Generate presigned URL failed:', urlErr);
      // Fallback: construct URL manually
      fileUrl = `${process.env.COZE_BUCKET_ENDPOINT_URL}/${process.env.COZE_BUCKET_NAME}/${fileKey}`;
    }

    // 保存素材记录到数据库
    const client = getSupabaseClient();
    const { data, error } = await client.from('materials').insert({
      record_id: record_id || null,
      task_id: task_id || null,
      recipe_step_id: recipe_step_id || null,
      recipe_library_step_id: recipe_library_step_id || null,
      recipe_id: recipe_id || null,
      material_type: materialType,
      file_name: file.name,
      file_path: fileKey,
      file_size: file.size,
      file_url: fileUrl,
    }).select().single();

    if (error) {
      console.error('[upload] DB insert failed:', error);
      return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ code: 0, message: '上传成功', data: { ...data, file_url: fileUrl } });
  } catch (err) {
    console.error('[upload] Unexpected error:', err);
    const message = err instanceof Error ? err.message : '上传失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}
