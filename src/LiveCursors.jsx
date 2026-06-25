import { useEffect, useRef, useState } from "react";

const SEND_INTERVAL = 40;

function websocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/realtime`;
}

export function LiveCursors({ profile, onTaskEvent }) {
  const [cursors, setCursors] = useState({});
  const socketRef = useRef(null);
  const onTaskEventRef = useRef(onTaskEvent);
  const lastSentRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    onTaskEventRef.current = onTaskEvent;
  }, [onTaskEvent]);

  useEffect(() => {
    let disposed = false;

    const connect = () => {
      if (disposed) return;

      const socket = new WebSocket(websocketUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        reconnectAttemptRef.current = 0;
        socket.send(JSON.stringify({ type: "join", name: profile.name, color: profile.color }));
      });

      socket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message.type === "welcome") {
          const peers = Object.fromEntries(
            (message.peers || []).map((cursor) => [cursor.id, { ...cursor, seenAt: Date.now() }]),
          );
          setCursors(peers);
          onTaskEventRef.current?.({ type: "tasks:refresh" });
          return;
        }

        if (message.type?.startsWith("task:")) {
          onTaskEventRef.current?.(message);
          return;
        }

        if (message.type === "cursor" && message.cursor?.id) {
          setCursors((current) => ({
            ...current,
            [message.cursor.id]: { ...message.cursor, seenAt: Date.now() },
          }));
          return;
        }

        if (message.type === "leave" && message.id) {
          setCursors((current) => {
            const next = { ...current };
            delete next[message.id];
            return next;
          });
        }
      });

      socket.addEventListener("close", () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed) return;
        reconnectAttemptRef.current += 1;
        const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 10_000);
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      });
    };

    const handlePointerMove = (event) => {
      const socket = socketRef.current;
      const now = Date.now();
      if (!socket || socket.readyState !== WebSocket.OPEN || now - lastSentRef.current < SEND_INTERVAL) {
        return;
      }

      lastSentRef.current = now;
      socket.send(
        JSON.stringify({
          type: "cursor",
          x: event.clientX / window.innerWidth,
          y: event.clientY / window.innerHeight,
        }),
      );
    };

    connect();
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimerRef.current);
      window.removeEventListener("pointermove", handlePointerMove);
      socketRef.current?.close(1000, "Page closed");
    };
  }, [profile.color, profile.name]);

  return (
    <div className="live-cursors" aria-hidden="true">
      {Object.values(cursors).map((cursor) => (
        <div
          className={`live-cursor ${cursor.x > 0.78 ? "near-right" : ""} ${
            cursor.y > 0.86 ? "near-bottom" : ""
          }`}
          key={cursor.id}
          style={{
            "--cursor-color": cursor.color,
            transform: `translate3d(${cursor.x * 100}vw, ${cursor.y * 100}vh, 0)`,
          }}
        >
          <svg viewBox="0 0 24 28">
            <path d="M2 1.5 21 14l-8.5 1.7L8 25.5 2 1.5Z" />
          </svg>
          <span>{cursor.name}</span>
        </div>
      ))}
    </div>
  );
}
