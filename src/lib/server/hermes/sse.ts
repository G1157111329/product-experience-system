/**
 * Server-Sent Events helper for Hermes conversation streaming (PRD V3.1.2.4 §11.7).
 *
 * Produces a `ReadableStream<Uint8Array>` that emits SSE-formatted frames:
 *
 *   id: <eventId>
 *   event: <type>
 *   data: <json>
 *
 * Features:
 *   • 15s heartbeat ping (keeps proxies / load balancers from closing idle conns)
 *   • Monotonic event ids so clients can resume via Last-Event-ID
 *   • Backpressure-safe: the producer awaits each enqueue
 *   • Clean close on producer completion or consumer cancellation
 */

export type SSEEventType =
  | 'message.delta'
  | 'message.completed'
  | 'tool.started'
  | 'tool.completed'
  | 'tool.failed'
  | 'suggestion.created'
  | 'error'
  | 'ping';

export interface SSEEvent {
  eventId: number;
  type: SSEEventType;
  data: unknown;
}

/** Caller-provided sink used inside `createSSEStream`'s callback. */
export type SSESend = (event: Omit<SSEEvent, 'eventId'>) => void;

const HEARTBEAT_INTERVAL_MS = 15_000;
const encoder = new TextEncoder();

function frame(event: SSEEvent): Uint8Array {
  const json = JSON.stringify(event.data ?? null);
  // Trailing \n\n terminates the frame per the SSE spec.
  return encoder.encode(`id: ${event.eventId}\nevent: ${event.type}\ndata: ${json}\n\n`);
}

/**
 * Create an SSE ReadableStream. The caller drives the producer via `onEvent`,
 * which receives a `send` function. The stream stays open until `onEvent`
 * resolves (or rejects — the error is surfaced as an `error` event then closed).
 *
 * `startEventId` seeds the monotonic counter so a resumed stream continues past
 * the last id the client acknowledged (Last-Event-ID).
 */
export function createSSEStream(
  onEvent: (send: SSESend) => Promise<void>,
  startEventId = 0,
): ReadableStream<Uint8Array> {
  let nextEventId = Math.max(0, Math.floor(startEventId || 0));

  const queue: Uint8Array[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const flush = () => {
    if (!controller || closed) return;
    while (queue.length > 0) {
      // desiredSize < 0 signals the consumer is slow; we still enqueue to avoid
      // losing events, but we stop draining to let backpressure propagate.
      if ((controller.desiredSize ?? 1) < 0 && queue.length > 16) break;
      controller.enqueue(queue.shift()!);
    }
  };

  const send: SSESend = (event) => {
    if (closed) return;
    nextEventId += 1;
    queue.push(frame({ eventId: nextEventId, type: event.type, data: event.data }));
    flush();
  };

  const heartbeat = setInterval(() => {
    if (closed || !controller) return;
    nextEventId += 1;
    controller.enqueue(frame({ eventId: nextEventId, type: 'ping', data: { t: Date.now() } }));
  }, HEARTBEAT_INTERVAL_MS);

  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
      // Run the producer asynchronously; surface failures as an error frame.
      onEvent(send)
        .catch((err) => {
          if (closed) return;
          const message = err instanceof Error ? err.message : 'stream error';
          nextEventId += 1;
          queue.push(
            frame({ eventId: nextEventId, type: 'error', data: { message } }),
          );
          flush();
        })
        .finally(() => {
          // Producer finished — stop the heartbeat and close gracefully.
          clearInterval(heartbeat);
          flush();
          if (!closed) {
            closed = true;
            try {
              controller?.close();
            } catch {
              /* already closed */
            }
          }
        });
    },
    cancel() {
      // Consumer disconnected (e.g. user closed the tab). Stop everything.
      closed = true;
      clearInterval(heartbeat);
    },
  });
}

/** Standard headers for an SSE Response, including idempotent cache-busting. */
export const SSE_RESPONSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // Disable Nagle so small delta frames aren't batched by the TCP stack.
  'X-Accel-Buffering': 'no',
};

/**
 * Parse the Last-Event-ID header (set by the browser on reconnect) into a
 * number. Returns null when absent or unparseable.
 */
export function parseLastEventId(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
