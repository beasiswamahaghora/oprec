import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  GripVertical,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { api } from "./api";
import { LiveCursors } from "./LiveCursors";

const columns = [
  { id: "unassigned", title: "Unassigned" },
  { id: "assigned", title: "Assigned" },
  { id: "done", title: "Done" },
];

const team = ["", "Ardhie", "Harvest", "Haykal", "Wafi"];
const PROFILE_KEY = "oprec_cursor_profile_v2";
const cursorColors = ["#135ee8", "#e0528d", "#8a56e8", "#e87924", "#169b72", "#d34242"];
const confettiColors = ["#135ee8", "#e0528d", "#8a56e8", "#f3b51b", "#169b72", "#ef5b3f"];
const confettiPieces = Array.from({ length: 90 }, (_, index) => ({
  id: index,
  color: confettiColors[index % confettiColors.length],
  left: (index * 37) % 100,
  delay: (index % 12) * 0.045,
  duration: 2.1 + (index % 7) * 0.12,
  drift: ((index * 29) % 180) - 90,
  rotation: 360 + (index % 5) * 180,
  size: 6 + (index % 4) * 2,
}));

function getStoredProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY));
    return profile?.name && profile?.color ? profile : null;
  } catch {
    return null;
  }
}

function createProfile(name) {
  return {
    name: name.trim().slice(0, 32),
    color: cursorColors[Math.floor(Math.random() * cursorColors.length)],
  };
}

const initials = (name) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function LockScreen({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onLogin(password);
    } catch (loginError) {
      setError(loginError.message);
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="lock-page">
      <section className="lock-card" aria-label="Teamboard login">
        <img className="app-icon lock-icon" src="/teamboard-icon.png" alt="" />
        <form onSubmit={submit}>
          <label htmlFor="password">Password</label>
          <div className="password-wrap">
            <LockKeyhole size={18} />
            <input
              autoFocus
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your shared password"
            />
          </div>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button login-button" disabled={!password || loading}>
            {loading ? <LoaderCircle className="spin" size={18} /> : "Open board"}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>
      </section>
      <p className="lock-footnote">For Oprec purposes only</p>
    </main>
  );
}

function NameScreen({ onContinue }) {
  const [name, setName] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    onContinue(createProfile(name));
  };

  return (
    <main className="lock-page">
      <section className="lock-card name-card" aria-label="Choose your cursor name">
        <img className="app-icon lock-icon" src="/teamboard-icon.png" alt="" />
        <form onSubmit={submit}>
          <label htmlFor="display-name">Your name</label>
          <div className="password-wrap">
            <UserRound size={18} />
            <input
              autoFocus
              id="display-name"
              type="text"
              autoComplete="name"
              maxLength={32}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your name"
            />
          </div>
          <button className="primary-button login-button" disabled={!name.trim()}>
            Enter board
            <ArrowRight size={18} />
          </button>
        </form>
      </section>
      <p className="lock-footnote">Saved only on this device</p>
    </main>
  );
}

function Confetti() {
  return (
    <div className="confetti-layer" aria-hidden="true">
      {confettiPieces.map((piece) => (
        <i
          key={piece.id}
          style={{
            "--confetti-color": piece.color,
            "--confetti-left": `${piece.left}%`,
            "--confetti-delay": `${piece.delay}s`,
            "--confetti-duration": `${piece.duration}s`,
            "--confetti-drift": `${piece.drift}px`,
            "--confetti-rotation": `${piece.rotation}deg`,
            "--confetti-size": `${piece.size}px`,
          }}
        />
      ))}
    </div>
  );
}

