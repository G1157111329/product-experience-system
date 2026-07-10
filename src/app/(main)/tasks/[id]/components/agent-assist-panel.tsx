'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Loader2, Paperclip, Play, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  AGENT_ACTION_LABELS,
  AGENT_ACTION_RISK_LABELS,
  summarizeAgentAction,
  type AgentAction,
  type AgentActionResult,
} from '@/lib/agent-actions';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  actions?: AgentAction[];
  results?: AgentActionResult[];
  applied?: boolean;
};

type AgentAssistPanelProps = {
  taskId: string;
  onClose: () => void;
  embedded?: boolean;
};

type AgentChatResponse = {
  code: number;
  message?: string;
  data?: {
    reply?: string;
    actions?: AgentAction[];
  };
};

type AgentApplyResponse = {
  code: number;
  message?: string;
  data?: {
    results?: AgentActionResult[];
  };
};

export function AgentAssistPanel({ taskId, onClose, embedded = false }: AgentAssistPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '我是这个任务的AI助手。你可以让我新增或修改体验计划、食谱、素材关联、矩阵、五感记录、标准和问题点；我会先生成操作清单，确认后再写入数据。删除与设置操作不会执行。',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || sending) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .map((message) => ({ role: message.role, content: message.content }))
            .slice(-10),
        }),
      });
      const data = await res.json() as AgentChatResponse;
      if (data.code !== 0) {
        toast.error(data.message || 'AI 回复失败');
        setMessages(nextMessages);
        return;
      }
      const reply = data.data?.reply?.trim() || '我没有生成有效回复，请换一种描述再试。';
      const actions = Array.isArray(data.data?.actions) ? data.data.actions : [];
      setMessages([...nextMessages, { role: 'assistant', content: reply, actions }]);
    } catch {
      toast.error('AI 回复失败');
      setMessages(nextMessages);
    } finally {
      setSending(false);
    }
  };

  const applyActions = async (messageIndex: number, actions: AgentAction[]) => {
    if (actions.length === 0 || applyingIndex !== null) return;
    setApplyingIndex(messageIndex);
    try {
      const res = await fetch(`/api/tasks/${taskId}/agent-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      });
      const data = await res.json() as AgentApplyResponse;
      const results = data.data?.results || [];
      setMessages((current) => current.map((message, index) => (
        index === messageIndex
          ? { ...message, results, applied: data.code === 0 }
          : message
      )));
      if (data.code === 0) {
        toast.success(data.message || 'AI 动作已执行');
        window.setTimeout(() => window.location.reload(), 500);
      } else {
        toast.error(data.message || '部分 AI 动作执行失败');
      }
    } catch {
      toast.error('AI 动作执行失败');
    } finally {
      setApplyingIndex(null);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name} 超过 100MB`);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('task_id', taskId);
        const response = await fetch('/api/materials/upload', { method: 'POST', body: formData });
        const json = await response.json();
        if (json.code !== 0 || !json.data?.id) throw new Error(json.message || `${file.name} 上传失败`);
        uploaded.push(`${file.name}（material_id: ${json.data.id}）`);
      }
      setInput((current) => [current.trim(), `已上传素材：${uploaded.join('、')}`].filter(Boolean).join('\n'));
      toast.success(`已上传 ${uploaded.length} 个素材`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '素材上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <aside className="rounded-lg border bg-card shadow-sm lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">AI助手平台操作</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">先生成操作清单，确认后写入当前任务。</p>
        </div>
        {!embedded && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="关闭AI助手">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex max-h-[min(700px,calc(90dvh-4rem))] min-h-0 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-3">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className="space-y-2">
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm leading-relaxed',
                    message.role === 'user'
                      ? 'ml-8 bg-primary text-primary-foreground'
                      : 'mr-8 border bg-background text-foreground'
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </div>
                {message.role === 'assistant' && message.actions && message.actions.length > 0 && (
                  <div className="mr-8 space-y-2 rounded-lg border bg-muted/20 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{message.actions.length} 项待执行</Badge>
                        {message.actions.some((action) => action.risk === 'high') && (
                          <Badge variant="destructive">含高风险</Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={applyingIndex !== null || message.applied}
                        onClick={() => void applyActions(index, message.actions || [])}
                      >
                        {applyingIndex === index ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        {message.applied ? '已应用' : '应用这些操作'}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {message.actions.map((action) => (
                        <div key={action.id} className="rounded-md border bg-background p-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">{action.title || AGENT_ACTION_LABELS[action.type]}</span>
                                <Badge variant={action.risk === 'high' ? 'destructive' : 'outline'}>
                                  {AGENT_ACTION_RISK_LABELS[action.risk]}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {action.description || summarizeAgentAction(action)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {message.results && message.results.length > 0 && (
                      <div className="space-y-1 border-t pt-2">
                        {message.results.map((result) => (
                          <div key={result.id} className="flex items-center gap-2 text-xs">
                            <CheckCircle2 className={cn('h-3.5 w-3.5', result.status === 'applied' ? 'text-emerald-600' : 'text-destructive')} />
                            <span className={cn(result.status === 'applied' ? 'text-muted-foreground' : 'text-destructive')}>
                              {result.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="mr-8 flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在生成操作清单...
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(event) => void uploadFiles(Array.from(event.target.files || []))}
          />
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="例如：新增豆浆食谱步骤；给对比矩阵添加 A/B 对象；把已上传素材绑定到问题点。"
            rows={3}
          />
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={uploading || sending}
              onClick={() => fileInputRef.current?.click()}
              aria-label="上传图片或视频到当前体验计划"
              title="上传图片或视频"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
            <Button className="flex-1 gap-2" onClick={sendMessage} disabled={sending || !input.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              发送给AI助手
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
