'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Bot, ExternalLink, Minus, Trash2, Wrench } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { HermesChat, type HermesConversation } from './hermes-chat';
import { cn } from '@/lib/utils';

type Position = { x: number; y: number };

export function AgentFloatingAssistant() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const [overDelete, setOverDelete] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const dragStart = useRef<{ pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null);
  const taskId = useMemo(() => pathname.match(/^\/tasks\/([^/]+)/)?.[1] || null, [pathname]);
  const userKey = user?.id || 'anonymous';

  useEffect(() => {
    const hiddenKey = `hermes-floating-hidden:${userKey}`;
    const conversationKey = `hermes-last-conversation:${userKey}:${taskId || 'global'}`;
    setHidden(sessionStorage.getItem(hiddenKey) === '1');
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

  if (!ready || hidden || pathname.startsWith('/agent')) return null;

  const circleStyle = position ? { left: position.x, top: position.y } : { right: 16, bottom: 24 };

  return (
    <>
      {open && (
        <section className="fixed bottom-20 right-4 z-[70] flex h-[520px] w-[min(380px,calc(100vw-1rem))] flex-col overflow-hidden rounded-md border bg-background shadow-xl">
          <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
            <Bot className="h-4 w-4 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">AI助手</span>
            {taskId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="操作当前体验计划"
                aria-label="操作当前体验计划"
                onClick={() => router.push(`/agent?mode=actions&task=${encodeURIComponent(taskId)}`)}
              >
                <Wrench className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="打开会话中心"
              aria-label="打开会话中心"
              onClick={() => router.push(conversationId ? `/agent?conversation=${conversationId}` : '/agent')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="缩小" aria-label="缩小 AI 助手" onClick={() => setOpen(false)}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
          </header>
          <HermesChat
            compact
            conversationId={conversationId}
            taskId={taskId}
            onConversationChange={rememberConversation}
          />
        </section>
      )}

      {!open && (
        <button
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