function TaskCard({ task, onAssign, onDelete, dragging, setDragging }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <article
      className={`task-card ${dragging === task.id ? "is-dragging" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(task.id));
        setDragging(task.id);
      }}
      onDragEnd={() => setDragging(null)}
    >
      <div className="task-copy">
        <div className="task-title-row">
          {task.status === "done" && (
            <span className="done-icon" aria-label="Done">
              <Check size={14} strokeWidth={2.5} />
            </span>
          )}
          <h3>{task.title}</h3>
        </div>
        {task.note && <p>{task.note}</p>}
        <div className="assignee" draggable={false}>
          {task.assignee ? (
            <span className="avatar">{initials(task.assignee)}</span>
          ) : (
            <UserRound className="avatar-placeholder" size={15} />
          )}
          <select
            aria-label={`Assignee for ${task.title}`}
            value={task.assignee}
            style={{ width: `${Math.max(58, (task.assignee || "Unassigned").length * 7 + 27)}px` }}
            draggable={false}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onAssign(task, event.target.value)}
          >
            <option value="">Unassigned</option>
            {team.filter(Boolean).map((person) => (
              <option key={person}>{person}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="task-actions">
        <GripVertical className="grip" size={17} aria-hidden="true" />
        {confirming ? (
          <div className="confirm-delete">
            <button aria-label="Cancel delete" onClick={() => setConfirming(false)}>
              <X size={15} />
            </button>
            <button className="danger" aria-label="Confirm delete" onClick={() => onDelete(task.id)}>
              <Check size={15} />
            </button>
          </div>
        ) : (
          <button aria-label={`Delete ${task.title}`} onClick={() => setConfirming(true)}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </article>
  );
}

function Column({ column, tasks, onAssign, onMove, onDelete, dragging, setDragging }) {
  const [over, setOver] = useState(false);

  const drop = (event) => {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData("text/plain"));
    const task = tasks.all.find((item) => item.id === id);
    setOver(false);
    setDragging(null);
    if (task && task.status !== column.id) onMove(task, column.id);
  };

  return (
    <section
      className={`board-column ${over ? "is-over" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOver(false);
      }}
      onDrop={drop}
    >
      <header className="column-header">
        <div>
          <span className={`status-dot ${column.id}`} />
          <h2>{column.title}</h2>
          <span className="task-count">{tasks.current.length}</span>
        </div>
      </header>
      <div className="task-list">
        {tasks.current.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onAssign={onAssign}
            onDelete={onDelete}
            dragging={dragging}
            setDragging={setDragging}
          />
        ))}
        {!tasks.current.length && (
          <div className="empty-column">
            <span>{column.id === "done" ? "Nothing finished yet" : "No tasks here"}</span>
          </div>
        )}
      </div>
      <div className="drop-zone">Drop task here</div>
    </section>
  );
}

