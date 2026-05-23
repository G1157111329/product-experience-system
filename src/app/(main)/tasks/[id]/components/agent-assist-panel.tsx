'use client';

import { useState } from 'react';
import { Bot, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type AgentAssistPanelProps = {
  taskId: string;
  onClose: () => void;
};

export function AgentAssistPanel({ taskId, onClose }: AgentAssistPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '可以直接问我这次体验任务、素材证据、五感记录、功能效果或报告总结相关的问题。',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

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
        body: JSON.stringify({ messages: nextMessages.slice(-10) }),
      });
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || 'AI回复失败');
        setMessages(nextMessages);
        return;
      }
      setMessages([...nextMessages, { role: 'assistant', content: data.data?.reply || '我暂时没有生成有效回复。' }]);
    } catch {
      toast.error('AI回复失败');
      setMessages(nextMessages);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="rounded-lg border bg-card shadow-sm lg:sticky lg:top-4 lg:w-[320px]">
      <div className="flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">AI助手</h2>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="关闭AI助手">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex h-[min(620px,calc(100dvh-10rem))] flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-3">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm leading-relaxed',
                  message.role === 'user'
                    ? 'ml-8 bg-primary text-primary-foreground'
                    : 'mr-8 border bg-background text-foreground'
                )}
              >
                <p className="whitespace-pre-wrap break-all">{message.content}</p>
              </div>
            ))}
            {sending && (
              <div className="mr-8 flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在思考...
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-3">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="问问这次体验哪里需要补充..."
            rows={3}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                sendMessage();
              }
            }}
          />
          <Button className="mt-2 w-full gap-2" onClick={sendMessage} disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            发送
          </Button>
        </div>
      </div>
    </aside>
  );
}
