import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { generatePresignedUrl, LOCAL_UPLOAD_DIR, STORAGE_DRIVER, uploadFile, isNewUploadS3 } from '@/lib/server/storage';
import { faststartRemux } from '@/lib/server/video';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, canAccessTask, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { checkSharedRateLimit } from '@/lib/server/rate-limit';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { allocateEditedCopyFileName, allocateMaterialFileName } from '@/lib/material-naming';
import { Readable } from 'stream';
import path from 'path';
import type { ReadableStream as NodeReadableStream } from 'stream/web';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const MAX_INLINE_MEDIA = 5;

const ALLOWED_UPLOAD_TYPES: Record<string, { materialType: 'image' | 'video'; mimeTypes: string[] }> = {
  jpg: { materialType: 'image', mimeTypes: ['image/jpeg', 'image/jpg'] },
  jpeg: { materialType: 'image', mimeTypes: ['image/jpeg', 'image/jpg'] },
  png: { materialType: 'image', mimeTypes: ['image/png'] },
  gif: { materialType: 'image', mimeTypes: ['image/gif'] },
  webp: { materialType: 'image', mimeTypes: ['image/webp'] },
  heic: { materialType: 'image', mimeTypes: ['image/heic', 'image/heif'] },
  heif: { materialType: 'image', mimeTypes: ['image/heic', 'image/heif'] },
  mp4: { materialType: 'video', mimeTypes: ['video/mp4'] },
  m4v: { materialType: 'video', mimeTypes: ['video/mp4', 'video/x-m4v'] },
  mov: { materialType: 'video', mimeTypes: ['video/quicktime', 'video/mp4'] },
  webm: { materialType: 'video', mimeTypes: ['video/webm'] },
};

async function getRelatedTaskIds(client: ReturnType<typeof getSupabaseClient>, ids: {
  task_id?: string | null;
  record_id?: string | null;
  recipe_step_id?: string | null;
  recipe_id?: string | null;
  issue_id?: string | null;
  re_evaluation_id?: string | null;
}) {
  const taskIds = new Set<string>();
  if (ids.task_id) taskIds.add(ids.task_id);

  if (ids.record_id) {
    const { data } = await client.from('check_records').select('task_id').eq('id', ids.record_id).maybeSingle();
    if (data?.task_id) taskIds.add(String(data.task_id));
  }
  if (ids.recipe_id) {
    const { data } = await client.from('recipes').select('task_id').eq('id', ids.recipe_id).maybeSingle();
    if (data?.task_id) taskIds.add(String(data.task_id));
  }
  if (ids.recipe_step_id) {
    const { data: step } = await client.from('recipe_steps').select('recipe_id').eq('id', ids.recipe_step_id).maybeSingle();
    if (step?.recipe_id) {
      const { data: recipe } = await client.from('recipes').select('task_id').eq('id', step.recipe_id).maybeSingle();
      if (recipe?.task_id) taskIds.add(String(recipe.task_id));
    }
  }
  if (ids.issue_id) {
    const { data } = await client.from('issues').select('task_id').eq('id', ids.issue_id).maybeSingle();
    if (data?.task_id) taskIds.add(String(data.task_id));
  }
  if (ids.re_evaluation_id) {
    const { data: reEval } = await client.from('issue_re_evaluations').select('issue_id').eq('id', ids.re_evaluation_id).maybeSingle();
    if (reEval?.issue_id) {
      const { data: issue } = await client.from('issues').select('task_id').eq('id', reEval.issue_id).maybeSingle();
      if (issue?.task_id) taskIds.add(String(issue.task_id));
    }
  }

  return [...taskIds];
}

async function getAssemblyIdForComparisonCell(client: ReturnType<typeof getSupabaseClient>, comparisonCellId: string) {
  const { data } = await client
    .from('comparison_matrix_cells')
    .select('assembly_id')
    .eq('id', comparisonCellId)
    .maybeSingle();
  return data?.assembly_id ? String(data.assembly_id) : null;
}

function roleForIndex(index: number) {
  if (index === 0) return 'cell_primary';
  if (index < MAX_INLINE_MEDIA) return 'cell_secondary';
  return 'appendix';
}

function getFileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function replaceFileExtension(fileName: string, extension: string) {
  const normalizedExtension = extension.replace(/^\.+/, '').toLowerCase();
  const base = fileName.replace(/\.[^.]+$/, '');
  return `${base}.${normalizedExtension}`;
}

function isIsoBaseMediaFile(buffer: Buffer) {
  return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
}

