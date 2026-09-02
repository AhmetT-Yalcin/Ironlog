import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ChevronLeft, ChevronDown, ChevronRight, Plus, Check, X, Flame,
  Dumbbell, CalendarDays, TrendingUp, Trash2, Copy, HelpCircle,
  ListChecks, Home, BarChart3, Minus, Trophy, Repeat, Activity
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

/* ---------------- date helpers ---------------- */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfWeek(d) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), diff);
}
function fmtLong(iso) {
  const d = parseISO(iso);
  return `${WEEKDAYS[(d.getDay() + 6) % 7]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function slug(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const TODAY = new Date();
const TODAY_ISO = toISO(TODAY);

const EXERCISE_LIBRARY = [
  "Barbell Back Squat", "Front Squat", "Hack Squat", "Deadlift", "Romanian Deadlift",
  "Bench Press", "Incline Bench Press", "Pec Fly",
  "Overhead Press", "Shoulder Press", "Dumbbell Shoulder Press", "Lateral Raises",
  "Barbell Row", "Cable Row", "Lat Pulldown", "Pull-ups", "Chin-Up",
  "Leg Press", "Leg Curl", "Leg Extension", "Walking Lunge", "Hip Thrust",
  "Biceps Curl", "Hammer Curl", "Triceps Pushdown", "Skull Crusher",
  "Face Pull", "Calf Raise", "Plank"
];

const EFFORT_LEVELS = [
  { v: 0, label: "Not set", color: "var(--line-2)" },
  { v: 1, label: "Easy", color: "#4ADE80" },
  { v: 2, label: "Moderate", color: "#E8A33D" },
  { v: 3, label: "Hard", color: "#FB923C" },
  { v: 4, label: "Max", color: "#F0554B" },
];

function mkEx(name, sets = 3, reps = "8-12") {
  return { id: slug(name), name, targetSets: sets, targetReps: reps };
}

const DEFAULT_TEMPLATES = [
  {
    id: "seed-push",
    name: "Push Day",
    exercises: [
      mkEx("Bench Press"), mkEx("Pec Fly"), mkEx("Shoulder Press"),
      mkEx("Lateral Raises"), mkEx("Biceps Curl"), mkEx("Hammer Curl"),
    ],
  },
  {
    id: "seed-pull",
    name: "Pull Day",
    exercises: [
      mkEx("Pull-ups"), mkEx("Lat Pulldown"), mkEx("Cable Row"), mkEx("Triceps Pushdown"),
    ],
  },
  {
    id: "seed-legs",
    name: "Leg Day",
    exercises: [
      mkEx("Hack Squat"), mkEx("Leg Extension"), mkEx("Leg Curl"), mkEx("Calf Raise"),
    ],
  },
];

/* ---------------- storage (localStorage, this app runs standalone) ---------------- */
const STORAGE_PREFIX = "ironlog:";
async function loadKey(key, fallback) {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* key missing or storage unavailable */ }
  return fallback;
}
async function saveKey(key, value) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) { /* best effort, e.g. private browsing quota */ }
}

/* ---------------- status logic ---------------- */
function hasStrength(day) { return !!(day && day.workoutId); }
function hasCardio(day) { return !!(day && day.cardio && day.cardio.assigned); }

function getDayStatus(iso, dayData) {
  const d = dayData[iso];
  const s = hasStrength(d), c = hasCardio(d);
  if (!s && !c) return "none";
  const strengthDone = s ? d.completed : true;
  const cardioDone = c ? d.cardio.completed : true;
  if (strengthDone && cardioDone) return "done";
  if (iso === TODAY_ISO) return "today";
  if (iso < TODAY_ISO) return "missed";
  return "scheduled";
}

/* when a day is 'done', which type(s) it was done for — used to tint the bubble */
function getDoneTint(iso, dayData) {
  const d = dayData[iso];
  const s = hasStrength(d), c = hasCardio(d);
  if (s && c) return "both";
  if (c) return "cardio";
  return "strength";
}

const STATUS_STYLE = {
  none:      { bg: "var(--surface-1)", border: "var(--line-2)", text: "var(--text-faint)" },
  scheduled: { bg: "var(--surface-1)", border: "var(--accent)", text: "var(--text-primary)" },
  today:     { bg: "var(--surface-1)", border: "var(--accent)", text: "var(--text-primary)" },
  missed:    { bg: "rgba(240,85,75,0.14)", border: "#F0554B", text: "#F0554B" },
};

const DONE_STYLE = {
  strength: { bg: "rgba(74,222,128,0.16)", border: "#4ADE80", text: "#4ADE80" },
  cardio:   { bg: "rgba(56,189,248,0.16)", border: "#38BDF8", text: "#38BDF8" },
  both:     { bg: "rgba(167,139,250,0.18)", border: "#A78BFA", text: "#A78BFA" },
};

function styleFor(iso, dayData) {
  const status = getDayStatus(iso, dayData);
  return status === "done" ? DONE_STYLE[getDoneTint(iso, dayData)] : STATUS_STYLE[status];
}

/* combined label like "Push Day + Treadmill Run" for a day with both types assigned */
function dayLabel(day) {
  const parts = [];
  if (hasStrength(day)) parts.push(day.workoutName);
  if (hasCardio(day)) parts.push(day.cardio.type || "Cardio");
  return parts.join(" + ");
}

/* next day (up to 30 days out) with something assigned that isn't fully done yet */
function findNextUpcoming(dayData, afterIso) {
  for (let i = 1; i <= 30; i++) {
    const iso = toISO(addDays(parseISO(afterIso), i));
    const d = dayData[iso];
    if (!d) continue;
    const s = hasStrength(d), c = hasCardio(d);
    if (!s && !c) continue;
    const strengthDone = s ? d.completed : true;
    const cardioDone = c ? d.cardio.completed : true;
    if (strengthDone && cardioDone) continue;
    return { iso, day: d, daysAhead: i };
  }
  return null;
}

/* ================= APP ================= */
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [dayData, setDayData] = useState({});
  const [tab, setTab] = useState("dashboard");
  const [selectedDate, setSelectedDate] = useState(null);
  const [unit, setUnit] = useState("kg");
  const firstLoad = useRef(true);

  useEffect(() => {
    (async () => {
      const t = await loadKey("workout-templates", DEFAULT_TEMPLATES);
      const d = await loadKey("day-data", {});
      const u = await loadKey("settings-unit", "kg");
      setTemplates(t);
      setDayData(d);
      setUnit(u);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (firstLoad.current) { firstLoad.current = false; return; }
    const h = setTimeout(() => saveKey("workout-templates", templates), 300);
    return () => clearTimeout(h);
  }, [templates, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const h = setTimeout(() => saveKey("day-data", dayData), 300);
    return () => clearTimeout(h);
  }, [dayData, loaded]);

  useEffect(() => {
    if (!loaded) return;
    saveKey("settings-unit", unit);
  }, [unit, loaded]);

  function toggleUnit() {
    setUnit(prevUnit => {
      const next = prevUnit === "lb" ? "kg" : "lb";
      const factor = next === "kg" ? 1 / 2.20462 : 2.20462;
      setDayData(prevData => {
        const out = {};
        Object.entries(prevData).forEach(([iso, day]) => {
          if (!day.exercises) { out[iso] = day; return; }
          const exercises = {};
          Object.entries(day.exercises).forEach(([exId, ex]) => {
            const sets = ex.sets.map(s => {
              const w = parseFloat(s.weight);
              if (!w || w <= 0) return s;
              return { ...s, weight: String(Math.round(w * factor * 10) / 10) };
            });
            exercises[exId] = { ...ex, sets };
          });
          out[iso] = { ...day, exercises };
        });
        return out;
      });
      return next;
    });
  }

  function openDay(iso) {
    setSelectedDate(iso);
    setTab("day");
  }

  function assignWorkout(iso, template) {
    setDayData(prev => {
      const exercises = {};
      template.exercises.forEach(ex => {
        exercises[ex.id] = {
          name: ex.name,
          targetSets: ex.targetSets,
          targetReps: ex.targetReps,
          sets: Array.from({ length: ex.targetSets }, () => ({ weight: "", reps: "", effort: 0 })),
        };
      });
      return {
        ...prev,
        [iso]: { ...(prev[iso] || {}), workoutId: template.id, workoutName: template.name, exercises, completed: false },
      };
    });
  }

  function removeWorkout(iso) {
    setDayData(prev => {
      const day = { ...prev[iso] };
      delete day.workoutId; delete day.workoutName; delete day.exercises; delete day.completed;
      if (!day.cardio) {
        const next = { ...prev };
        delete next[iso];
        return next;
      }
      return { ...prev, [iso]: day };
    });
  }

  function swapExercise(iso, oldExId, newName) {
    setDayData(prev => {
      const day = prev[iso];
      if (!day || !day.exercises || !day.exercises[oldExId]) return prev;
      const old = day.exercises[oldExId];
      let newId = slug(newName);
      if (newId === oldExId || day.exercises[newId]) newId = `${newId}-${Date.now()}`;
      const exercises = {};
      Object.entries(day.exercises).forEach(([id, ex]) => {
        if (id === oldExId) {
          exercises[newId] = {
            name: newName,
            targetSets: old.targetSets,
            targetReps: old.targetReps,
            sets: Array.from({ length: old.targetSets }, () => ({ weight: "", reps: "", effort: 0 })),
          };
        } else {
          exercises[id] = ex;
        }
      });
      return { ...prev, [iso]: { ...day, exercises } };
    });
  }

  function addCardio(iso) {
    setDayData(prev => ({
      ...prev,
      [iso]: {
        ...(prev[iso] || {}),
        cardio: { assigned: true, completed: false, type: "", duration: "", distance: "", incline: "", speed: "", notes: "" },
      },
    }));
  }
  function updateCardioField(iso, field, value) {
    setDayData(prev => ({
      ...prev,
      [iso]: { ...prev[iso], cardio: { ...prev[iso].cardio, [field]: value } },
    }));
  }
  function finishCardio(iso) {
    setDayData(prev => ({ ...prev, [iso]: { ...prev[iso], cardio: { ...prev[iso].cardio, completed: true } } }));
  }
  function reopenCardio(iso) {
    setDayData(prev => ({ ...prev, [iso]: { ...prev[iso], cardio: { ...prev[iso].cardio, completed: false } } }));
  }
  function removeCardio(iso) {
    setDayData(prev => {
      const day = { ...prev[iso] };
      delete day.cardio;
      if (!day.workoutId) {
        const next = { ...prev };
        delete next[iso];
        return next;
      }
      return { ...prev, [iso]: day };
    });
  }

  function updateSet(iso, exId, setIdx, field, value) {
    setDayData(prev => {
      const day = prev[iso];
      if (!day) return prev;
      const ex = day.exercises[exId];
      const sets = ex.sets.map((s, i) => (i === setIdx ? { ...s, [field]: value } : s));
      return { ...prev, [iso]: { ...day, exercises: { ...day.exercises, [exId]: { ...ex, sets } } } };
    });
  }

  function addSet(iso, exId) {
    setDayData(prev => {
      const day = prev[iso];
      const ex = day.exercises[exId];
      const sets = [...ex.sets, { weight: "", reps: "", effort: 0 }];
      return { ...prev, [iso]: { ...day, exercises: { ...day.exercises, [exId]: { ...ex, sets } } } };
    });
  }

  function removeSet(iso, exId, setIdx) {
    setDayData(prev => {
      const day = prev[iso];
      const ex = day.exercises[exId];
      const sets = ex.sets.filter((_, i) => i !== setIdx);
      return { ...prev, [iso]: { ...day, exercises: { ...day.exercises, [exId]: { ...ex, sets } } } };
    });
  }

  function finishDay(iso) {
    setDayData(prev => ({ ...prev, [iso]: { ...prev[iso], completed: true } }));
  }
  function reopenDay(iso) {
    setDayData(prev => ({ ...prev, [iso]: { ...prev[iso], completed: false } }));
  }

  function saveTemplate(tpl) {
    setTemplates(prev => {
      const exists = prev.some(t => t.id === tpl.id);
      return exists ? prev.map(t => (t.id === tpl.id ? tpl : t)) : [...prev, tpl];
    });
  }
  function deleteTemplate(id) {
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  /* previous session lookup: most recent day before `iso` that actually logged numbers for this exercise (assigned-but-blank days don't count, however recent) */
  function findPrevious(exId, beforeIso) {
    const dates = Object.keys(dayData).filter(d => {
      const ex = dayData[d].exercises && dayData[d].exercises[exId];
      return d < beforeIso && ex && ex.sets.some(s => parseFloat(s.weight) > 0 || parseFloat(s.reps) > 0);
    }).sort();
    if (!dates.length) return null;
    const last = dates[dates.length - 1];
    return { date: last, ...dayData[last].exercises[exId] };
  }

  /* all-time best weight / estimated 1RM for this exercise, from any day before `beforeIso` */
  function findBest(exId, beforeIso) {
    let maxWeight = 0, maxE1RM = 0;
    Object.entries(dayData).forEach(([d, day]) => {
      if (d >= beforeIso || !day.exercises || !day.exercises[exId]) return;
      day.exercises[exId].sets.forEach(s => {
        const w = parseFloat(s.weight), r = parseFloat(s.reps);
        if (w > 0 && r > 0) {
          if (w > maxWeight) maxWeight = w;
          const e1 = w * (1 + r / 30);
          if (e1 > maxE1RM) maxE1RM = e1;
        }
      });
    });
    return { maxWeight, maxE1RM };
  }

  if (!loaded) {
    return (
      <div style={{ ...pageStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <GlobalStyle />
        <p style={{ color: "var(--text-faint)", fontFamily: "Inter, sans-serif" }}>Loading your training log…</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <GlobalStyle />
      <div style={shellStyle}>
        {tab !== "day" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(20px + env(safe-area-inset-top)) 18px 6px" }}>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: 0.3, color: "var(--text-primary)", margin: 0 }}>
              IRONLOG
            </h1>
            <button
              onClick={toggleUnit}
              style={{ ...pillBtn, fontFamily: "'JetBrains Mono', monospace" }}
            >
              {unit.toUpperCase()}
            </button>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {tab === "dashboard" && (
            <Dashboard
              dayData={dayData}
              templates={templates}
              onOpenDay={openDay}
              unit={unit}
            />
          )}
          {tab === "day" && selectedDate && (
            <DayDetail
              iso={selectedDate}
              dayData={dayData}
              templates={templates}
              unit={unit}
              onBack={() => setTab("dashboard")}
              onAssign={t => assignWorkout(selectedDate, t)}
              onRemove={() => removeWorkout(selectedDate)}
              onSwapExercise={(exId, newName) => swapExercise(selectedDate, exId, newName)}
              onUpdateSet={(exId, i, f, v) => updateSet(selectedDate, exId, i, f, v)}
              onAddSet={exId => addSet(selectedDate, exId)}
              onRemoveSet={(exId, i) => removeSet(selectedDate, exId, i)}
              onFinish={() => finishDay(selectedDate)}
              onReopen={() => reopenDay(selectedDate)}
              findPrevious={findPrevious}
              findBest={findBest}
              onAddCardio={() => addCardio(selectedDate)}
              onUpdateCardio={(f, v) => updateCardioField(selectedDate, f, v)}
              onFinishCardio={() => finishCardio(selectedDate)}
              onReopenCardio={() => reopenCardio(selectedDate)}
              onRemoveCardio={() => removeCardio(selectedDate)}
            />
          )}
          {tab === "workouts" && (
            <WorkoutsView templates={templates} onSave={saveTemplate} onDelete={deleteTemplate} />
          )}
          {tab === "progress" && (
            <ProgressView dayData={dayData} unit={unit} />
          )}
        </div>

        {tab !== "day" && (
          <nav style={navStyle}>
            <NavBtn icon={<Home size={20} />} label="Dashboard" active={tab === "dashboard"} onClick={() => setTab("dashboard")} />
            <NavBtn icon={<ListChecks size={20} />} label="Workouts" active={tab === "workouts"} onClick={() => setTab("workouts")} />
            <NavBtn icon={<BarChart3 size={20} />} label="Progress" active={tab === "progress"} onClick={() => setTab("progress")} />
          </nav>
        )}
      </div>
    </div>
  );
}

/* ---------------- shared bits ---------------- */
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
      * { box-sizing: border-box; }
      input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      input[type=number] { -moz-appearance: textfield; }
      ::-webkit-scrollbar { width: 0; height: 0; }
    `}</style>
  );
}

