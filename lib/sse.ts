/* Server-sent events, small enough to read in one go.

   Chosen over WebSockets because the traffic is one-directional — the student
   posts a turn, the tutor streams a reply — and SSE survives what a student on
   a ₹10,000 phone actually has: a proxy, a captive portal, a flaky 4G cell. It
   reconnects by itself and needs no second server.

   Two headers here are not decoration:

     Cache-Control: no-transform    stops a mobile carrier's proxy from
                                    "optimising" the stream by buffering it
                                    into one lump at the end.
     X-Accel-Buffering: no          the same instruction to nginx, which
                                    otherwise holds a proxied response until it
                                    has 4KB or the response closes. Deploy
                                    behind nginx without it and streaming works
                                    perfectly in development and not at all in
                                    production. */

export type Send = (event: string, data: unknown) => void;

export function sse(
  handler: (send: Send, signal: AbortSignal) => Promise<void>,
  options?: { onAbort?: () => void },
) {
  const encoder = new TextEncoder();
  const controller = new AbortController();

  const stream = new ReadableStream({
    async start(streamController) {
      let closed = false;

      const send: Send = (event, data) => {
        if (closed) return;
        try {
          streamController.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* The student navigated away mid-stream. Not an error. */
          closed = true;
        }
      };

      try {
        await handler(send, controller.signal);
      } catch (error) {
        console.error("[sse] handler failed", error);
        send("error", {
          message: "Something went wrong. Try again.",
        });
      } finally {
        closed = true;
        try {
          streamController.close();
        } catch {
          /* Already closed. */
        }
      }
    },

    cancel() {
      /* Fires when the student closes the tab. Abort the model call rather
         than paying for tokens nobody will read. */
      controller.abort();
      options?.onAbort?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/* One-shot: an SSE response that sends a single message and closes. Used where
   the server answers without a model — a safety redirect, a turn limit — so
   the client has one code path for every reply rather than two. */
export function sseOnce(events: { event: string; data: unknown }[]) {
  return sse(async (send) => {
    for (const item of events) send(item.event, item.data);
  });
}
