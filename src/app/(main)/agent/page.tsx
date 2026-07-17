'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, Loader2, MessageCircle, MessageSquarePlus, Wrench } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/app';
import { Button } from '@/components/ui/button';
import { HermesChat, type HermesConversation } from '@/components/agent/hermes-chat';
import { cn } from '@/lib/utils';

type TaskOption = { id: string; task_name: string; product_model?: string | null };

export default function AgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('conversation');
  const mode = searchParams.get('mode') === 'actions' ? 'actions' : 'chat';
  const selectedTaskId = searchParams.get('task') || '';
  const [conversations, setConversations] = useState<HermesConversation[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [response, taskResponse] = await Promise.all([
        fetch('/api/v1/agent/conversations', { cache: 'no-store' }),
        fetch('/api/tasks?pageSize=100', { cache: 'no-store' }),
      ]);
      const [json, taskJson] = await Promise.all([response.json(), taskResponse.json()]);
      if (json.code !== 0) throw new Error(json.message || '历史对话加载失败');
      setConversations(Array.isArray(json.data?.items) ? json.data.items : []);
      if (taskJson.code === 0) {
        setTasks(Array.isArray(taskJson.data?.list) ? taskJson.data.list : []);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '历史对话加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleConversationCreated = (conversation: HermesConversation) => {
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    router.replace(`/agent?conversation=${conversation.id}`);
  };

  return (
    <PageShell size="wide" className="h-full min-h-[calc(100vh-3.5rem)] py-3 lg:min-h-screen lg:py-4">
      <div className="grid h-[calc(100vh-5rem)] min-h-[540px] overflow-hidden rounded-md border bg-background lg:h-[calc(100vh-2rem)] lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r">
          <div className="flex h-12 items-center gap-2 border-b px-3">
            <Bot className="h-4 w-4 text-primary" />
            <h1 className="flex-1 text-sm font-semibold">AI助手</h1>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="新建对话" aria-label="新建对话" onClick={() => router.replace('/agent')}>
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-44 min-h-0 overflow-y-auto p-2 lg:max-h-none lg:flex-1">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : error ? (
              <div className="space-y-2 p-2 text-xs text-destructive">
                <p>{error}</p>
                <Button variant="outline" size="sm" onClick={() => void load()}>重试</Button>
              </div>
            ) : conversations.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">暂无历史对话</p>
            ) : (
              <div className="space-y-1">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => router.replace(`/agent?conversation=${conversation.id}`)}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-left transition-colors',
                      selectedId === conversation.id ? 'bg-primary/10 text-foreground' : 'hover:bg-muted',
                    )}
                  >
                    <span className="block truncate text-sm font-medium">{conversation.title || '未命名对话'}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {conversation.taskId ? '体验任务对话' : '平台对话'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          <div className="flex min-h-12 flex-wrap items-center gap-2 border-b px-3 py-2">
            <div className="flex rounded-md border p-0.5" aria-label="AI助手模式">
              <button
                type="button"
                className={cn('flex h-8 items-center gap-1.5 rounded px-3 text-sm', mode === 'chat' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                onClick={() => router.replace(selectedId ? `/agent?conversation=${selectedId}` : '/agent')}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                对话
              </button>
              <button
                type="button"
                className={cn('flex h-8 items-center gap-1.5 rounded px-3 text-sm', mode === 'actions' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                onClick={() => router.replace(selectedTaskId ? `/agent?mode=actions&task=${selectedTaskId}` : '/agent?mode=actions')}
              >
                <Wrench className="h-3.5 w-3.5" />
                平台操作
              </button>
            </div>
            {mode === 'actions' && (
              <label className="ml-auto flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                体验计划
                <select
                  aria-label="选择体验计划"
                  className="h-8 max-w-[280px] rounded-md border bg-background px-2 text-sm text-foreground"
                  value={selectedTaskId}
                  onChange={(event) => router.replace(`/agent?mode=actions&task=${encodeURIComponent(event.target.value)}`)}
                >
                  <option value="">请选择</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>{task.task_name}{task.product_model ? ` · ${task.product_model}` : ''}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="min-h-0 flex-1">
            {mode === 'actions' ? (
              selectedTaskId ? (
                <div className="h-full overflow-y-auto p-3">
                  <HermesChat taskId={selectedTaskId} onConversationChange={handleConversationCreated} />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">请选择要操作的体验计划</div>
              )
            ) : (
              <HermesChat
                conversationId={selectedId}
                taskId={conversations.find((conversation) => conversation.id === selectedId)?.taskId || null}
                onConversationChange={handleConversationCreated}
              />
            )}
          </div>
        </main>
      </div>
    </PageShell>
  );
}
