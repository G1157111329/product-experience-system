'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Bot, ExternalLink, Minus, Trash2, WandSparkles } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { HermesChat, type HermesConversation } from './hermes-chat';
import {
  getTaskAiEntryPrompt,
  TASK_AI_ENTRY_OPTIONS,
  type TaskAiEntryId,
} from '@/lib/task-ai-entry';
import { cn } from '@/lib/utils';

type Position = { x: number; y: number };
type PanelDragStart = { pointerX: number; pointerY: number; x: number; y: number };

export function AgentFloatingAssistant() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [panelPosition, setPanelPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const [overDelete, setOverDelete] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [taskEntry, setTaskEntry] = useState<{ id: TaskAiEntryId; version: number } | null>(null);
  const dragStart = useRef<{ pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null);
  const panelDragStart = useRef<PanelDragStart | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const taskId = useMemo(() => pathname.match(/^\/tasks\/([^/]+)/)?.[1] || null, [pathname]);
  const userKey = user?.id || 'anonymous';

  useEffect(() => {
    const hiddenKey = `hermes-floating-hidden:${userKey}`;
    const conversationKey = `hermes-last-conversation:${userKey}:${taskId || 'global'}`;
    setHidden(sessionStorage.getItem(hiddenKey) === '1');
    setTaskEntry(null);
    const remembered = localStorage.getItem(conversationKey);
    setConversationId(remembered);
    if (taskId) {
      void fetch(`/api/v1/agent/conversations?task_id=${encodeURIComponent(taskId)}`, { cache: 'no-store' })
        .then((response) => response.json())
        .then((json) => {
          const latest = Array.isArray(json.data?.items) ? json.data.items[0] : null;
          if (latest?.id) {
            setConversationId(latest.id);
            localStorage.setItem(conversationKey, latest.id);
          } else if (!remembered) {
            setConversationId(null);
          }
        })
        .catch(() => undefined);
    }
    setReady(true);
  }, [taskId, userKey]);

  const rememberConversation = (conversation: HermesConversation) => {
    setConversationId(conversation.id);
    localStorage.setItem(`hermes-last-conversation:${userKey}:${taskId || 'global'}`, conversation.id);
  };

  const defaultPosition = () => ({
    x: Math.max(12, window.innerWidth - 68),
    y: Math.max(72, window.innerHeight - 88),
  });

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = position || defaultPosition();
    setPosition(current);
    dragStart.current = { pointerX: event.clientX, pointerY: event.clientY, x: current.x, y: current.y, moved: false };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const dx = event.clientX - start.pointerX;
    const dy = event.clientY - start.pointerY;
    if (Math.abs(dx) + Math.abs(dy) > 5) start.moved = true;
    setPosition({
      x: Math.min(window.innerWidth - 56, Math.max(8, start.x + dx)),
      y: Math.min(window.innerHeight - 72, Math.max(64, start.y + dy)),
    });
    setOverDelete(event.clientY > window.innerHeight - 120 && Math.abs(event.clientX - window.innerWidth / 2) < 110);
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const moved = dragStart.current?.moved;
    if (overDelete) {
      sessionStorage.setItem(`hermes-floating-hidden:${userKey}`, '1');
      setHidden(true);
      setOpen(false);
    } else if (!moved) {
      setOpen(true);
    }
    dragStart.current = null;
    setDragging(false);
    setOverDelete(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const startPanelDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select, [role="button"]')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    const current = panelPosition || {
      x: rect?.left ?? Math.max(8, (window.innerWidth - 380) / 2),
      y: rect?.top ?? Math.max(8, (window.innerHeight - 520) / 2),
    };
    setPanelPosition(current);
    panelDragStart.current = { pointerX: event.clientX, pointerY: event.clientY, ...current };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePanelDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const start = panelDragStart.current;
    if (!start) return;
    const panel = panelRef.current;
    const width = panel?.offsetWidth ?? 380;
    const height = panel?.offsetHeight ?? 520;
    setPanelPosition({
      x: Math.min(window.innerWidth - width - 8, Math.max(8, start.x + event.clientX - start.pointerX)),
      y: Math.min(window.innerHeight - height - 8, Math.max(8, start.y + event.clientY - start.pointerY)),
    });
  };

  const endPanelDrag = (event: ReactPointerEvent<HTMLElement>) => {
    panelDragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (!ready || hidden || pathname.startsWith('/agent')) return null;

  const circleStyle = position ? { left: position.x, top: position.y } : { right: 16, bottom: 24 };
  const dialogStyle = panelPosition
    ? { left: panelPosition.x, top: panelPosition.y, transform: 'none' }
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  const selectedTaskPrompt = taskEntry ? getTaskAiEntryPrompt(taskEntry.id) : undefined;

  return (
    <>
      {open && (
        <section
          ref={panelRef}
          data-testid="agent-floating-assistant-dialog"
          className="fixed z-[70] flex h-[520px] w-[min(380px,calc(100vw-1rem))] flex-col overflow-hidden rounded-md border bg-background shadow-xl"
          style={dialogStyle}
        >
          <header
            data-testid="agent-floating-assistant-drag-handle"
            className="flex h-11 shrink-0 touch-none select-none items-center gap-2 border-b px-3 cursor-grab"
            onPointerDown={startPanelDrag}
            onPointerMove={movePanelDrag}
            onPointerUp={endPanelDrag}
            onPointerCancel={endPanelDrag}
          >
            <Bot className="h-4 w-4 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">AI助手</span>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              title="打开会话中心"
              aria-label="打开会话中心"
              onClick={() => router.push(conversationId ? `/agent?conversation=${conversationId}` : '/agent')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="min-h-11 min-w-11" title="缩小" aria-label="缩小 AI 助手" onClick={() => setOpen(false)}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
          </header>
          {taskId ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b bg-muted/20 px-3 py-2.5" data-testid="task-ai-entry-choices">
                <p className="text-xs font-medium">默认探索方向</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">点击后立即生成探索草案；涉及写入任务的数据操作仍需确认。</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {TASK_AI_ENTRY_OPTIONS.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={taskEntry?.id === entry.id}
                      className={cn(
                        'flex min-w-0 items-start gap-2 rounded-md border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        taskEntry?.id === entry.id && 'border-primary bg-primary/10',
                      )}
                      onClick={() => setTaskEntry({ id: entry.id, version: Date.now() })}
                    >
                      <WandSparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">{entry.label}</span>
                        <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{entry.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <HermesChat
                  compact
                  conversationId={conversationId}
                  taskId={taskId}
                  initialDraft={selectedTaskPrompt}
                  initialDraftVersion={taskEntry?.version}
                  onConversationChange={rememberConversation}
                />
              </div>
            </div>
          ) : (
            <HermesChat
              compact
              conversationId={conversationId}
              taskId={taskId}
              onConversationChange={rememberConversation}
            />
          )}
        </section>
      )}

      {!open && (
        <button
          data-testid="task-floating-assistant"
          type="button"
          className={cn(
            'fixed z-[70] flex h-12 w-12 touch-none items-center justify-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-lg transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dragging ? 'cursor-grabbing shadow-xl' : 'cursor-grab hover:shadow-xl',
          )}
          style={circleStyle}
          aria-label="打开并拖动 AI 助手"
          title="AI 助手"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        >
          <Bot className="h-5 w-5" />
        </button>
      )}

      {dragging && (
        <div className={cn(
          'pointer-events-none fixed bottom-4 left-1/2 z-[69] flex h-16 w-44 -translate-x-1/2 items-center justify-center gap-2 rounded-md border text-sm shadow-lg',
          overDelete ? 'border-destructive bg-destructive text-destructive-foreground' : 'bg-background text-muted-foreground',
        )}>
          <Trash2 className="h-4 w-4" />
          本次登录隐藏
        </div>
      )}
    </>
  );
}
