'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { stripAssistantReasoning } from '@/lib/assistant-output';
import { AGENT_ACTION_LABELS, type AgentAction } from '@/lib/agent-actions';

export type HermesConversation = {
  id: string;
  title?: string | null;
  taskId?: string | null;
  status?: string;
  updatedAt?: string;
};

export type HermesMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content?: string | null;
  toolCallId?: string | null;
  toolName?: string | null;
  eventSeq?: number;
  createdAt?: string;
};

type HermesChatProps = {
  conversationId?: string | null;
  taskId?: string | null;
  compact?: boolean;
  initialDraft?: string;
  initialDraftVersion?: number;
  onConversationChange?: (conversation: HermesConversation) => void;
};

function sanitizeMessage(message: HermesMessage): HermesMessage {
  return message.role === 'assistant'
    ? { ...message, content: stripAssistantReasoning(message.content) }
    : message;
}

function readTaskActionPlan(message: HermesMessage): { taskId: string; actions: AgentAction[] } | null {
  if (message.role !== 'tool' || message.toolName !== 'task_action_plan' || !message.content) return null;
  try {
    const value = JSON.parse(message.content) as { taskId?: unknown; actions?: unknown };
    if (typeof value.taskId !== 'string' || !Array.isArray(value.actions)) return null;
    return { taskId: value.taskId, actions: value.actions as AgentAction[] };
  } catch {
    return null;
  }
}

type TaskActionPlanResult = {
  taskId: string;
  results: Array<{ id?: string; status?: string; message?: string }>;
  partial: boolean;
};

function readTaskActionPlanResult(message: HermesMessage): TaskActionPlanResult | null {
  if (message.role !== 'tool' || !['task_action_plan_applied', 'task_action_plan_partial'].includes(message.toolName || '') || !message.content) return null;
  try {
    const value = JSON.parse(message.content) as { taskId?: unknown; results?: unknown };
    if (typeof value.taskId !== 'string' || !Array.isArray(value.results)) return null;
    return {
      taskId: value.taskId,
      results: value.results as TaskActionPlanResult['results'],
      partial: message.toolName === 'task_action_plan_partial',
    };
  } catch {
    return null;
  }
}

function mergeMessages(current: HermesMessage[], incoming: HermesMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, sanitizeMessage(message));
  return Array.from(byId.values()).sort((a, b) => Number(a.eventSeq || 0) - Number(b.eventSeq || 0));
}