const pageStyle = {
  "--bg": "#0E1013",
  "--surface-0": "#0E1013",
  "--surface-1": "#181B20",
  "--surface-2": "#20242B",
  "--line": "#2B3038",
  "--line-2": "#333941",
  "--text-primary": "#F2F3F1",
  "--text-secondary": "#A6ACB6",
  "--text-faint": "#5A616B",
  "--accent": "#E8A33D",
  "--accent-dim": "rgba(232,163,61,0.15)",
  background: "var(--surface-0)",
  height: "100dvh",
  minHeight: "100vh",
  fontFamily: "'Inter', sans-serif",
  display: "flex",
  justifyContent: "center",
  color: "var(--text-primary)",
  overflow: "hidden",
};
const shellStyle = { width: "100%", maxWidth: 460, height: "100%", display: "flex", flexDirection: "column", position: "relative" };
const navStyle = {
  flexShrink: 0, display: "flex",
  background: "var(--surface-1)", borderTop: "1px solid var(--line)",
  padding: "10px 8px calc(14px + env(safe-area-inset-bottom))",
};
const pillBtn = {
  background: "var(--surface-1)", border: "1px solid var(--line)", color: "var(--text-secondary)",
  fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 20, cursor: "pointer",
};

function NavBtn({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      background: "transparent", border: "none", cursor: "pointer",
      color: active ? "var(--accent)" : "var(--text-faint)",
    }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: 500, fontFamily: "Inter, sans-serif" }}>{label}</span>
    </button>
  );
}

