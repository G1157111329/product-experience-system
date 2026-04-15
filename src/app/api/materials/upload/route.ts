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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const record_id = formData.get('record_id') as string;
    const task_id = formData.get('task_id') as string;

    if (!file || !record_id || !task_id) {
      return NextResponse.json({ code: 1, message: '缺少必要参数' }, { status: 400 });
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
    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const fileName = `experience-media/${task_id}/${materialType}/${timestamp}_${file.name}`;

    // 上传到对象存储
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type,
    });

    // 生成访问URL
    const fileUrl = await storage.generatePresignedUrl({ key: fileKey, expireTime: 86400 * 30 });

    // 保存素材记录到数据库
    const client = getSupabaseClient();
    const { data, error } = await client.from('materials').insert({
      record_id,
      task_id,
      material_type: materialType,
      file_name: file.name,
      file_path: fileKey,
      file_size: file.size,
      file_url: fileUrl,
    }).select().single();

    if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

    return NextResponse.json({ code: 0, message: '上传成功', data: { ...data, file_url: fileUrl } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '上传失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}
