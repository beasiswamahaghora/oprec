const COOKIE_NAME = "teamboard_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const allowedStatuses = new Set(["unassigned", "assigned", "done"]);

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

const bytesToHex = (bytes) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function sha256(value) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function readCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

async function createSession(secret) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = String(expires);
  return `${payload}.${await hmac(payload, secret)}`;
}

async function isAuthenticated(request, env) {
  if (!env.SESSION_SECRET) return false;
  const value = readCookie(request, COOKIE_NAME);
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(expires, env.SESSION_SECRET);
  return constantTimeEqual(signature, expected);
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function broadcastTaskEvent(env, event) {
  try {
    await env.CURSOR_ROOM.getByName("oprec").fetch(
      new Request("https://oprec.internal/task-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      }),
    );
  } catch {
    // D1 remains authoritative; reconnecting clients refresh the full task list.
  }
}

async function handleLogin(request, env) {
  if (!env.TEAM_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: "Server secrets are not configured." }, 503);
  }

  const body = await readBody(request);
  const submittedHash = bytesToHex(await sha256(body?.password || ""));
  const expectedHash = bytesToHex(await sha256(env.TEAM_PASSWORD));

  if (!constantTimeEqual(submittedHash, expectedHash)) {
    return json({ error: "That password is not correct." }, 401);
  }

  const session = await createSession(env.SESSION_SECRET);
  return json(
    { ok: true },
    200,
    {
      "set-cookie": `${COOKIE_NAME}=${encodeURIComponent(session)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE}`,
    },
  );
}

function handleLogout() {
  return json(
    { ok: true },
    200,
    {
      "set-cookie": `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
    },
  );
}

async function listTasks(env) {
  const result = await env.DB.prepare(
    `SELECT id, title, note, assignee, status, position, created_at, updated_at
     FROM tasks
     ORDER BY status, position, created_at`,
  ).all();
  return json({ tasks: result.results || [] });
}

async function createTask(request, env) {
  const body = await readBody(request);
  const title = cleanText(body?.title, 160);
  const note = cleanText(body?.note, 500);
  const assignee = cleanText(body?.assignee, 80);
  const status = assignee ? "assigned" : "unassigned";

  if (!title) return json({ error: "Task title is required." }, 400);

  const positionRow = await env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM tasks WHERE status = ?",
  )
    .bind(status)
    .first();

  const result = await env.DB.prepare(
    `INSERT INTO tasks (title, note, assignee, status, position)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id, title, note, assignee, status, position, created_at, updated_at`,
  )
    .bind(title, note, assignee, status, positionRow?.next_position ?? 0)
    .first();

  await broadcastTaskEvent(env, { type: "task:created", task: result });
  return json({ task: result }, 201);
}

async function updateTask(request, env, id) {
  const body = await readBody(request);
  const status = cleanText(body?.status, 20);
  const assignee = cleanText(body?.assignee, 80);
  if (!allowedStatuses.has(status)) return json({ error: "Invalid task status." }, 400);

  const current = await env.DB.prepare("SELECT id FROM tasks WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Task not found." }, 404);

  const positionRow = await env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM tasks WHERE status = ?",
  )
    .bind(status)
    .first();

  const task = await env.DB.prepare(
    `UPDATE tasks
     SET status = ?, assignee = ?, position = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     RETURNING id, title, note, assignee, status, position, created_at, updated_at`,
  )
    .bind(status, status === "unassigned" ? "" : assignee, positionRow?.next_position ?? 0, id)
    .first();

  await broadcastTaskEvent(env, { type: "task:updated", task });
  return json({ task });
}

async function deleteTask(env, id) {
  const result = await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
  if (!result.meta?.changes) return json({ error: "Task not found." }, 404);
  await broadcastTaskEvent(env, { type: "task:deleted", id });
  return json({ ok: true });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const path = `/${Array.isArray(params.path) ? params.path.join("/") : params.path || ""}`;

  if (path === "/login" && method === "POST") return handleLogin(request, env);
  if (path === "/logout" && method === "POST") return handleLogout();

  if (!(await isAuthenticated(request, env))) {
    return json({ error: "Authentication required." }, 401);
  }

  if (path === "/session" && method === "GET") return json({ authenticated: true });
  if (path === "/realtime" && method === "GET") {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "WebSocket upgrade required." }, 426);
    }
    return env.CURSOR_ROOM.getByName("oprec").fetch(request);
  }
  if (path === "/tasks" && method === "GET") return listTasks(env);
  if (path === "/tasks" && method === "POST") return createTask(request, env);

  const taskMatch = path.match(/^\/tasks\/(\d+)$/);
  if (taskMatch && method === "PATCH") return updateTask(request, env, Number(taskMatch[1]));
  if (taskMatch && method === "DELETE") return deleteTask(env, Number(taskMatch[1]));

  return json({ error: "Not found." }, 404);
}