function SectionLabel({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 18px 10px" }}>
      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: 0.6, color: "var(--text-secondary)", textTransform: "uppercase" }}>
        {children}
      </span>
      {right}
    </div>
  );
}

/* ================= DASHBOARD ================= */
function Dashboard({ dayData, templates, onOpenDay, unit }) {
  const weekStart = startOfWeek(TODAY);
  const weekDays = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)));

  const streak = useMemo(() => {
    let count = 0;
    let cursor = getDayStatus(TODAY_ISO, dayData) === "done" ? TODAY : addDays(TODAY, -1);
    while (true) {
      const iso = toISO(cursor);
      if (getDayStatus(iso, dayData) === "done") { count++; cursor = addDays(cursor, -1); }
      else break;
    }
    return count;
  }, [dayData]);

  const thisWeekStats = useMemo(() => {
    let assigned = 0, done = 0, volume = 0;
    weekDays.forEach(iso => {
      const d = dayData[iso];
      if (hasStrength(d) || hasCardio(d)) {
        assigned++;
        if (getDayStatus(iso, dayData) === "done") done++;
      }
      if (d && d.exercises) {
        Object.values(d.exercises).forEach(ex => {
          ex.sets.forEach(s => {
            const w = parseFloat(s.weight), r = parseFloat(s.reps);
            if (w > 0 && r > 0) volume += w * r;
          });
        });
      }
    });
    return { assigned, done, volume: Math.round(volume) };
  }, [dayData]);

  const last30 = useMemo(() => {
    let assigned = 0, done = 0;
    for (let i = 0; i < 30; i++) {
      const iso = toISO(addDays(TODAY, -i));
      const d = dayData[iso];
      if (hasStrength(d) || hasCardio(d)) {
        assigned++;
        if (getDayStatus(iso, dayData) === "done") done++;
      }
    }
    return assigned ? Math.round((done / assigned) * 100) : null;
  }, [dayData]);

  return (
    <div style={{ paddingBottom: 24 }}>
      <NextWorkoutCard dayData={dayData} onOpenDay={onOpenDay} />

      <SectionLabel>This week</SectionLabel>
      <WeekStrip weekDays={weekDays} dayData={dayData} onOpenDay={onOpenDay} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, margin: "18px 18px 0" }}>
        <StatCard icon={<Flame size={16} color="#F0554B" />} label="Streak" value={`${streak}`} sub={streak === 1 ? "day" : "days"} />
        <StatCard icon={<Check size={16} color="#4ADE80" />} label="This week" value={`${thisWeekStats.done}/${thisWeekStats.assigned || 0}`} sub="completed" />
        <StatCard icon={<Dumbbell size={16} color="var(--accent)" />} label="Volume" value={thisWeekStats.volume.toLocaleString()} sub={`${unit} lifted`} />
      </div>

      {last30 !== null && (
        <div style={{ margin: "10px 18px 0", fontSize: 12, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace" }}>
          {last30}% consistency over the last 30 days
        </div>
      )}

      <SectionLabel>Consistency</SectionLabel>
      <Heatmap dayData={dayData} onOpenDay={onOpenDay} />
    </div>
  );
}

