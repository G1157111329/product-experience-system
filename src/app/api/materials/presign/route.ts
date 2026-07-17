import { NextRequest, NextResponse } from 'next/server';
import { generatePresignedUrl, localFileExists } from '@/lib/server/storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, canReadReport, getCurrentUser } from '@/lib/server/auth';
import { jsonResponse } from '@/lib/http-json-response';
import { toOpaqueVideoTransportUrl } from '@/lib/video-media-transport';

type ReportMediaScope = { id: string; taskId: string; snapshotId: string };

function mediaAccessUrl(signedUrl: string) {
  return toOpaqueVideoTransportUrl(signedUrl) || signedUrl;
}

async function resolveSharedReport(client: ReturnType<typeof getSupabaseClient>, shareToken: string | null | undefined): Promise<ReportMediaScope | null> {
  if (!shareToken) return null;
  const { data: share } = await client
    .from('report_shares')
    .select('id, report_id, expires_at')
    .eq('share_token', shareToken)
    .maybeSingle();
  if (!share) return null;
  if (share.expires_at && new Date(share.expires_at) < new Date()) return null;

  const { data: report } = await client
    .from('reports')
    .select('id, task_id, snapshot_id, content')
    .eq('id', share.report_id)
    .maybeSingle();
  if (!report) return null;
  return {
    id: String(report.id),
    taskId: String(report.task_id || report.content?.task?.id || ''),
    snapshotId: String(report.snapshot_id || ''),
  };
}

async function resolveReadableReport(
  client: ReturnType<typeof getSupabaseClient>,
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  reportId: string | null | undefined,
): Promise<ReportMediaScope | null> {
  if (!reportId || !(await canReadReport(client, user, reportId))) return null;
  const { data: report } = await client
    .from('reports')
    .select('id, task_id, snapshot_id, content')
    .eq('id', reportId)
    .maybeSingle();
  if (!report) return null;
  return {
    id: String(report.id),
    taskId: String(report.task_id || report.content?.task?.id || ''),
    snapshotId: String(report.snapshot_id || ''),
  };
}

async function isFrozenReportMaterial(
  client: ReturnType<typeof getSupabaseClient>,
  report: ReportMediaScope | null,
  materialId: string,
) {
  if (!report?.snapshotId || !materialId) return false;
  const { data } = await client
    .from('frozen_material_references')
    .select('material_id')
    .eq('snapshot_id', report.snapshotId)
    .eq('material_id', materialId)
    .maybeSingle();
  return Boolean(data);
}

async function findMaterialByPath(client: ReturnType<typeof getSupabaseClient>, path: string) {
  const normalizedPath = path.trim();
  const withoutUploadsPrefix = normalizedPath.startsWith('/uploads/')
    ? normalizedPath.slice('/uploads/'.length)
    : normalizedPath.replace(/^\/+/, '');
  const candidates = [...new Set([
    normalizedPath,
    withoutUploadsPrefix,
    withoutUploadsPrefix ? `/uploads/${withoutUploadsPrefix}` : '',
  ].filter(Boolean))];

  const { data: byFilePath } = await client
    .from('materials')
    .select('id, file_path, file_url, task_id, recipe_library_step_id')
    .in('file_path', candidates)
    .limit(1)
    .maybeSingle();
  if (byFilePath) return byFilePath;

  const { data: byFileUrl } = await client
    .from('materials')
    .select('id, file_path, file_url, task_id, recipe_library_step_id')
    .in('file_url', candidates)
    .limit(1)
    .maybeSingle();
  return byFileUrl;
}

export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const user = await getCurrentUser(request, client);

    const body = await request.json();
    const { paths, file_paths, report_id, share_token } = body as {
      paths?: string[];
      file_paths?: string[];
      report_id?: string;
      share_token?: string;
    };
    const requestedPaths = Array.isArray(paths) ? paths : file_paths;
    const sharedReport = user ? null : await resolveSharedReport(client, share_token);
    const readableReport = user ? await resolveReadableReport(client, user, report_id) : null;

    // local + public access 模式下，素材通过 /uploads/ 静态目录公开访问，无需鉴权
    // 这样分享页（未登录）也能正常加载素材，避免裂图。
    // 灰度发布: 仅当该路径在本地真实存在时才跳过鉴权;S3 上的新文件仍需鉴权后签名。
    const isLocalPublicMode = process.env.LOCAL_UPLOAD_PUBLIC_ACCESS !== 'protected'
      && process.env.STORAGE_DRIVER !== 's3';
    if (!isLocalPublicMode) {
      if (!user && !sharedReport) {
        return NextResponse.json({ code: 1, message: '未登录' }, { status: 401 });
      }
    }

    if (!requestedPaths || !Array.isArray(requestedPaths) || requestedPaths.length === 0) {
      return NextResponse.json({ code: 1, message: 'paths 参数必填' }, { status: 400 });
    }

    const limitedPaths = [...new Set(requestedPaths.filter((path) => typeof path === 'string' && path.trim()))].slice(0, 50);
    const urlMap: Record<string, string> = {};

    for (const path of limitedPaths) {
      // local + public 模式下，若文件确实在本地静态目录存在，直接生成公开 URL 跳过鉴权；
      // 否则（灰度发布时新上传到 S3 的文件）走鉴权分支。
      if (isLocalPublicMode) {
        const existsLocally = await localFileExists(path);
        if (existsLocally) {
          try {
            urlMap[path] = mediaAccessUrl(await generatePresignedUrl({ key: path, expireTime: 30 * 60 }));
          } catch (err) {
            console.error('[presign] Failed for path:', path, err);
          }
          continue;
        }
        // Fall through to authenticated branch for S3-only files.
        if (!user && !sharedReport) {
          continue; // cannot auth → skip this path
        }
      }

      const material = await findMaterialByPath(client, path);
      if (!material) continue;

      const reportScope = user ? readableReport : sharedReport;
      const frozenByReport = await isFrozenReportMaterial(client, reportScope, String(material.id || ''));
      const canAccess = user
        ? user.role === 'admin'
          || Boolean(material.task_id && await canAccessTask(client, user, String(material.task_id)))
          || Boolean(readableReport?.taskId && material.task_id && String(material.task_id) === readableReport.taskId)
          || frozenByReport
        : Boolean(
          frozenByReport
          || (sharedReport?.taskId && material.task_id && String(material.task_id) === sharedReport.taskId)
        );
      if (!canAccess) continue;

      try {
        urlMap[path] = mediaAccessUrl(await generatePresignedUrl({
          key: path,
          expireTime: 30 * 60,
        }));
      } catch (err) {
        console.error('[presign] Failed for path:', path, err);
      }
    }

    return jsonResponse({ code: 0, data: urlMap });
  } catch (error) {
    console.error('[presign] Error:', error);
    return NextResponse.json(
      { code: 1, message: '生成签名URL失败' },
      { status: 500 },
    );
  }
}