function hasValidImageMagic(buffer: Buffer, extension: string) {
  const hex = buffer.subarray(0, 12).toString('hex');
  const ascii = buffer.subarray(0, 12).toString('ascii');
  if (extension === 'jpg' || extension === 'jpeg') return hex.startsWith('ffd8ff');
  if (extension === 'png') return hex.startsWith('89504e470d0a1a0a');
  if (extension === 'gif') return ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a');
  if (extension === 'webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (extension === 'heic' || extension === 'heif') return isIsoBaseMediaFile(buffer);
  return false;
}

function hasValidVideoMagic(buffer: Buffer, extension: string) {
  const hex = buffer.subarray(0, 16).toString('hex');
  if (extension === 'webm') return hex.startsWith('1a45dfa3');
  if (extension === 'mp4' || extension === 'm4v' || extension === 'mov') return isIsoBaseMediaFile(buffer);
  return false;
}

function validateUploadType(file: File, buffer: Buffer) {
  const extension = getFileExtension(file.name);
  const typeSpec = ALLOWED_UPLOAD_TYPES[extension];
  if (!typeSpec) return { ok: false as const, message: '仅支持 jpg、png、gif、webp、heic、mp4、mov、webm 等图片和视频文件' };

  const declaredMime = (file.type || '').toLowerCase();
  if (!typeSpec.mimeTypes.includes(declaredMime)) {
    return { ok: false as const, message: '文件扩展名与Content-Type不匹配' };
  }

  const validMagic = typeSpec.materialType === 'image'
    ? hasValidImageMagic(buffer, extension)
    : hasValidVideoMagic(buffer, extension);
  if (!validMagic) {
    return { ok: false as const, message: '文件内容与声明类型不匹配' };
  }

  return { ok: true as const, materialType: typeSpec.materialType, extension };
}

async function readFilePrefix(file: File, byteCount = 4096) {
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < byteCount) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = byteCount - total;
      const chunk = value.length > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return Buffer.concat(chunks, total);
}