export function HermesChat({
  conversationId,
  taskId,
  compact = false,
  initialDraft,
  initialDraftVersion,
  onConversationChange,
}: HermesChatProps) {
  const [activeConversationId, setActiveConversationId] = useState(conversationId || null);
  const [messages, setMessages] = useState<HermesMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyingPlanId, setApplyingPlanId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveConversationId(conversationId || null);
    setMessages([]);
  }, [conversationId]);

  useEffect(() => {
    if (initialDraft && initialDraftVersion) setInput(initialDraft);
  }, [initialDraft, initialDraftVersion]);

  const loadMessages = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/agent/conversations/${id}/messages`, { cache: 'no-store' });
      const json = await response.json();
      if (json.code !== 0) throw new Error(json.message || '对话加载失败');
      setMessages(Array.isArray(json.data?.items) ? json.data.items.map(sanitizeMessage) : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '对话加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setLoading(false);
      return;
    }
    void loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    if (!activeConversationId) return;
    const source = new EventSource(`/api/v1/agent/conversations/${activeConversationId}/stream`);
    const handleCompleted = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as {
          messageId: string;
          role: HermesMessage['role'];
          content?: string | null;
          eventSeq?: number;
          toolCallId?: string | null;
          toolName?: string | null;
        };
        setMessages((current) => mergeMessages(current, [{
          id: data.messageId,
          role: data.role,
          content: data.content,
          eventSeq: data.eventSeq,
          toolCallId: data.toolCallId,
          toolName: data.toolName,
        }]));
      } catch {
        // Ignore malformed provider events; the next history refresh remains authoritative.
      }
    };
    source.addEventListener('message.completed', handleCompleted as EventListener);
    source.onopen = () => setError(null);
    source.onerror = () => setError('实时连接已中断，发送消息时会自动恢复。');
    return () => source.close();
  }, [activeConversationId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, sending]);

  const ensureConversation = async () => {
    if (activeConversationId) return activeConversationId;
    const response = await fetch('/api/v1/agent/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: taskId || undefined,
        title: taskId ? '体验任务对话' : '平台助手对话',
      }),
    });
    const json = await response.json();
    if (json.code !== 0 || !json.data?.id) throw new Error(json.message || '无法创建对话');
    const conversation = json.data as HermesConversation;
    setActiveConversationId(conversation.id);
    onConversationChange?.(conversation);
    return conversation.id;
  };

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    setInput('');
    try {
      const id = await ensureConversation();
      const response = await fetch(`/api/v1/agent/conversations/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const json = await response.json();
      if (json.code !== 0) throw new Error(json.message || '发送失败');
      const returned = [json.data?.userMessage, json.data?.assistantMessage, json.data?.actionPlanMessage]
        .filter(Boolean) as HermesMessage[];
      setMessages((current) => mergeMessages(current, returned));
    } catch (sendError) {
      setInput(content);
      setError(sendError instanceof Error ? sendError.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  const applyPlan = async (message: HermesMessage) => {
    const plan = readTaskActionPlan(message);
    if (!plan || plan.actions.length === 0 || applyingPlanId) return;
    setApplyingPlanId(message.id);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${plan.taskId}/agent-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: plan.actions, actionPlanMessageId: message.id }),
      });
      const json = await response.json();
      if (!response.ok && response.status !== 207) throw new Error(json.message || '操作未完成');
      const planStatus = json.data?.actionPlanStatus as HermesMessage['toolName'] | undefined;
      if (!planStatus || !Array.isArray(json.data?.results)) throw new Error(json.message || '操作结果不完整');
      setMessages((current) => current.map((item) => item.id === message.id
        ? { ...item, toolName: planStatus, content: JSON.stringify({ taskId: plan.taskId, results: json.data.results }) }
        : item));
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : '操作执行失败');
    } finally {
      setApplyingPlanId(null);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name} 超过 100MB`);
        const formData = new FormData();
        formData.append('file', file);
        if (taskId) formData.append('task_id', taskId);
        const response = await fetch('/api/materials/upload', { method: 'POST', body: formData });
        const json = await response.json();
        if (json.code !== 0 || !json.data?.id) throw new Error(json.message || `${file.name} 上传失败`);
        uploaded.push(`${file.name}（material_id: ${json.data.id}）`);
      }
      setInput((current) => [current.trim(), `已上传素材：${uploaded.join('、')}`].filter(Boolean).join('\n'));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '素材上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn('flex min-h-0 flex-col bg-background', compact ? 'h-[430px]' : 'h-full')}>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <Sparkles className="mb-3 h-7 w-7 text-primary" />
            <p className="text-sm font-medium">开始一段新的体验协作</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {taskId ? '当前对话会关联这份体验任务。' : '可以整理素材、分析矩阵或继续历史对话。'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => {
              const plan = readTaskActionPlan(message);
              const planResult = readTaskActionPlanResult(message);
              if (plan) return (
                <div key={message.id} className="space-y-2 rounded-md border bg-muted/20 p-2.5">
                  <p className="text-xs font-medium">待确认的平台操作（{plan.actions.length} 项）</p>
                  <div className="space-y-1.5">
                    {plan.actions.map((action) => (
                      <div key={action.id} className="rounded border bg-background px-2 py-1.5 text-xs">
                        <span className="font-medium">{action.title || AGENT_ACTION_LABELS[action.type]}</span>
                        {action.description && <span className="mt-0.5 block text-muted-foreground">{action.description}</span>}
                      </div>
                    ))}
                  </div>
                  <Button size="sm" className="w-full" disabled={applyingPlanId === message.id} onClick={() => void applyPlan(message)}>
                    {applyingPlanId === message.id ? '正在写入…' : '确认并写入当前任务'}
                  </Button>
                </div>
              );
              if (planResult) return (
                <div key={message.id} className="space-y-1.5 rounded-md border bg-muted/20 p-2.5 text-xs">
                  <p className="font-medium">{planResult.partial ? '操作已部分写入' : '操作已写入当前任务'}</p>
                  {planResult.results.map((result, index) => (
                    <p key={`${result.id || 'result'}-${index}`} className={result.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                      {result.message || (result.status === 'failed' ? '操作失败' : '操作完成')}
                    </p>
                  ))}
                </div>
              );
              if (message.role !== 'user' && message.role !== 'assistant') return null;
              return <div key={message.id} className={cn(
                'max-w-[88%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6',
                message.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'border bg-muted/30 text-foreground',
              )}>{message.content || ''}</div>;
            })}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI助手正在处理
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t p-2.5">
        {error && <p className="mb-2 text-xs text-destructive" role="alert">{error}</p>}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(event) => void uploadFiles(Array.from(event.target.files || []))}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            disabled={uploading || sending}
            onClick={() => fileInputRef.current?.click()}
            aria-label="上传图片或视频"
            title="上传图片或视频"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            rows={compact ? 2 : 3}
            placeholder="输入消息"
            aria-label="AI助手对话输入"
            className="min-h-10 resize-none"
          />
          <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => void send()} disabled={!input.trim() || sending} aria-label="发送消息">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
