import { normalizeAgentActions, type AgentAction } from '@/lib/agent-actions';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

export type ExternalChatCommand =
  | { kind: 'confirm_plan' }
  | { kind: 'bind_task'; query: string }
  | { kind: 'create_task'; taskName: string }
  | { kind: 'none' };

/** Parse WeChat/WeCom user text into a deterministic external-chat command. */
export function parseExternalChatCommand(content: string): ExternalChatCommand {
  const text = content.trim();
  if (!text) return { kind: 'none' };

  if (/^(确认|执行|确认执行|确认创建|同意执行|OK|ok)([！!。.\s]*)$/u.test(text)) {
    return { kind: 'confirm_plan' };
  }

  const create = text.match(/^(?:新建任务|创建任务|新建体验计划)[:：\s]*(.+)$/u);
  if (create?.[1]) {
    const taskName = create[1].trim().replace(/^["“]|["”]$/g, '');
    if (taskName) return { kind: 'create_task', taskName: taskName.slice(0, 200) };
  }

  const bind = text.match(/^(?:关联任务|切换任务|绑定任务)[:：\s]*(.+)$/u);
  if (bind?.[1]) {
    const query = bind[1].trim().replace(/^["“]|["”]$/g, '');
    if (query) return { kind: 'bind_task', query };
  }

  return { kind: 'none' };
}

/** Extract material UUIDs that the iLink/WeCom gateway embeds after media ingest. */
export function extractInboundMaterialIds(content: string): string[] {
  const section = content.match(/已接收素材\s*ID[:：]\s*([0-9a-f,\-\s]+)/i);
  const source = section?.[1] || content;
  const ids = source.match(UUID_RE) || [];
  return [...new Set(ids.map((id) => id.toLowerCase()))];
}

/** Build a deterministic organize plan for freshly ingested WeChat/iLink media. */
export function buildInboxMaterialOrganizeActions(materialIds: string[]): AgentAction[] {
  return normalizeAgentActions(
    materialIds.slice(0, 8).map((materialId, index) => ({
      id: `inbox-organize-${index + 1}`,
      type: 'material_organize',
      title: '整理微信素材入库',
      description: '将回传素材归入当前体验计划并按上下文命名',
      risk: 'medium',
      idempotency_key: `material_organize:${materialId}`,
      payload: {
        material_id: materialId,
        naming_mode: 'context',
      },
    })),
  );
}

export function summarizeActionPlanResults(results: Array<{ status: string; message: string; type?: string }>) {
  const ok = results.filter((item) => item.status === 'applied' || item.status === 'success').length;
  const failed = results.filter((item) => item.status === 'failed').length;
  const skipped = results.filter((item) => item.status === 'skipped').length;
  if (failed === 0) return `已执行 ${ok} 项操作${skipped ? `，跳过 ${skipped} 项` : ''}。`;
  return `已执行 ${ok} 项，失败 ${failed} 项${skipped ? `，跳过 ${skipped} 项` : ''}。可在平台「AI助手」查看详情。`;
}