export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const user = await requireUser(request, client);
    if (isAuthResponse(user)) return user;
    const limited = await checkSharedRateLimit(request, {
      scope: 'materials-upload',
      subject: user.id,
      limit: 60,
      windowMs: 60 * 60 * 1000,
    });
    if (limited) return limited;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const record_id = formData.get('record_id') as string | null;
    const task_id = formData.get('task_id') as string | null;
    const recipe_step_id = formData.get('recipe_step_id') as string | null;
    const recipe_library_step_id = formData.get('recipe_library_step_id') as string | null;
    const recipe_id = formData.get('recipe_id') as string | null;
    const issue_id = formData.get('issue_id') as string | null;
    const re_evaluation_id = formData.get('re_evaluation_id') as string | null;
    const comparison_cell_id = formData.get('comparison_cell_id') as string | null;
    const copy_source_file_name = formData.get('copy_source_file_name') as string | null;

    if (!file) {
      return NextResponse.json({ code: 1, message: '缺少文件' }, { status: 400 });
    }

    if (!task_id && !recipe_library_step_id && !issue_id && !re_evaluation_id && !comparison_cell_id) {
      return NextResponse.json({ code: 1, message: '缺少必要关联参数' }, { status: 400 });
    }

    if (recipe_library_step_id && user.role !== 'admin') return forbidden();

    const relatedTaskIds = await getRelatedTaskIds(client, {
      task_id,
      record_id,
      recipe_step_id,
      recipe_id,
      issue_id,
      re_evaluation_id,
    });
    if (!recipe_library_step_id && !comparison_cell_id && relatedTaskIds.length === 0) return forbidden();
    for (const relatedTaskId of relatedTaskIds) {
      if (!(await canAccessTask(client, user, relatedTaskId))) return forbidden();
    }

    let comparisonAssemblyId: string | null = null;
    let mediaDisplayOrder = 0;
    let mediaRole: string | null = null;
    if (comparison_cell_id) {
      comparisonAssemblyId = await getAssemblyIdForComparisonCell(client, comparison_cell_id);
      if (!comparisonAssemblyId || !(await canAccessAssembly(client, user, comparisonAssemblyId))) return forbidden();
      const { data: existingCellMaterials } = await client
        .from('materials')
        .select('id')
        .eq('comparison_cell_id', comparison_cell_id);
      mediaDisplayOrder = Array.isArray(existingCellMaterials) ? existingCellMaterials.length : 0;
      mediaRole = roleForIndex(mediaDisplayOrder);
    }

    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ code: 1, message: '文件大小超过100MB限制' }, { status: 400 });
    }

    const declaredMime = (file.type || '').toLowerCase();
    if (!declaredMime.startsWith('image/') && !declaredMime.startsWith('video/')) {
      return NextResponse.json({ code: 1, message: '仅支持图片和视频文件' }, { status: 400 });
    }

    const isLargeFile = file.size > 5 * 1024 * 1024;
    let filePrefix: Buffer;
    try {
      filePrefix = await readFilePrefix(file);
    } catch (bufErr) {
      console.error('[upload] File header read failed:', bufErr);
      return NextResponse.json({ code: 1, message: `文件读取失败(${(file.size / 1024 / 1024).toFixed(1)}MB)，请重试` }, { status: 500 });
    }

    const uploadType = validateUploadType(file, filePrefix);
    if (!uploadType.ok) {
      return NextResponse.json({ code: 1, message: uploadType.message }, { status: 400 });
    }
    const materialType = uploadType.materialType;

    const { data: existingNamedMaterials } = await client
      .from('materials')
      .select('file_name')
      .order('created_at', { ascending: false })
      .limit(5000);
    const existingFileNames = (existingNamedMaterials || [])
      .map((material: { file_name?: unknown }) => material.file_name)
      .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);
    const generatedFileName = copy_source_file_name
      ? allocateEditedCopyFileName({
        originalFileName: replaceFileExtension(copy_source_file_name, uploadType.extension),
        existingFileNames,
      })
      : allocateMaterialFileName({
        now: new Date(),
        extension: uploadType.extension,
        existingFileNames,
      });
    const folderId = task_id || recipe_library_step_id || issue_id || comparison_cell_id || 'unknown';
    // Store materials locally under public/uploads/materials/[taskId]/ so the
    // GET /api/materials endpoint can serve them directly from the filesystem.
    const localDir = path.join(process.cwd(), 'public', 'uploads', 'materials', folderId);
    fs.mkdirSync(localDir, { recursive: true });
    const storageFileName = path.join(localDir, generatedFileName);

    let fileKey: string | undefined;
    const maxRetries = isLargeFile ? 2 : 0;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(storageFileName, buffer);
        fileKey = `materials/${folderId}/${generatedFileName}`;
        break;
      } catch (uploadErr) {
        console.error(`[upload] local upload attempt ${attempt + 1} failed:`, uploadErr);
        if (attempt === maxRetries) {
          return NextResponse.json({
            code: 1,
            message: `文件上传失败(${(file.size / 1024 / 1024).toFixed(1)}MB)，请检查磁盘空间后重试`,
          }, { status: 500 });
        }
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    if (!fileKey) {
      return NextResponse.json({ code: 1, message: '文件上传失败' }, { status: 500 });
    }

    // Faststart remux for video files: move moov atom to beginning
    // so browsers can load metadata without seeking to end of file.
    if (materialType === 'video') {
      const videoPath = path.join(process.cwd(), 'public', 'uploads', fileKey);
      faststartRemux(videoPath).catch(err =>
        console.warn('[upload] faststart background task failed:', err)
      );
    }

    const { data, error } = await client.from('materials').insert({
      record_id: record_id || null,
      task_id: task_id || relatedTaskIds[0] || null,
      recipe_step_id: recipe_step_id || null,
      recipe_library_step_id: recipe_library_step_id || null,
      recipe_id: recipe_id || null,
      issue_id: issue_id || null,
      re_evaluation_id: re_evaluation_id || null,
      comparison_cell_id: comparison_cell_id || null,
      comparison_assembly_id: comparisonAssemblyId,
      media_display_order: mediaDisplayOrder,
      media_role: mediaRole,
      material_type: materialType,
      file_name: generatedFileName,
      file_path: fileKey,
      file_size: file.size,
      file_url: fileKey,
    }).select().single();

    if (error) {
      console.error('[upload] DB insert failed:', error);
      return NextResponse.json({ code: 1, message: '素材保存失败' }, { status: 500 });
    }

    await writeSecurityAudit(client, {
      request,
      actor: user,
      action: 'material.upload',
      outcome: 'success',
      targetType: 'material',
      targetId: String(data.id),
      metadata: { materialType, fileSize: file.size, storageDriver: process.env.STORAGE_DRIVER || 'local' },
    });

    // Local materials are exposed directly from /uploads/materials/...; no
    // presigned URL needed.
    const accessibleUrl = `/uploads/${fileKey}`;

    return NextResponse.json({ code: 0, message: '上传成功', data: { ...data, file_url: accessibleUrl } });
  } catch (err) {
    console.error('[upload] Unexpected error:', err);
    return NextResponse.json({ code: 1, message: '上传失败' }, { status: 500 });
  }
}
