import { DurableObject } from "cloudflare:workers";

const cleanName = (value) => (typeof value === "string" ? value.trim().slice(0, 32) : "");
const cleanColor = (value) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#135ee8";
const cleanCoordinate = (value) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;

export default {
  async fetch(request, env) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    return env.CURSOR_ROOM.getByName("oprec").fetch(request);
  },
};

export class CursorRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      if (request.method !== "POST") {
        return new Response("Method not allowed.", { status: 405 });
      }

      let event;
      try {
        event = await request.json();
      } catch {
        return new Response("Invalid JSON.", { status: 400 });
      }

      if (!["task:created", "task:updated", "task:deleted"].includes(event?.type)) {
        return new Response("Invalid task event.", { status: 400 });
      }

      this.broadcast(event);
      return new Response(null, { status: 204 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      id: crypto.randomUUID(),
      name: "",
      color: "#135ee8",
      x: null,
      y: null,
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, rawMessage) {
    let message;
    try {
      message = JSON.parse(typeof rawMessage === "string" ? rawMessage : "");
    } catch {
      return;
    }

    const current = ws.deserializeAttachment();
    if (!current?.id) return;

    if (message.type === "join") {
      const next = {
        ...current,
        name: cleanName(message.name),
        color: cleanColor(message.color),
      };
      if (!next.name) return;

      ws.serializeAttachment(next);
      const peers = this.ctx
        .getWebSockets()
        .filter((peer) => peer !== ws)
        .map((peer) => peer.deserializeAttachment())
        .filter((peer) => peer?.name && peer.x !== null && peer.y !== null);

      ws.send(JSON.stringify({ type: "welcome", id: next.id, peers }));
      return;
    }

    if (message.type !== "cursor" || !current.name) return;

    const x = cleanCoordinate(message.x);
    const y = cleanCoordinate(message.y);
    if (x === null || y === null) return;

    const next = { ...current, x, y };
    ws.serializeAttachment(next);
    this.broadcast({ type: "cursor", cursor: next }, ws);
  }

  webSocketClose(ws) {
    const current = ws.deserializeAttachment();
    if (current?.id) this.broadcast({ type: "leave", id: current.id }, ws);
  }

  webSocketError(ws) {
    const current = ws.deserializeAttachment();
    if (current?.id) this.broadcast({ type: "leave", id: current.id }, ws);
  }

  broadcast(message, except) {
    const payload = JSON.stringify(message);
    for (const peer of this.ctx.getWebSockets()) {
      if (peer === except) continue;
      try {
        peer.send(payload);
      } catch {
        // A closing socket will be removed by the runtime.
      }
    }
  }
}