function Board({ onLogout, profile }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(null);
  const [confettiRun, setConfettiRun] = useState(0);
  const confettiTimerRef = useRef(null);
  const tasksRef = useRef(tasks);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const refreshTasks = useCallback(() => {
    return api
      .tasks()
      .then((data) => setTasks(data.tasks))
      .catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    refreshTasks().finally(() => setLoading(false));
  }, [refreshTasks]);

  useEffect(
    () => () => {
      window.clearTimeout(confettiTimerRef.current);
    },
    [],
  );

  const celebrate = useCallback(() => {
    window.clearTimeout(confettiTimerRef.current);
    setConfettiRun((current) => current + 1);
    confettiTimerRef.current = window.setTimeout(() => setConfettiRun(0), 3000);
  }, []);

  const handleTaskEvent = useCallback(
    (event) => {
      if (event.type === "tasks:refresh") {
        refreshTasks();
        return;
      }

      if (event.type === "task:deleted") {
        setTasks((current) => current.filter((task) => task.id !== event.id));
        return;
      }

      if (!event.task?.id) return;

      const existing = tasksRef.current.find((task) => task.id === event.task.id);
      if (
        event.type === "task:updated" &&
        event.task.status === "done" &&
        existing?.status !== "done"
      ) {
        celebrate();
      }

      setTasks((current) => {
        if (!current.some((task) => task.id === event.task.id)) return [...current, event.task];
        return current.map((task) => (task.id === event.task.id ? event.task : task));
      });
    },
    [celebrate, refreshTasks],
  );

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [
          column.id,
          tasks.filter((task) => task.status === column.id),
        ]),
      ),
    [tasks],
  );

  const addTask = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const data = await api.createTask({ title, assignee });
      setTasks((current) =>
        current.some((task) => task.id === data.task.id)
          ? current.map((task) => (task.id === data.task.id ? data.task : task))
          : [...current, data.task],
      );
      setTitle("");
      setAssignee("");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const moveTask = async (task, status) => {
    const original = task;
    if (status === "done" && task.status !== "done") celebrate();
    const nextAssignee =
      status === "unassigned" ? "" : task.assignee || team.find(Boolean) || "Team";
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, status, assignee: nextAssignee } : item,
      ),
    );
    try {
      const data = await api.updateTask(task.id, { status, assignee: nextAssignee });
      setTasks((current) => current.map((item) => (item.id === task.id ? data.task : item)));
    } catch (moveError) {
      setTasks((current) => current.map((item) => (item.id === task.id ? original : item)));
      setError(moveError.message);
    }
  };

  const assignTask = async (task, nextAssignee) => {
    const original = task;
    const status = nextAssignee
      ? task.status === "unassigned"
        ? "assigned"
        : task.status
      : "unassigned";

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, status, assignee: nextAssignee } : item,
      ),
    );

    try {
      const data = await api.updateTask(task.id, { status, assignee: nextAssignee });
      setTasks((current) => current.map((item) => (item.id === task.id ? data.task : item)));
    } catch (assignError) {
      setTasks((current) => current.map((item) => (item.id === task.id ? original : item)));
      setError(assignError.message);
    }
  };

  const deleteTask = async (id) => {
    const original = tasks;
    setTasks((current) => current.filter((task) => task.id !== id));
    try {
      await api.deleteTask(id);
    } catch (deleteError) {
      setTasks(original);
      setError(deleteError.message);
    }
  };

  return (
    <div className="app-shell">
      {confettiRun > 0 && <Confetti key={confettiRun} />}
      <LiveCursors profile={profile} onTaskEvent={handleTaskEvent} />
      <header className="topbar">
        <div className="brand">
          <img className="app-icon header-icon" src="/teamboard-icon.png" alt="" />
          <strong>Pusat Arsip &amp; Notifikasi Temuan/Error/Keluhan (jangan disingkat)</strong>
        </div>
        <div className="topbar-meta">
          <span className="current-user">
            <i style={{ background: profile.color }} />
            {profile.name}
          </span>
          <span>Buat oprec #16</span>
          <span className="divider" />
          <LockKeyhole size={17} />
          <button className="logout-button" onClick={onLogout}>
            <LogOut size={17} />
            <span>Log out</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <form className="add-task-form" onSubmit={addTask}>
          <div className="field grow">
            <label htmlFor="title">Task title</label>
            <input
              id="title"
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs to be done?"
            />
          </div>
          <div className="field assignee-field">
            <label htmlFor="assignee">Assign to</label>
            <div className="select-wrap">
              <UserRound size={16} />
              <select
                id="assignee"
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
              >
                <option value="">Unassigned</option>
                {team.filter(Boolean).map((person) => (
                  <option key={person}>{person}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="primary-button add-button" disabled={!title.trim() || saving}>
            {saving ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}
            Add task
          </button>
        </form>

        {error && (
          <div className="board-error" role="alert">
            {error}
            <button onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="loading-board">
            <LoaderCircle className="spin" />
            Loading the board…
          </div>
        ) : (
          <div className="board">
            {columns.map((column) => (
              <Column
                key={column.id}
                column={column}
                tasks={{ current: grouped[column.id], all: tasks }}
                onAssign={assignTask}
                onMove={moveTask}
                onDelete={deleteTask}
                dragging={dragging}
                setDragging={setDragging}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState("checking");
  const [profile, setProfile] = useState(getStoredProfile);

  useEffect(() => {
    api
      .session()
      .then(() => setSession("authenticated"))
      .catch(() => setSession("anonymous"));
  }, []);

  if (session === "checking") {
    return (
      <div className="session-loader">
        <LoaderCircle className="spin" />
      </div>
    );
  }

  if (session === "anonymous") {
    return <LockScreen onLogin={(password) => api.login(password).then(() => setSession("authenticated"))} />;
  }

  if (!profile) {
    return (
      <NameScreen
        onContinue={(nextProfile) => {
          localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
          setProfile(nextProfile);
        }}
      />
    );
  }

  return (
    <Board
      profile={profile}
      onLogout={() =>
        api.logout().finally(() => {
          setSession("anonymous");
        })
      }
    />
  );
}