function NextWorkoutCard({ dayData, onOpenDay }) {
  const today = dayData[TODAY_ISO];
  const todayAssigned = hasStrength(today) || hasCardio(today);
  const todayStatus = getDayStatus(TODAY_ISO, dayData);
  const todayFullyDone = todayAssigned && todayStatus === "done";

  let card = null;

  if (todayAssigned && !todayFullyDone) {
    card = { label: "Today", name: dayLabel(today), iso: TODAY_ISO, done: false };
  } else {
    const next = findNextUpcoming(dayData, TODAY_ISO);
    if (next) {
      card = { label: next.daysAhead === 1 ? "Tomorrow" : `In ${next.daysAhead} days`, name: dayLabel(next.day), iso: next.iso, done: false };
    } else if (todayFullyDone) {
      card = { label: "Today", name: dayLabel(today), iso: TODAY_ISO, done: true };
    }
  }

  if (!card) {
    return (
      <button onClick={() => onOpenDay(TODAY_ISO)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "calc(100% - 36px)",
        textAlign: "left", margin: "18px 18px 0", background: "var(--surface-1)", border: "1px dashed var(--line-2)",
        borderRadius: 14, padding: "14px 16px", cursor: "pointer", color: "var(--text-primary)",
      }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Nothing scheduled</div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 3 }}>Nothing assigned in the next 30 days</div>
        </div>
        <ChevronRight size={18} color="var(--text-faint)" />
      </button>
    );
  }

  return (
    <button onClick={() => onOpenDay(card.iso)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", width: "calc(100% - 36px)",
      textAlign: "left", margin: "18px 18px 0", background: "var(--accent-dim)", border: "1px solid var(--accent)",
      borderRadius: 14, padding: "14px 16px", cursor: "pointer", color: "var(--text-primary)",
    }}>
      <div>
        <div style={{ fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>
          {card.label}{card.done ? " · completed" : ""}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, marginTop: 2 }}>{card.name}</div>
      </div>
      {card.done ? <Check size={22} color="#4ADE80" /> : <ChevronRight size={20} color="var(--accent)" />}
    </button>
  );
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: String(value).length > 6 ? 15 : 20, fontWeight: 500, color: "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{sub}</div>
    </div>
  );
}

function WeekStrip({ weekDays, dayData, onOpenDay }) {
  const statuses = weekDays.map(iso => getDayStatus(iso, dayData));
  return (
    <div style={{ position: "relative", margin: "0 18px" }}>
      <div style={{ position: "absolute", top: 22, left: 22, right: 22, height: 2, display: "flex" }}>
        {statuses.slice(0, 6).map((s, i) => {
          const next = statuses[i + 1];
          let color = "var(--line)", dashed = true;
          if (s === "done" && next === "done") { color = "#4ADE80"; dashed = false; }
          else if (s === "missed" || next === "missed") { color = "rgba(240,85,75,0.4)"; dashed = false; }
          return (
            <div key={i} style={{ flex: 1, height: 2, background: dashed ? "none" : color, borderTop: dashed ? `2px dashed var(--line)` : "none", marginRight: i < 5 ? 2 : 0 }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
        {weekDays.map((iso, i) => {
          const status = statuses[i];
          const style = styleFor(iso, dayData);
          const d = parseISO(iso);
          const isToday = iso === TODAY_ISO;
          return (
            <button key={iso} onClick={() => onOpenDay(iso)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 0 }}>
              <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 500 }}>{WEEKDAYS[i]}</span>
              <div style={{
                width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: style.bg, border: `${isToday ? 2 : 1.5}px solid ${style.border}`,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 500, color: style.text,
                boxShadow: isToday ? `0 0 0 3px var(--accent-dim)` : "none",
              }}>
                {status === "done" ? <Check size={18} /> : status === "missed" ? <X size={16} /> : d.getDate()}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Heatmap({ dayData, onOpenDay }) {
  const weeks = 13;
  const CELL = 22;
  const gridStart = addDays(startOfWeek(TODAY), -(weeks - 1) * 7);
  const cols = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d))
  );
  let lastMonth = -1;
  return (
    <div style={{ margin: "0 18px", overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 5 }}>
        {cols.map((col, wi) => {
          const monthLabel = (() => {
            const m = col[0].getMonth();
            if (m !== lastMonth) { lastMonth = m; return MONTHS[m]; }
            return "";
          })();
          return (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: "var(--text-faint)", height: 14, fontFamily: "'JetBrains Mono', monospace" }}>{monthLabel}</div>
              {col.map((date, di) => {
                const iso = toISO(date);
                const future = date > TODAY;
                const status = getDayStatus(iso, dayData);
                const style = styleFor(iso, dayData);
                return (
                  <button
                    key={di}
                    onClick={() => !future && onOpenDay(iso)}
                    title={iso}
                    disabled={future}
                    style={{
                      width: CELL, height: CELL, borderRadius: 6, border: `1.5px solid ${future ? "var(--line)" : style.border}`,
                      background: future ? "transparent" : status === "none" ? "var(--surface-1)" : style.bg,
                      cursor: future ? "default" : "pointer", padding: 0, opacity: future ? 0.4 : 1,
                      WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= DAY DETAIL ================= */
function DayDetail({
  iso, dayData, templates, unit, onBack, onAssign, onRemove, onSwapExercise,
  onUpdateSet, onAddSet, onRemoveSet, onFinish, onReopen, findPrevious, findBest,
  onAddCardio, onUpdateCardio, onFinishCardio, onReopenCardio, onRemoveCardio,
}) {
  const day = dayData[iso];
  const status = getDayStatus(iso, dayData);
  const [expanded, setExpanded] = useState(() => {
    if (day && day.exercises) {
      const ids = Object.keys(day.exercises);
      return ids.length ? { [ids[0]]: true } : {};
    }
    return {};
  });

  const style = styleFor(iso, dayData);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(18px + env(safe-area-inset-top)) 18px 12px" }}>
        <button onClick={onBack} style={{ background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 10, padding: 8, color: "var(--text-primary)", cursor: "pointer", display: "flex" }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22 }}>{fmtLong(iso)}</div>
          <div style={{ fontSize: 12, color: style.text, fontWeight: 500, textTransform: "capitalize" }}>
            {status === "none" ? "Rest day" : status === "today" ? "In progress" : status}
          </div>
        </div>
      </div>

      {(!day || !day.workoutId) && (
        <div style={{ margin: "8px 18px" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 14 }}>No strength workout assigned. Pick a template for this day, or skip straight to cardio below.</p>
          {templates.length === 0 && <p style={{ color: "var(--text-faint)", fontSize: 13 }}>You haven't built a workout yet — head to the Workouts tab first.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {templates.map(t => (
              <button key={t.id} onClick={() => onAssign(t)} style={{
                textAlign: "left", background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 12,
                padding: "12px 14px", cursor: "pointer", color: "var(--text-primary)",
              }}>
                <div style={{ fontWeight: 500, fontSize: 15 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{t.exercises.length} exercises</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {day && day.workoutId && (
        <div style={{ margin: "8px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{day.workoutName}</div>
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{Object.keys(day.exercises).length} exercises</div>
            </div>
            <button onClick={onRemove} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
              Remove
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(day.exercises).map(([exId, ex]) => (
              <ExerciseCard
                key={exId}
                exId={exId}
                ex={ex}
                iso={iso}
                unit={unit}
                open={!!expanded[exId]}
                onToggle={() => setExpanded(e => ({ ...e, [exId]: !e[exId] }))}
                onUpdateSet={(i, f, v) => onUpdateSet(exId, i, f, v)}
                onAddSet={() => onAddSet(exId)}
                onRemoveSet={i => onRemoveSet(exId, i)}
                onSwap={newName => onSwapExercise(exId, newName)}
                previous={findPrevious(exId, iso)}
                best={findBest(exId, iso)}
              />
            ))}
          </div>

          <div style={{ marginTop: 20, marginBottom: 10 }}>
            {day.completed ? (
              <button onClick={onReopen} style={{ ...primaryBtn, background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                Reopen day
              </button>
            ) : (
              <button onClick={onFinish} style={primaryBtn}>
                <Check size={16} /> Finish workout
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ margin: "8px 18px 24px" }}>
        {day && day.cardio && day.cardio.assigned ? (
          <CardioSection
            cardio={day.cardio}
            onChange={(f, v) => onUpdateCardio(f, v)}
            onFinish={onFinishCardio}
            onReopen={onReopenCardio}
            onRemove={onRemoveCardio}
          />
        ) : (
          <button onClick={onAddCardio} style={{
            width: "100%", background: "none", border: "1px dashed var(--line-2)", color: "var(--text-secondary)",
            borderRadius: 12, padding: "13px 0", fontSize: 14, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <Activity size={16} color="#38BDF8" /> Add cardio session
          </button>
        )}
      </div>
    </div>
  );
}

function CardioSection({ cardio, onChange, onFinish, onReopen, onRemove }) {
  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 7 }}>
          <Activity size={15} color="#38BDF8" /> Cardio
        </div>
        <button onClick={onRemove} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
          Remove
        </button>
      </div>

      <input
        placeholder="Type (e.g. Treadmill Run)" value={cardio.type} list="cardio-types"
        onChange={e => onChange("type", e.target.value)}
        style={{ ...textInputStyle, marginBottom: 8 }}
      />
      <datalist id="cardio-types">
        {["Treadmill Run", "Outdoor Run", "Incline Walk", "Bike", "Row", "Elliptical"].map(t => <option key={t} value={t} />)}
      </datalist>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <CardioField label="Duration (min)" value={cardio.duration} onChange={v => onChange("duration", v)} />
        <CardioField label="Distance" value={cardio.distance} onChange={v => onChange("distance", v)} />
        <CardioField label="Incline (%)" value={cardio.incline} onChange={v => onChange("incline", v)} />
        <CardioField label="Speed / pace" value={cardio.speed} onChange={v => onChange("speed", v)} />
      </div>

      <label style={{ ...labelStyle, marginTop: 8 }}>Notes</label>
      <textarea
        placeholder="How it felt, route, etc." value={cardio.notes}
        onChange={e => onChange("notes", e.target.value)}
        style={{ ...textInputStyle, minHeight: 56, resize: "vertical" }}
      />

      <div style={{ marginTop: 12 }}>
        {cardio.completed ? (
          <button onClick={onReopen} style={{ ...primaryBtn, background: "var(--surface-2)", color: "var(--text-secondary)" }}>
            Reopen cardio
          </button>
        ) : (
          <button onClick={onFinish} style={{ ...primaryBtn, background: "#38BDF8", color: "#062331" }}>
            <Check size={16} /> Finish cardio
          </button>
        )}
      </div>
    </div>
  );
}

function CardioField({ label, value, onChange }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="text" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
        style={textInputStyle}
      />
    </div>
  );
}

const primaryBtn = {
  width: "100%", background: "var(--accent)", color: "#241705", border: "none", borderRadius: 12,
  padding: "13px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
};

function getSetPR(set, best) {
  const w = parseFloat(set.weight), r = parseFloat(set.reps);
  if (!(w > 0 && r > 0) || !best || !(best.maxWeight > 0 || best.maxE1RM > 0)) return null;
  const e1 = w * (1 + r / 30);
  const weightPR = w > best.maxWeight;
  const e1rmPR = e1 > best.maxE1RM;
  if (!weightPR && !e1rmPR) return null;
  return weightPR ? "Weight PR" : "Est. 1RM PR";
}

function ExerciseCard({ ex, open, onToggle, onUpdateSet, onAddSet, onRemoveSet, onSwap, previous, best }) {
  const prFlags = ex.sets.map(s => getSetPR(s, best));
  const hasPR = prFlags.some(Boolean);
  const [swapping, setSwapping] = useState(false);
  const [swapValue, setSwapValue] = useState("");
  const datalistId = `ex-lib-${ex.name.replace(/[^a-z0-9]+/gi, "-")}`;

  function confirmSwap() {
    const nm = swapValue.trim();
    if (!nm) { setSwapping(false); return; }
    onSwap(nm);
    setSwapping(false);
    setSwapValue("");
  }

  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "13px 14px", cursor: "pointer", color: "var(--text-primary)",
      }}>
        <div onClick={onToggle} style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              {ex.name}
              {hasPR && <Trophy size={13} color="#FFC93C" />}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{ex.targetReps} reps · {ex.targetSets} sets</div>
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); setSwapping(s => !s); }}
          title="Swap exercise for today"
          style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", padding: 6, display: "flex" }}
        >
          <Repeat size={15} />
        </button>
        <div onClick={onToggle} style={{ display: "flex" }}>
          <ChevronDown size={18} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", color: "var(--text-faint)" }} />
        </div>
      </div>

      {swapping && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <label style={labelStyle}>Replace with</label>
          <input
            autoFocus value={swapValue} onChange={e => setSwapValue(e.target.value)}
            placeholder="e.g. Incline Bench Press" list={datalistId} style={textInputStyle}
            onKeyDown={e => { if (e.key === "Enter") confirmSwap(); if (e.key === "Escape") setSwapping(false); }}
          />
          <datalist id={datalistId}>
            {EXERCISE_LIBRARY.map(n => <option key={n} value={n} />)}
          </datalist>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={confirmSwap} style={{ ...primaryBtn, padding: "9px 14px", fontSize: 13 }}>Swap for today</button>
            <button onClick={() => setSwapping(false)} style={{ ...ghostIconBtn, padding: "9px 14px" }}>Cancel</button>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>
            Only changes today — your saved workout template stays the same.
          </p>
        </div>
      )}

      {open && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "10px 14px 14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr 44px 20px", gap: 6, fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.4, padding: "0 2px 8px" }}>
            <span>Set</span><span>Weight</span><span>Reps</span><span style={{ textAlign: "center" }}>Effort</span><span />
          </div>
          {ex.sets.map((s, i) => {
            const prevSet = previous && previous.sets && previous.sets[i];
            return (
              <React.Fragment key={i}>
                <SetRow
                  index={i + 1}
                  set={s}
                  pr={prFlags[i]}
                  onChange={(f, v) => onUpdateSet(i, f, v)}
                  onRemove={ex.sets.length > 1 ? () => onRemoveSet(i) : null}
                />
                {prevSet && (prevSet.weight || prevSet.reps) && (
                  <PrevRow set={prevSet} />
                )}
              </React.Fragment>
            );
          })}
          <button onClick={onAddSet} style={{
            marginTop: 8, background: "none", border: "1px dashed var(--line-2)", color: "var(--text-secondary)",
            borderRadius: 8, width: "100%", padding: "8px 0", fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <Plus size={14} /> Add set
          </button>
        </div>
      )}
    </div>
  );
}

function SetRow({ index, set, pr, onChange, onRemove }) {
  const effort = EFFORT_LEVELS[set.effort || 0];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr 44px 20px", gap: 6, alignItems: "center", padding: "4px 2px" }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "var(--text-secondary)" }}>{index}</span>
      <div style={{ position: "relative" }}>
        <input
          type="number" inputMode="decimal" placeholder="0" value={set.weight}
          onChange={e => onChange("weight", e.target.value)}
          style={{ ...numInputStyle, borderColor: pr ? "#FFC93C" : "var(--line)" }}
        />
        {pr && (
          <span title={pr} style={{
            position: "absolute", top: -7, right: -6, width: 16, height: 16, borderRadius: "50%",
            background: "var(--surface-1)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Trophy size={11} color="#FFC93C" />
          </span>
        )}
      </div>
      <input
        type="number" inputMode="numeric" placeholder="0" value={set.reps}
        onChange={e => onChange("reps", e.target.value)}
        style={numInputStyle}
      />
      <button
        onClick={() => onChange("effort", (set.effort + 1) % EFFORT_LEVELS.length)}
        title={effort.label}
        style={{
          width: 28, height: 28, borderRadius: "50%", border: `1.5px solid ${effort.v ? effort.color : "var(--line-2)"}`,
          background: effort.v ? effort.color + "22" : "transparent", cursor: "pointer", margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {!effort.v && <HelpCircle size={13} color="var(--text-faint)" />}
      </button>
      {onRemove ? (
        <button onClick={onRemove} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", padding: 0, display: "flex" }}>
          <Minus size={14} />
        </button>
      ) : <span />}
    </div>
  );
}

const numInputStyle = {
  background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text-primary)",
  fontFamily: "'JetBrains Mono', monospace", fontSize: 14, padding: "7px 8px", width: "100%", textAlign: "center",
};

function PrevRow({ set }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr 44px 20px", gap: 6, alignItems: "center", padding: "3px 2px 8px", background: "var(--accent-dim)", borderRadius: 8, margin: "2px 0" }}>
      <span style={{ display: "flex", justifyContent: "center" }}><Copy size={11} color="var(--accent)" /></span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--accent)", textAlign: "center" }}>{set.weight || "–"}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--accent)", textAlign: "center" }}>{set.reps || "–"}</span>
      <span style={{ fontSize: 10, color: "var(--accent)", textAlign: "center" }}>prev</span>
      <span />
    </div>
  );
}

/* ================= WORKOUTS ================= */
function WorkoutsView({ templates, onSave, onDelete }) {
  const [editing, setEditing] = useState(null);

  if (editing) {
    return <WorkoutEditor initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSave={t => { onSave(t); setEditing(null); }} />;
  }

  return (
    <div>
      <SectionLabel right={
        <button onClick={() => setEditing("new")} style={{ ...pillBtn, display: "flex", alignItems: "center", gap: 4, color: "var(--accent)", borderColor: "var(--accent)" }}>
          <Plus size={13} /> New
        </button>
      }>
        Your workouts
      </SectionLabel>
      <div style={{ margin: "0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {templates.length === 0 && (
          <p style={{ color: "var(--text-faint)", fontSize: 13 }}>Build your first workout template to start assigning training days.</p>
        )}
        {templates.map(t => (
          <div key={t.id} style={{ background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{t.exercises.length} exercises</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditing(t)} style={ghostIconBtn}>Edit</button>
                <button onClick={() => onDelete(t.id)} style={{ ...ghostIconBtn, color: "#F0554B" }}><Trash2 size={13} /></button>
              </div>
            </div>
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {t.exercises.map(ex => (
                <span key={ex.id} style={{ fontSize: 11, background: "var(--surface-2)", color: "var(--text-secondary)", padding: "4px 8px", borderRadius: 8 }}>
                  {ex.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ghostIconBtn = {
  background: "none", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text-secondary)",
  fontSize: 12, padding: "5px 9px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
};

function WorkoutEditor({ initial, onCancel, onSave }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [exercises, setExercises] = useState(initial ? initial.exercises : []);
  const [pick, setPick] = useState("");
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState("8-12");

  function addExercise() {
    const nm = pick.trim();
    if (!nm) return;
    setExercises(prev => [...prev, { id: `${slug(nm)}-${Date.now()}`, name: nm, targetSets: Number(sets) || 3, targetReps: reps || "8-12" }]);
    setPick("");
  }

  function save() {
    if (!name.trim() || exercises.length === 0) return;
    onSave({ id: initial ? initial.id : `w-${Date.now()}`, name: name.trim(), exercises });
  }

  return (
    <div style={{ padding: "18px 18px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <button onClick={onCancel} style={{ background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 10, padding: 8, color: "var(--text-primary)", cursor: "pointer", display: "flex" }}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20 }}>
          {initial ? "Edit workout" : "New workout"}
        </span>
      </div>

      <label style={labelStyle}>Workout name</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Leg Day" style={textInputStyle} />

      <label style={{ ...labelStyle, marginTop: 18 }}>Add exercise</label>
      <input
        value={pick} onChange={e => setPick(e.target.value)} placeholder="Type or pick an exercise"
        list="exercise-lib" style={textInputStyle}
      />
      <datalist id="exercise-lib">
        {EXERCISE_LIBRARY.map(n => <option key={n} value={n} />)}
      </datalist>

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Sets</label>
          <input type="number" value={sets} onChange={e => setSets(e.target.value)} style={textInputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Rep range</label>
          <input value={reps} onChange={e => setReps(e.target.value)} placeholder="8-12" style={textInputStyle} />
        </div>
      </div>
      <button onClick={addExercise} style={{ ...primaryBtn, marginTop: 12, background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--line)" }}>
        <Plus size={15} /> Add to workout
      </button>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        {exercises.map((ex, i) => (
          <div key={ex.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{ex.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{ex.targetSets} sets · {ex.targetReps} reps</div>
            </div>
            <button onClick={() => setExercises(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ margin: "24px 0 20px" }}>
        <button onClick={save} style={primaryBtn}>Save workout</button>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 };
const textInputStyle = {
  width: "100%", background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 10,
  color: "var(--text-primary)", fontSize: 14, padding: "10px 12px", fontFamily: "Inter, sans-serif",
};

/* ================= PROGRESS ================= */
function ProgressView({ dayData, unit }) {
  const exerciseNames = useMemo(() => {
    const map = new Map();
    Object.values(dayData).forEach(d => {
      if (!d.exercises) return;
      Object.entries(d.exercises).forEach(([id, ex]) => {
        if (ex.sets.some(s => parseFloat(s.weight) > 0)) map.set(id, ex.name);
      });
    });
    return Array.from(map.entries());
  }, [dayData]);

  const [selected, setSelected] = useState(null);
  const activeId = selected || (exerciseNames[0] ? exerciseNames[0][0] : null);

  const history = useMemo(() => {
    if (!activeId) return [];
    const rows = [];
    Object.entries(dayData).sort(([a], [b]) => (a < b ? -1 : 1)).forEach(([iso, d]) => {
      const ex = d.exercises && d.exercises[activeId];
      if (!ex) return;
      const validSets = ex.sets.filter(s => parseFloat(s.weight) > 0 && parseFloat(s.reps) > 0);
      if (!validSets.length) return;
      const top = validSets.reduce((m, s) => (parseFloat(s.weight) > m ? parseFloat(s.weight) : m), 0);
      const e1rm = validSets.reduce((m, s) => {
        const w = parseFloat(s.weight), r = parseFloat(s.reps);
        const est = w * (1 + r / 30);
        return est > m ? est : m;
      }, 0);
      rows.push({ iso, date: `${MONTHS[parseISO(iso).getMonth()]} ${parseISO(iso).getDate()}`, top, e1rm: Math.round(e1rm), sets: validSets });
    });
    return rows;
  }, [dayData, activeId]);

  return (
    <div>
      <SectionLabel>Progression</SectionLabel>
      {exerciseNames.length === 0 ? (
        <p style={{ margin: "0 18px", color: "var(--text-faint)", fontSize: 13 }}>
          Log a few sets on a workout day and your progression will show up here.
        </p>
      ) : (
        <>
          <div style={{ margin: "0 18px 14px" }}>
            <select value={activeId} onChange={e => setSelected(e.target.value)} style={{ ...textInputStyle, appearance: "none" }}>
              {exerciseNames.map(([id, nm]) => <option key={id} value={id}>{nm}</option>)}
            </select>
          </div>

          {history.length >= 2 ? (
            <div style={{ margin: "0 18px", height: 220, background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 8px 6px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#5A616B" }} axisLine={{ stroke: "#2B3038" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#5A616B" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#20242B", border: "1px solid #2B3038", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#F2F3F1" }} />
                  <Line type="monotone" dataKey="top" name={`Top set (${unit})`} stroke="#E8A33D" strokeWidth={2} dot={{ r: 3, fill: "#E8A33D" }} />
                  <Line type="monotone" dataKey="e1rm" name="Est. 1RM" stroke="#4ADE80" strokeWidth={2} dot={{ r: 3, fill: "#4ADE80" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ margin: "0 18px", color: "var(--text-faint)", fontSize: 13 }}>Log this exercise on at least two days to see a trend line.</p>
          )}

          <SectionLabel>Session history</SectionLabel>
          <div style={{ margin: "0 18px", display: "flex", flexDirection: "column", gap: 8 }}>
            {[...history].reverse().map(row => (
              <div key={row.iso} style={{ background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{row.date}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                  {row.sets.map(s => `${s.weight}×${s.reps}`).join(", ")}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
