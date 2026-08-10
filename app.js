/* ============================================================
   Capacity Tracker — app logic
   Vanilla JS, single global App namespace, full-innerHTML re-render
   on structural changes; live text inputs mutate state directly
   without re-rendering so focus/cursor position is preserved.
   ============================================================ */

const CONFIGURED = !SUPABASE_URL.includes('YOUR-PROJECT');
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_PROGRAM = [
  { name: 'Day 1', exercises: [
    { name: 'Close grip bench press', sets: 3, rep_lo: 8, rep_hi: 10, base_weight: 55, increment: 2.5 },
    { name: 'Dumbbell flye', sets: 2, rep_lo: 10, rep_hi: 12, base_weight: 12, increment: 2 },
    { name: 'Heel elevated squat', sets: 3, rep_lo: 8, rep_hi: 10, base_weight: 65, increment: 5 },
    { name: 'Split squat', sets: 2, rep_lo: 5, rep_hi: 7, base_weight: 20, increment: 2.5, per_leg: true },
    { name: 'Good morning', sets: 3, rep_lo: 8, rep_hi: 10, base_weight: 40, increment: 2.5 },
  ]},
  { name: 'Day 2', exercises: [
    { name: 'Dumbbell bench press', sets: 3, rep_lo: 8, rep_hi: 10, base_weight: 22, increment: 2 },
    { name: 'Dumbbell lateral raises', sets: 2, rep_lo: 10, rep_hi: 12, base_weight: 8, increment: 1 },
    { name: 'Deficit deadlift', sets: 3, rep_lo: 8, rep_hi: 10, base_weight: 80, increment: 5 },
    { name: 'Bulgarian split squat', sets: 2, rep_lo: 5, rep_hi: 7, base_weight: 16, increment: 2, per_leg: true },
    { name: 'Pull-ups', sets: 3, rep_lo: 8, rep_hi: 10, base_weight: 0, increment: 2.5, bodyweight: true },
  ]},
  { name: 'Day 3', exercises: [
    { name: 'Strict press', sets: 3, rep_lo: 8, rep_hi: 10, base_weight: 37.5, increment: 2.5 },
    { name: 'Skull crushers', sets: 2, rep_lo: 10, rep_hi: 12, base_weight: 25, increment: 2.5 },
    { name: 'Barbell back squat', sets: 3, rep_lo: 8, rep_hi: 10, base_weight: 85, increment: 5 },
    { name: 'Reverse barbell lunges', sets: 2, rep_lo: 5, rep_hi: 7, base_weight: 30, increment: 2.5, per_leg: true },
    { name: 'Barbell strict row', sets: 3, rep_lo: 8, rep_hi: 10, base_weight: 55, increment: 2.5 },
  ]},
];

const ACC = '#B85C3C', INK = '#241F1A', MUT = '#8B8175', SAGE = '#6F7F5F', GOLD = '#E9A03F', FAINT = '#B0A597', BORDER = '#E6DBC8';

// ---- global state ----
const S = {
  loading: true, user: null, fullName: '', bodyweight: 80,
  authMode: 'signin', authBusy: false, authError: '', authOk: '',
  days: [], sessions: [],
  view: 'today',
  expanded: null, active: null, elapsed: 0, timerHandle: null,
  openHistoryId: null,
  detailExerciseId: null, detailPick: null, detailAll: false,
  showDone: false, doneData: null,
  editingDayId: null, exerciseForm: null,
  sessionAnim: false, detailAnim: false,
};

// ---- helpers ----
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function num(n) { return Math.round((+n || 0) * 100) / 100; }
function trimNum(n) { return String(num(n)); }
function nf(n) { return Math.round(n || 0).toLocaleString('en-US'); }
function fmtWeight(ex, w) { w = num(w); return ex.bodyweight ? (w > 0 ? 'BW+' + trimNum(w) + 'kg' : 'Bodyweight') : trimNum(w) + 'kg'; }
function fmtClock(sec) { const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
function roundToIncrement(v, inc) { inc = +inc || 1; return Math.round(v / inc) * inc; }
function orm(load, reps) { return load * (1 + (+reps || 0) / 30); }
function mondayOf(d) { const dt = new Date(d); const day = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - day); dt.setHours(0, 0, 0, 0); return dt; }
function topSetOf(sets) { return sets.reduce((a, r) => (+r.weight > +a.weight ? r : a), sets[0]); }
function dfmt(t) { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
function initials() {
  if (S.fullName) { const parts = S.fullName.trim().split(/\s+/); return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || parts[0].slice(0, 2).toUpperCase(); }
  return (S.user?.email || '??').slice(0, 2).toUpperCase();
}

function weekAnchor() { return S.sessions.length ? mondayOf(S.sessions[0].performed_at) : mondayOf(new Date()); }
function weekIndexOf(date) { const diffDays = Math.round((mondayOf(date) - weekAnchor()) / 86400000); return Math.floor(diffDays / 7) + 1; }
function currentWeekIndex() { return weekIndexOf(new Date()); }
function streakWeeks() {
  if (!S.sessions.length) return 0;
  const weeks = new Set(S.sessions.map(s => weekIndexOf(s.performed_at)));
  let start = currentWeekIndex(), guard = 0;
  while (start > 0 && !weeks.has(start) && guard < 1000) { start--; guard++; }
  let n = 0, w = start;
  while (weeks.has(w) && n < 1000) { n++; w--; }
  return n;
}

function allExercises() { return S.days.flatMap(d => d.exercises.map(e => ({ ...e, day_id: d.id, day_name: d.name }))); }
function exerciseById(id) { for (const d of S.days) { const e = d.exercises.find(x => x.id === id); if (e) return e; } return null; }

function seriesFor(exId) {
  const ex = exerciseById(exId);
  const out = []; let best = 0;
  for (const s of S.sessions) {
    const e = s.entries.find(x => x.exercise_id === exId);
    if (!e || !e.sets.length) continue;
    const load = r => (e.bodyweight ? S.bodyweight : 0) + (+r.weight || 0);
    const rows = e.sets;
    const o = Math.max(...rows.map(r => orm(load(r), r.reps)));
    const vol = rows.reduce((a, r) => a + load(r) * (+r.reps || 0), 0);
    const isPR = o > best + 0.01;
    if (isPR) best = o;
    out.push({ session: s, entry: e, rows, orm: o, vol, isPR, ex: ex || { name: e.exercise_name, per_leg: e.per_leg, bodyweight: e.bodyweight, rep_lo: 1, rep_hi: 99 } });
  }
  return out;
}
function lastEntryFor(exId) {
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const e = S.sessions[i].entries.find(x => x.exercise_id === exId);
    if (e && e.sets.length) return e;
  }
  return null;
}
function suggestFor(ex) {
  const last = lastEntryFor(ex.id);
  if (!last) {
    const w = ex.bodyweight ? 0 : roundToIncrement(ex.base_weight * 0.7, ex.increment);
    return { weight: w, reps: ex.rep_lo, why: 'Start light — learn the movement.' };
  }
  const weight = num(last.sets[0].weight);
  const avgReps = Math.round(last.sets.reduce((a, s) => a + (+s.reps || 0), 0) / last.sets.length);
  if (avgReps < ex.rep_hi) {
    return { weight, reps: avgReps + 1, why: 'Last: ' + fmtWeight(ex, weight) + ' × ' + ex.sets + '×' + avgReps + '. Add a rep.' };
  }
  const nw = roundToIncrement(weight + (+ex.increment || 0), ex.increment);
  return { weight: nw, reps: ex.rep_lo, why: 'Top of range hit at ' + fmtWeight(ex, weight) + '. Add ' + trimNum(ex.increment) + 'kg, back to ' + ex.rep_lo + '.' };
}
function nextDayIndex() {
  if (!S.days.length) return 0;
  const last = S.sessions[S.sessions.length - 1];
  if (!last) return 0;
  const idx = S.days.findIndex(d => d.id === last.day_id);
  return idx === -1 ? 0 : (idx + 1) % S.days.length;
}

// ---- render ----
function render() {
  const app = document.getElementById('app');
  if (S.loading) { app.innerHTML = loadingScreen(); return; }
  if (!S.user) { app.innerHTML = authScreen(); attachAuthEvents(); return; }

  app.innerHTML = `
    <div class="shell">
      <div class="content">${mainView()}</div>
      <div class="tab-bar"><div class="tab-bar-inner">${tabBar()}</div></div>
    </div>
    ${S.active ? sessionOverlay() : ''}
    ${S.detailExerciseId ? detailOverlay() : ''}
    ${S.exerciseForm ? exerciseFormSheet() : ''}
    ${S.showDone ? doneSheet() : ''}
  `;
  const clockEl = document.getElementById('sessionClock');
  if (clockEl) clockEl.textContent = fmtClock(S.elapsed);
  S.sessionAnim = false; S.detailAnim = false;
}

function mainView() {
  switch (S.view) {
    case 'progress': return viewProgress();
    case 'records': return viewRecords();
    case 'history': return viewHistory();
    case 'settings': return viewSettings();
    default: return viewToday();
  }
}

function tabBar() {
  const tabs = [
    ['today', 'Today'], ['progress', 'Progress'], ['records', 'Records'], ['history', 'History'], ['settings', 'Settings'],
  ];
  return tabs.map(([k, label]) => `
    <button class="tab-item ${S.view === k ? 'active' : ''}" onclick="App.setView('${k}')">
      <div class="tab-ring"></div>
      <div class="tab-label">${label}</div>
    </button>
  `).join('');
}

// ---- loading / auth ----
function loadingScreen() {
  return `<div class="center-screen"><div class="spinner"></div></div>`;
}

function authScreen() {
  const isSignup = S.authMode === 'signup';
  return `
  <div class="center-screen">
    <div class="auth-card">
      ${!CONFIGURED ? `<div class="auth-msg err" style="margin-bottom:16px">Supabase isn't configured yet — set SUPABASE_URL and SUPABASE_ANON_KEY at the bottom of index.html's &lt;head&gt; (see README).</div>` : ''}
      <div class="label-sm" style="margin-bottom:8px">Capacity Tracker</div>
      <div class="auth-title">${isSignup ? 'Create account' : 'Welcome back'}</div>
      <div class="auth-sub">${isSignup ? 'Sign up to start logging sessions.' : 'Sign in to continue.'}</div>
      ${isSignup ? `<label class="field-label">Full name</label><input class="field" id="authName" placeholder="Your name" autocomplete="name">` : ''}
      <label class="field-label">Email</label>
      <input class="field" id="authEmail" type="email" placeholder="you@example.com" autocomplete="email">
      <label class="field-label">Password</label>
      <input class="field" id="authPw" type="password" placeholder="Password" autocomplete="${isSignup ? 'new-password' : 'current-password'}">
      ${isSignup ? `<div class="pw-hint">At least 6 characters.</div>` : ''}
      <button class="btn-primary" id="authBtn" ${S.authBusy ? 'disabled' : ''}>${S.authBusy ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Create Account' : 'Sign In')}</button>
      ${S.authError ? `<div class="auth-msg err">${esc(S.authError)}</div>` : ''}
      ${S.authOk ? `<div class="auth-msg ok">${esc(S.authOk)}</div>` : ''}
      <button class="btn-text" id="authToggle">${isSignup ? 'Already have an account? Sign in' : "Don't have an account? Create one"}</button>
    </div>
  </div>`;
}
function attachAuthEvents() {
  const btn = document.getElementById('authBtn');
  const toggle = document.getElementById('authToggle');
  if (btn) btn.onclick = submitAuth;
  if (toggle) toggle.onclick = () => { S.authMode = S.authMode === 'signin' ? 'signup' : 'signin'; S.authError = ''; S.authOk = ''; render(); };
  ['authEmail', 'authPw', 'authName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onkeydown = (e) => { if (e.key === 'Enter') submitAuth(); };
  });
}
async function submitAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const pw = document.getElementById('authPw').value;
  const isSignup = S.authMode === 'signup';
  const name = isSignup ? document.getElementById('authName').value.trim() : '';
  S.authError = ''; S.authOk = '';
  if (!email || !pw) { S.authError = 'Please fill in all fields.'; render(); attachAuthEvents(); return; }
  if (isSignup && pw.length < 6) { S.authError = 'Password must be at least 6 characters.'; render(); attachAuthEvents(); return; }
  S.authBusy = true; render(); attachAuthEvents();
  try {
    if (isSignup) {
      const { error } = await sb.auth.signUp({ email, password: pw, options: { data: { full_name: name } } });
      if (error) throw error;
      S.authOk = 'Account created! Check your email to confirm, then sign in.';
      S.authMode = 'signin';
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
    }
  } catch (err) {
    S.authError = err.message || 'Something went wrong.';
  } finally {
    S.authBusy = false; render(); attachAuthEvents();
  }
}
async function signOut() { await sb.auth.signOut(); }

// ---- data loading ----
async function loadProfile() {
  const { data } = await sb.from('profiles').select('full_name,bodyweight_kg').eq('id', S.user.id).maybeSingle();
  if (data) { S.fullName = data.full_name || ''; S.bodyweight = +data.bodyweight_kg || 80; }
}
async function loadProgram() {
  const { data, error } = await sb.from('program_days')
    .select('id,name,sort_order,program_exercises(id,name,sets,rep_lo,rep_hi,base_weight,increment,per_leg,bodyweight,sort_order)')
    .order('sort_order');
  if (error) { console.error(error); return; }
  S.days = (data || []).map(d => ({
    id: d.id, name: d.name, sort_order: d.sort_order,
    exercises: (d.program_exercises || []).slice().sort((a, b) => a.sort_order - b.sort_order),
  }));
}
async function seedDefaultProgramIfEmpty() {
  if (S.days.length) return;
  for (let i = 0; i < DEFAULT_PROGRAM.length; i++) {
    const day = DEFAULT_PROGRAM[i];
    const { data: dayRow, error } = await sb.from('program_days').insert({ user_id: S.user.id, name: day.name, sort_order: i }).select().single();
    if (error) { console.error(error); continue; }
    const rows = day.exercises.map((ex, j) => ({
      user_id: S.user.id, day_id: dayRow.id, name: ex.name, sets: ex.sets, rep_lo: ex.rep_lo, rep_hi: ex.rep_hi,
      base_weight: ex.base_weight, increment: ex.increment, per_leg: !!ex.per_leg, bodyweight: !!ex.bodyweight, sort_order: j,
    }));
    await sb.from('program_exercises').insert(rows);
  }
  await loadProgram();
}
async function loadSessions() {
  const { data, error } = await sb.from('sessions')
    .select('id,day_id,day_name,performed_at,session_entries(id,exercise_id,exercise_name,per_leg,bodyweight,rpe,note,sort_order,session_sets(set_num,weight,reps))')
    .order('performed_at');
  if (error) { console.error(error); return; }
  S.sessions = (data || []).map(s => ({
    id: s.id, day_id: s.day_id, day_name: s.day_name, performed_at: s.performed_at,
    entries: (s.session_entries || []).slice().sort((a, b) => a.sort_order - b.sort_order).map(e => ({
      id: e.id, exercise_id: e.exercise_id, exercise_name: e.exercise_name, per_leg: e.per_leg, bodyweight: e.bodyweight,
      rpe: e.rpe, note: e.note,
      sets: (e.session_sets || []).slice().sort((a, b) => a.set_num - b.set_num).map(x => ({ set_num: x.set_num, weight: +x.weight, reps: +x.reps })),
    })),
  }));
}
async function loadAll() {
  await Promise.all([loadProfile(), loadProgram()]);
  await seedDefaultProgramIfEmpty();
  await loadSessions();
}
async function reloadProgram() { await loadProgram(); render(); }
async function reloadSessions() { await loadSessions(); }

// ---- boot / auth state ----
sb.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    const isNewSignIn = !S.user || S.user.id !== session.user.id;
    S.user = session.user;
    if (isNewSignIn) {
      S.loading = true; render();
      await loadAll();
      S.loading = false;
    }
    render();
  } else {
    S.user = null; S.days = []; S.sessions = []; S.view = 'today'; S.active = null; S.loading = false;
    render(); attachAuthEvents();
  }
});
(async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { S.loading = false; render(); attachAuthEvents(); }
})();

// ---- view: today ----
function viewToday() {
  const nd = nextDayIndex();
  const day = S.days[nd];
  const week = currentWeekIndex();
  const doneThisWeek = S.sessions.filter(s => weekIndexOf(s.performed_at) === week);

  let nextCard = '';
  if (day) {
    const shortNames = day.exercises.map(e => e.name.replace(/^Dumbbell /, 'DB ').replace(/^Barbell /, 'BB '));
    nextCard = `
      <div class="card">
        <div class="card-row"><div class="dot"></div><div class="accent-label">Capacity · Week ${week}</div></div>
        <div class="next-name">${esc(day.name)}</div>
        <div class="next-sub">${day.exercises.length} exercises · ${day.exercises.reduce((a, e) => a + e.sets, 0)} working sets · ~50 min</div>
        <div class="tag-row">${shortNames.map(n => `<div class="tag-pill">${esc(n)}</div>`).join('')}</div>
        <button class="cta" onclick="App.startSession('${day.id}')">Start session <span style="font-size:15px">→</span></button>
      </div>`;
  } else {
    nextCard = `
      <div class="empty">
        <div class="big">🏋️</div>
        <p>No program set up yet.<br><a onclick="App.setView('settings')">Add your first day</a> to get started.</p>
      </div>`;
  }

  const weekDaysHtml = S.days.map(d => {
    const done = doneThisWeek.some(s => s.day_id === d.id);
    return `
      <button class="day-row" onclick="App.startSession('${d.id}')">
        <div class="day-tick" style="border-color:${done ? SAGE : BORDER};background:${done ? SAGE : 'transparent'}">${done ? '✓' : ''}</div>
        <div class="day-body">
          <div class="day-name">${esc(d.name)}</div>
          <div class="day-sub">${d.exercises.map(e => e.name.split(' ')[0]).slice(0, 3).join(' · ')}</div>
        </div>
        <div class="day-right">${done ? 'Logged' : 'Start →'}</div>
      </button>`;
  }).join('');

  return `
    <div class="top-row">
      <div>
        <div class="label-sm">${esc(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
        <div class="next-name title-serif" style="font-size:40px;margin-top:4px">${greeting()}</div>
      </div>
      <div class="avatar">${esc(initials())}</div>
    </div>

    ${nextCard}

    <div class="stat-grid">
      <div class="stat-card"><div class="lab">Streak</div><div class="stat-num-row"><div class="stat-num">${streakWeeks()}</div><div class="stat-unit">weeks</div></div></div>
      <div class="stat-card"><div class="lab">Logged</div><div class="stat-num-row"><div class="stat-num">${S.sessions.length}</div><div class="stat-unit">sessions</div></div></div>
    </div>

    ${S.days.length ? `
    <div class="section-head"><div class="label-sm">This week</div><div class="section-sub">${doneThisWeek.length} of ${S.days.length} done</div></div>
    <div>${weekDaysHtml}</div>` : ''}

    <div class="note-card">
      <div class="note-title">Training tip</div>
      <div class="note-body">Add a rep every session until you reach the top of the range, then add weight and return to the bottom. If you stall for several sessions, consider dropping the weight back a step.</div>
    </div>
  `;
}

// ---- view: progress ----
function viewProgress() {
  function volOf(s) {
    return s.entries.reduce((a, e) => a + e.sets.reduce((b, r) => b + ((e.bodyweight ? S.bodyweight : 0) + (+r.weight || 0)) * (+r.reps || 0), 0), 0);
  }
  const byWeek = {};
  S.sessions.forEach(s => { const w = weekIndexOf(s.performed_at); byWeek[w] = (byWeek[w] || 0) + volOf(s); });
  const wks = Object.keys(byWeek).map(Number).sort((a, b) => a - b).slice(-6);
  const maxV = Math.max(...wks.map(w => byWeek[w]), 1);
  const week = currentWeekIndex();
  const thisWeekVol = byWeek[week] || byWeek[wks[wks.length - 1]] || 0;
  const prevVol = byWeek[wks[wks.length - 2]] || 0;
  const volumeDelta = prevVol ? (thisWeekVol >= prevVol ? '+' : '') + Math.round((thisWeekVol - prevVol) / prevVol * 100) + '% vs last' : '—';

  const volBars = wks.length ? wks.map(w => `
    <div class="col">
      <div class="bar ${w === wks[wks.length - 1] ? 'now' : ''}" style="height:${Math.max(6, Math.round(byWeek[w] / maxV * 84))}px"></div>
      <div class="lab">W${w}</div>
    </div>`).join('') : `<div style="width:100%;text-align:center;color:var(--faint);font-size:13px;padding-top:30px">No sessions logged yet</div>`;

  const liftCards = allExercises().map(ex => {
    const ser = seriesFor(ex.id);
    if (!ser.length) return '';
    const cur = ser[ser.length - 1], first = ser[0];
    const curTop = topSetOf(cur.rows), firstTop = topSetOf(first.rows);
    const dw = num(curTop.weight - firstTop.weight);
    const mx = Math.max(...ser.map(x => (ex.bodyweight ? S.bodyweight : 0) + topSetOf(x.rows).weight), 1);
    const avgReps = Math.round(cur.rows.reduce((a, r) => a + (+r.reps || 0), 0) / cur.rows.length);
    const spark = ser.slice(-6).map(x => {
      const h = Math.max(5, Math.round(((ex.bodyweight ? S.bodyweight : 0) + topSetOf(x.rows).weight) / mx * 26));
      return `<div style="height:${h}px"></div>`;
    }).join('');
    const dots = Array.from({ length: Math.max(1, ex.rep_hi - ex.rep_lo + 1) }, (_, i) => {
      const on = ex.rep_lo + i <= avgReps;
      return `<div class="d" style="background:${on ? ACC : BORDER}"></div>`;
    }).join('');
    return `
      <div class="lift-card" onclick="App.openDetail('${ex.id}')">
        <div class="lift-top">
          <div>
            <div class="lift-name-row"><div class="lift-name">${esc(ex.name)}</div>${cur.isPR ? '<div class="badge">PR</div>' : ''}</div>
            <div class="lift-cur">${fmtWeight(ex, curTop.weight)} × ${ex.sets}×${avgReps}${ex.per_leg ? ' / leg' : ''}</div>
          </div>
          <div>
            <div class="lift-delta" style="color:${dw > 0 ? SAGE : MUT}">${dw > 0 ? '+' : ''}${trimNum(dw)}kg</div>
            <div class="lift-delta-sub">since first log</div>
          </div>
        </div>
        <div class="spark-row">
          <div class="spark">${spark}</div>
          <div class="dots-row">${dots}<div class="range-label">${avgReps}/${ex.rep_hi} reps</div></div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="label-sm">Capacity block</div>
    <div class="next-name title-serif" style="font-size:40px;margin:4px 0 20px">Progress</div>
    <div class="card">
      <div class="card-row" style="justify-content:space-between;margin-bottom:0">
        <div class="label-sm">Weekly volume</div>
        <div style="font-size:12.5px;color:${ACC};font-weight:600">${volumeDelta}</div>
      </div>
      <div class="stat-num-row" style="margin-top:8px"><div style="font-size:34px;font-weight:600;letter-spacing:-.025em">${nf(thisWeekVol)}</div><div class="stat-unit">kg lifted this week</div></div>
      <div class="vol-bars">${volBars}</div>
    </div>
    <div class="section-head" style="margin:26px 0 12px"><div class="label-sm">Lift by lift</div></div>
    ${liftCards || `<div class="empty"><p>Log a session to start tracking progress.</p></div>`}
  `;
}

// ---- view: records ----
function viewRecords() {
  const allEx = allExercises();
  const recentIds = {};
  S.sessions.slice(-3).forEach(s => s.entries.forEach(e => { recentIds[e.exercise_id] = s.id; }));
  const recs = allEx.map(ex => {
    const ser = seriesFor(ex.id);
    if (!ser.length) return null;
    let bi = 0; ser.forEach((x, i) => { if (x.orm > ser[bi].orm) bi = i; });
    const b = ser[bi];
    const topRow = topSetOf(b.rows);
    const firstTop = topSetOf(ser[0].rows), lastTop = topSetOf(ser[ser.length - 1].rows);
    const gain = num(lastTop.weight - firstTop.weight);
    return {
      ex, at: new Date(b.session.performed_at).getTime(),
      fresh: bi === ser.length - 1 && ser.length > 1 && b.session.id === recentIds[ex.id],
      when: 'Week ' + weekIndexOf(b.session.performed_at) + ' · ' + dfmt(b.session.performed_at),
      best: fmtWeight(ex, topRow.weight), reps: b.entry.sets.length + ' × ' + topRow.reps + (ex.per_leg ? ' / leg' : ''),
      ormTxt: nf(b.orm) + ' kg', volTxt: nf(Math.max(...ser.map(x => x.vol))) + ' kg',
      gain, gainTxt: (gain > 0 ? '+' : '') + trimNum(gain) + ' kg',
    };
  }).filter(Boolean).sort((a, b) => (b.fresh - a.fresh) || (b.at - a.at));
  const latest = recs[0];
  const prCount = recs.filter(r => r.fresh).length;

  const recRows = recs.map(r => `
    <div class="rec-card" style="background:${r.fresh ? '#FDF6E9' : 'var(--card)'};border-color:${r.fresh ? '#EBD8B4' : 'transparent'}" onclick="App.openDetail('${r.ex.id}')">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="flex:1">
          <div class="lift-name-row"><div class="lift-name">${esc(r.ex.name)}</div>${r.fresh ? '<div class="badge">NEW</div>' : ''}</div>
          <div class="rec-when">${r.when}</div>
        </div>
        <div><div class="rec-best">${r.best}</div><div class="rec-reps">${r.reps}</div></div>
      </div>
      <div class="rec-foot">
        <div class="f"><div class="lab">Est. 1RM</div><div class="val">${r.ormTxt}</div></div>
        <div class="f"><div class="lab">Best volume</div><div class="val">${r.volTxt}</div></div>
        <div class="f"><div class="lab">Gain</div><div class="val" style="color:${r.gain > 0 ? SAGE : MUT}">${r.gainTxt}</div></div>
      </div>
    </div>`).join('');

  return `
    <div class="label-sm">Personal records</div>
    <div class="next-name title-serif" style="font-size:40px;margin:4px 0 18px">Records</div>
    <div class="stat-grid" style="margin-bottom:22px">
      <div class="stat-card dark"><div class="lab">Set recently</div><div class="stat-num-row"><div class="stat-num">${prCount}</div><div class="stat-unit">records</div></div></div>
      <div class="stat-card"><div class="lab">Latest</div><div style="font-size:15px;font-weight:600;margin-top:7px;line-height:1.2">${latest ? esc(latest.ex.name) : '—'}</div><div style="font-size:12px;color:var(--muted);margin-top:2px">${latest ? latest.best + ' × ' + latest.reps.split(' × ')[1] : ''}</div></div>
    </div>
    <div class="label-sm" style="margin-bottom:12px">Best per lift</div>
    ${recRows || `<div class="empty"><p>No records yet — log a session to set your first.</p></div>`}
  `;
}

// ---- view: history ----
function viewHistory() {
  const rows = [...S.sessions].reverse().map(s => {
    const vol = s.entries.reduce((a, e) => a + e.sets.reduce((b, r) => b + ((e.bodyweight ? S.bodyweight : 0) + (+r.weight || 0)) * (+r.reps || 0), 0), 0);
    const setCount = s.entries.reduce((a, e) => a + e.sets.length, 0);
    const open = S.openHistoryId === s.id;
    const lines = s.entries.map(e => {
      const topRow = e.sets.length ? topSetOf(e.sets) : { weight: 0, reps: 0 };
      return `<div class="hist-line"><div class="n">${esc(e.exercise_name)}</div><div class="v">${e.sets.length} × ${topRow.reps} @ ${fmtWeight(e, topRow.weight)}</div></div>`;
    }).join('');
    return `
      <div class="hist-card">
        <div class="hist-top" onclick="App.toggleHistory('${s.id}')">
          <div style="flex:1">
            <div class="hist-title">Week ${weekIndexOf(s.performed_at)} · ${esc(s.day_name)}</div>
            <div class="hist-sub">${dfmt(s.performed_at)} · ${nf(vol)} kg · ${setCount} sets</div>
          </div>
          <div class="hist-chev">${open ? '▲' : '▼'}</div>
        </div>
        ${open ? `<div class="hist-lines">${lines}</div><button class="hist-del" onclick="App.deleteSession('${s.id}')">Delete this session</button>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="label-sm">Every session</div>
    <div class="next-name title-serif" style="font-size:40px;margin:4px 0 20px">History</div>
    ${rows || `<div class="empty"><p>Nothing logged yet.</p></div>`}
  `;
}

function toggleHistory(id) { S.openHistoryId = S.openHistoryId === id ? null : id; render(); }
async function deleteSession(id) {
  if (!confirm('Delete this session? This cannot be undone.')) return;
  await sb.from('sessions').delete().eq('id', id);
  S.openHistoryId = null;
  await reloadSessions();
  render();
}

// ---- exercise detail overlay ----
function openDetail(id) { S.detailExerciseId = id; S.detailPick = null; S.detailAll = false; S.detailAnim = true; render(); }
function closeDetail() { S.detailExerciseId = null; render(); }
function pickDetailIdx(i) { S.detailPick = i; render(); }
function toggleDetailRange() { S.detailAll = !S.detailAll; render(); }

function detailOverlay() {
  const ex = exerciseById(S.detailExerciseId);
  const ser = seriesFor(S.detailExerciseId);
  if (!ex || !ser.length) return '';
  const selIdx = S.detailPick != null ? Math.min(S.detailPick, ser.length - 1) : ser.length - 1;
  const sel = ser[selIdx], prevS = selIdx > 0 ? ser[selIdx - 1] : null;
  const shown = S.detailAll ? ser : ser.slice(-4);
  const chartSet = S.detailAll ? ser : ser.slice(-6);
  const mx = Math.max(...chartSet.map(x => x.orm), 1);
  const dayIdx = S.days.findIndex(d => d.exercises.some(e => e.id === ex.id));
  const bestOrm = Math.max(...ser.map(x => x.orm));
  const bestEntry = ser.find(x => x.orm === bestOrm);
  const bestTop = topSetOf(bestEntry.rows);
  const firstTop = topSetOf(ser[0].rows), lastTop = topSetOf(ser[ser.length - 1].rows);
  const gain = num(lastTop.weight - firstTop.weight);

  const chart = chartSet.map(x => {
    const i = ser.indexOf(x);
    const h = Math.max(6, Math.round(x.orm / mx * 56));
    const color = i === selIdx ? INK : (x.isPR ? ACC : BORDER);
    const labelColor = i === selIdx ? INK : FAINT;
    const top = topSetOf(x.rows);
    return `<button class="col" onclick="App.pickDetailIdx(${i})">
      <div class="top" style="color:${labelColor}">${trimNum((ex.bodyweight ? S.bodyweight : 0) + top.weight)}</div>
      <div class="bar" style="background:${color};height:${h}px"></div>
      <div class="lab" style="color:${labelColor}">W${weekIndexOf(x.session.performed_at)}</div>
    </button>`;
  }).join('');

  const chips = shown.map(x => {
    const i = ser.indexOf(x);
    const on = i === selIdx;
    return `<button class="chip" style="background:${on ? INK : '#EBE2D2'};color:${on ? '#FBF7F0' : '#6E6357'}" onclick="App.pickDetailIdx(${i})">
      Week ${weekIndexOf(x.session.performed_at)}
      ${x.isPR && i > 0 ? `<div class="chip-dot" style="background:${on ? GOLD : ACC}"></div>` : ''}
    </button>`;
  }).join('');

  const rows = [...ser].reverse().map(x => {
    const i = ser.indexOf(x), p = i > 0 ? ser[i - 1] : null;
    const topX = topSetOf(x.rows), topP = p ? topSetOf(p.rows) : null;
    const dw = p ? num(topX.weight - topP.weight) : 0;
    const dr = p ? Math.round(x.rows.reduce((a, r) => a + r.reps, 0) / x.rows.length) - Math.round(p.rows.reduce((a, r) => a + r.reps, 0) / p.rows.length) : 0;
    const avgReps = Math.round(x.rows.reduce((a, r) => a + r.reps, 0) / x.rows.length);
    const delta = !p ? 'start' : dw ? (dw > 0 ? '+' : '') + trimNum(dw) + 'kg' : dr ? (dr > 0 ? '+' : '') + dr + ' rep' : '—';
    const deltaColor = !p ? FAINT : (dw > 0 || dr > 0) ? SAGE : FAINT;
    return `<div class="week-row" style="background:${i === selIdx ? '#FFF9EF' : 'var(--card)'};border-color:${i === selIdx ? '#E4D8C2' : 'transparent'}" onclick="App.pickDetailIdx(${i})">
      <div style="width:58px;font-size:13px;font-weight:600;color:#6E6357">Week ${weekIndexOf(x.session.performed_at)}</div>
      <div style="flex:1;font-size:14.5px;font-weight:600;font-variant-numeric:tabular-nums">${fmtWeight(ex, topX.weight)} × ${x.entry.sets.length}×${avgReps}</div>
      ${x.isPR && i > 0 ? `<div style="font-size:9.5px;font-weight:700;letter-spacing:.09em;color:${ACC}">PR</div>` : ''}
      <div style="width:52px;text-align:right;font-size:13px;font-weight:600;color:${deltaColor}">${delta}</div>
    </div>`;
  }).join('');

  const selTop = topSetOf(sel.rows);
  const selAvgReps = Math.round(sel.rows.reduce((a, r) => a + r.reps, 0) / sel.rows.length);
  const selSets = sel.rows.map((r, i) => `
    <div class="sel-set-row" style="background:${i % 2 ? '#FBF7EF' : '#F4EDE0'}">
      <div style="width:30px;font-size:13px;font-weight:600;color:var(--label);font-variant-numeric:tabular-nums">${i + 1}</div>
      <div style="flex:1;font-size:14.5px;font-weight:600;font-variant-numeric:tabular-nums">${fmtWeight(ex, r.weight)}</div>
      <div style="width:56px;font-size:14.5px;font-weight:600;font-variant-numeric:tabular-nums">${r.reps}</div>
      <div style="width:60px;text-align:right;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums">${nf(((ex.bodyweight ? S.bodyweight : 0) + r.weight) * r.reps)} kg</div>
    </div>`).join('');
  const selDelta = prevS ? (sel.vol >= prevS.vol ? '+' : '') + Math.round((sel.vol - prevS.vol) / Math.max(prevS.vol, 1) * 100) + '%' : 'first';
  const selDeltaColor = prevS && sel.vol > prevS.vol ? SAGE : MUT;

  return `
  <div class="overlay ${S.detailAnim ? 'entering' : ''}"><div class="overlay-inner">
    <div class="ov-head">
      <div class="ov-head-row">
        <button class="back-btn" onclick="App.closeDetail()">←</button>
        <div style="flex:1">
          <div class="label-sm">Capacity · Day ${dayIdx + 1} · ${ex.rep_lo}–${ex.rep_hi} reps</div>
          <div class="next-name title-serif" style="font-size:27px;line-height:1.12;margin-top:2px">${esc(ex.name)}</div>
        </div>
      </div>
    </div>
    <div class="ov-scroll">
      <div class="card">
        <div class="det-stat-row">
          <div class="det-stat"><div class="lab">Best</div><div class="val">${fmtWeight(ex, bestTop.weight)} × ${bestTop.reps}</div></div>
          <div class="det-stat"><div class="lab">Est. 1RM</div><div class="val">${nf(bestOrm)} kg</div></div>
          <div class="det-stat"><div class="lab">Gain</div><div class="val" style="color:${gain > 0 ? SAGE : MUT}">${gain > 0 ? '+' : ''}${trimNum(gain)} kg</div></div>
        </div>
        <div class="det-chart">${chart}</div>
      </div>

      <div class="section-head" style="margin:24px 0 11px">
        <div class="label-sm">Select a week</div>
        <div style="font-size:12.5px;font-weight:600;color:${ACC};cursor:pointer" onclick="App.toggleDetailRange()">${S.detailAll ? 'Recent only' : 'All ' + ser.length + ' weeks'}</div>
      </div>
      <div class="chip-row">${chips}</div>

      <div class="sel-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div>
            <div style="font-size:16.5px;font-weight:600">Week ${weekIndexOf(sel.session.performed_at)} · ${esc(sel.session.day_name)}</div>
            <div style="font-size:12.5px;color:var(--muted);margin-top:2px">${dfmt(sel.session.performed_at)} · ${sel.rows.length} sets</div>
          </div>
          ${sel.isPR && selIdx > 0 ? '<div class="badge">PR</div>' : ''}
        </div>
        <div class="sel-set-headers"><div style="width:30px">Set</div><div style="flex:1">Weight</div><div style="width:56px">Reps</div><div style="width:60px;text-align:right">Volume</div></div>
        ${selSets}
        <div class="sel-stat-row">
          <div class="sel-stat"><div class="lab" style="font-size:10.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--faint)">Volume</div><div style="font-size:16px;font-weight:600;margin-top:2px">${nf(sel.vol)} kg</div></div>
          <div class="sel-stat"><div class="lab" style="font-size:10.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--faint)">RPE</div><div style="font-size:16px;font-weight:600;margin-top:2px">${sel.entry.rpe || '—'}</div></div>
          <div class="sel-stat"><div class="lab" style="font-size:10.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--faint)">vs prev</div><div style="font-size:16px;font-weight:600;margin-top:2px;color:${selDeltaColor}">${selDelta}</div></div>
        </div>
        ${sel.entry.note ? `<div class="sel-note">${esc(sel.entry.note)}</div>` : ''}
      </div>

      <div class="label-sm" style="margin:24px 0 11px">Week by week</div>
      <div>${rows}</div>
    </div>
  </div></div>`;
}

// ---- session flow ----
function startSession(dayId) {
  const day = S.days.find(d => d.id === dayId);
  if (!day || !day.exercises.length) { alert('Add exercises to this day in Settings first.'); return; }
  const log = {};
  day.exercises.forEach(ex => {
    log[ex.id] = { sets: Array.from({ length: ex.sets }, () => ({ w: '', r: '', done: false })), sug: suggestFor(ex), rpe: null, note: '' };
  });
  S.active = { dayId, dayName: day.name, log };
  S.expanded = day.exercises[0].id;
  S.elapsed = 0;
  S.sessionAnim = true;
  startTimer();
  render();
}
function startTimer() {
  stopTimer();
  S.timerHandle = setInterval(() => {
    S.elapsed++;
    const el = document.getElementById('sessionClock');
    if (el) el.textContent = fmtClock(S.elapsed);
  }, 1000);
}
function stopTimer() { if (S.timerHandle) clearInterval(S.timerHandle); S.timerHandle = null; }
function exitSession() {
  if (!confirm('Discard this session? Your entries will be lost.')) return;
  S.active = null; stopTimer(); render();
}
function toggleExpand(exId) { S.expanded = S.expanded === exId ? null : exId; render(); }
function setField(exId, idx, key, val) { S.active.log[exId].sets[idx][key] = val; }
function setNote(exId, val) { S.active.log[exId].note = val; }
function toggleSetDone(exId, idx) {
  const L = S.active.log[exId];
  const s = L.sets[idx];
  s.done = !s.done;
  if (s.done) {
    if (s.w === '') s.w = String(L.sug.weight);
    if (s.r === '') s.r = String(L.sug.reps);
  }
  render();
}
function pickRpe(exId, n) { S.active.log[exId].rpe = n; render(); }

function sessionOverlay() {
  const day = S.days.find(d => d.id === S.active.dayId);
  if (!day) return '';
  const log = S.active.log;
  let total = 0, filled = 0;
  day.exercises.forEach(ex => log[ex.id].sets.forEach(s => { total++; if (s.done) filled++; }));
  const week = currentWeekIndex();
  const pct = total ? Math.round(filled / total * 100) : 0;
  const finishBg = filled === total ? ACC : INK;
  const finishLabel = filled === total ? 'Finish session' : `Finish session · ${filled}/${total}`;

  const exercisesHtml = day.exercises.map((ex, i) => {
    const L = log[ex.id];
    const allDone = L.sets.every(s => s.done);
    const open = S.expanded === ex.id;
    const setsHtml = L.sets.map((s, j) => `
      <div class="set-row">
        <div class="set-num">${j + 1}</div>
        <div class="set-input-wrap">
          <input class="set-input ${s.done ? 'filled' : ''}" type="text" inputmode="decimal" value="${esc(s.w)}"
            oninput="App.setField('${ex.id}',${j},'w',this.value)"
            placeholder="${ex.bodyweight ? (L.sug.weight || 'BW') : trimNum(L.sug.weight)}">
          <div class="unit-suffix">kg</div>
        </div>
        <div style="flex:1">
          <input class="set-input ${s.done ? 'filled' : ''}" type="text" inputmode="numeric" value="${esc(s.r)}"
            oninput="App.setField('${ex.id}',${j},'r',this.value)"
            placeholder="${L.sug.reps}">
        </div>
        <button class="done-btn ${s.done ? 'on' : ''}" onclick="App.toggleSetDone('${ex.id}',${j})">✓</button>
      </div>`).join('');
    const rpes = [6, 7, 8, 9, 10].map(n => `<button class="rpe-pill ${L.rpe === n ? 'on' : ''}" onclick="App.pickRpe('${ex.id}',${n})">${n}</button>`).join('');
    return `
      <div class="ex-card ${allDone ? 'done' : ''} ${open ? 'open' : ''}">
        <div class="ex-top" onclick="App.toggleExpand('${ex.id}')">
          <div class="ex-badge ${allDone ? 'done' : ''}">${allDone ? '✓' : i + 1}</div>
          <div style="flex:1">
            <div class="ex-name">${esc(ex.name)}</div>
            <div class="ex-prescription">${ex.sets} × ${ex.rep_lo}→${ex.rep_hi} reps${ex.per_leg ? ' per leg' : ''}</div>
          </div>
          <div class="ex-chev">${open ? '▲' : '▼'}</div>
        </div>
        ${open ? `
        <div>
          <div class="hint-row"><div class="hint-tag">HINT</div><div class="hint-text">${esc(fmtWeight(ex, L.sug.weight) + ' × ' + ex.sets + '×' + L.sug.reps + ' — ' + L.sug.why)}</div></div>
          <div class="set-headers"><div style="width:26px">Set</div><div style="flex:1">Weight</div><div style="flex:1">Reps</div><div style="width:34px"></div></div>
          ${setsHtml}
          <div class="rpe-row"><div class="rpe-label">RPE</div><div class="rpe-pills">${rpes}</div></div>
          <input class="note-input" type="text" value="${esc(L.note)}" oninput="App.setNote('${ex.id}',this.value)" placeholder="Add a note…">
        </div>` : ''}
      </div>`;
  }).join('');

  return `
  <div class="overlay ${S.sessionAnim ? 'entering' : ''}"><div class="overlay-inner">
    <div class="ov-head">
      <div class="ov-head-row" style="align-items:center">
        <button class="back-btn" onclick="App.exitSession()">←</button>
        <div style="flex:1">
          <div style="font-size:16.5px;font-weight:600;line-height:1.2">Capacity · ${esc(day.name)}</div>
          <div style="font-size:12.5px;color:var(--muted)">Week ${week} · ${filled}/${total} sets</div>
        </div>
        <div id="sessionClock" style="font-size:13px;font-weight:600;color:${ACC};font-variant-numeric:tabular-nums">${fmtClock(S.elapsed)}</div>
      </div>
      <div class="sess-progress"><div class="sess-progress-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="ov-scroll" style="padding-bottom:100px">${exercisesHtml}</div>
    <div class="sess-foot">
      <button class="finish-btn" style="background:${finishBg}" onclick="App.finishSession()">${finishLabel}</button>
    </div>
  </div></div>`;
}

async function finishSession() {
  const day = S.days.find(d => d.id === S.active.dayId);
  const log = S.active.log;
  stopTimer();

  const prevBest = {};
  day.exercises.forEach(ex => { const ser = seriesFor(ex.id); prevBest[ex.id] = ser.length ? Math.max(...ser.map(x => x.orm)) : 0; });

  const { data: sessionRow, error: sErr } = await sb.from('sessions')
    .insert({ user_id: S.user.id, day_id: day.id, day_name: day.name, performed_at: new Date().toISOString() })
    .select().single();
  if (sErr) { alert('Could not save session: ' + sErr.message); startTimer(); return; }

  const doneEntries = [];
  for (let i = 0; i < day.exercises.length; i++) {
    const ex = day.exercises[i];
    const L = log[ex.id];
    const setRows = L.sets.map((s, j) => ({
      set_num: j + 1,
      weight: s.w !== '' ? Math.max(0, +s.w || 0) : L.sug.weight,
      reps: s.r !== '' ? Math.max(0, +s.r || 0) : (s.done ? L.sug.reps : 0),
    }));
    const { data: entryRow, error: eErr } = await sb.from('session_entries')
      .insert({ user_id: S.user.id, session_id: sessionRow.id, exercise_id: ex.id, exercise_name: ex.name, per_leg: !!ex.per_leg, bodyweight: !!ex.bodyweight, rpe: L.rpe, note: L.note || null, sort_order: i })
      .select().single();
    if (eErr) { console.error(eErr); continue; }
    const setPayload = setRows.map(r => ({ user_id: S.user.id, entry_id: entryRow.id, set_num: r.set_num, weight: r.weight, reps: r.reps }));
    await sb.from('session_sets').insert(setPayload);
    doneEntries.push({ ex, sets: setRows });
  }

  const load = (ex, r) => (ex.bodyweight ? S.bodyweight : 0) + r.weight;
  const vol = doneEntries.reduce((a, e) => a + e.sets.reduce((b, r) => b + load(e.ex, r) * r.reps, 0), 0);
  const setsCount = doneEntries.reduce((a, e) => a + e.sets.length, 0);
  const prs = doneEntries.map(e => {
    const o = Math.max(...e.sets.map(r => orm(load(e.ex, r), r.reps)));
    if (o <= (prevBest[e.ex.id] || 0) + 0.01) return null;
    const top = topSetOf(e.sets);
    return { name: e.ex.name, val: fmtWeight(e.ex, top.weight) + ' × ' + top.reps };
  }).filter(Boolean);

  S.active = null;
  S.showDone = true;
  S.doneData = { name: day.name, vol, sets: setsCount, prs };
  await reloadSessions();
  render();
}

function closeDone() { S.showDone = false; S.doneData = null; S.view = 'progress'; render(); }
function doneSheet() {
  const d = S.doneData;
  const prsHtml = d.prs.length ? `<div style="margin-top:16px">${d.prs.map(p => `
    <div class="pr-row"><div class="pr-tag">PR</div><div class="pr-name">${esc(p.name)}</div><div class="pr-val">${esc(p.val)}</div></div>`).join('')}</div>` : '';
  const summary = d.prs.length ? `${esc(d.name)} complete — ${d.prs.length} new record${d.prs.length > 1 ? 's' : ''}.` : `${esc(d.name)} complete. Nice work.`;
  return `
  <div class="sheet-backdrop">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="auth-title">Session logged</div>
      <div style="font-size:14.5px;color:var(--muted);margin-top:6px">${summary}</div>
      ${prsHtml}
      <div class="stat-grid" style="margin:20px 0 22px">
        <div class="stat-card"><div class="lab">Volume</div><div style="font-size:23px;font-weight:600;margin-top:4px">${nf(d.vol)} kg</div></div>
        <div class="stat-card"><div class="lab">Sets</div><div style="font-size:23px;font-weight:600;margin-top:4px">${d.sets}</div></div>
      </div>
      <button class="cta" onclick="App.closeDone()">Done</button>
    </div>
  </div>`;
}

// ---- settings / program editor ----
function setView(v) { S.view = v; render(); }

function viewSettings() {
  const daysHtml = S.days.map((d, i) => `
    <div class="set-day-card">
      <div class="set-day-head">
        <input class="set-day-name-input" value="${esc(d.name)}" onblur="App.renameDay('${d.id}',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
        <button class="icon-btn" onclick="App.moveDay('${d.id}',-1)" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>↑</button>
        <button class="icon-btn" onclick="App.moveDay('${d.id}',1)" ${i === S.days.length - 1 ? 'disabled style="opacity:.3"' : ''}>↓</button>
        <button class="icon-btn" onclick="App.deleteDay('${d.id}')">✕</button>
      </div>
      ${d.exercises.map(ex => `
        <div class="ex-list-row">
          <div class="info" onclick="App.openExerciseForm('${d.id}','${ex.id}')">
            <div class="nm">${esc(ex.name)}</div>
            <div class="meta">${ex.sets} × ${ex.rep_lo}–${ex.rep_hi} reps · ${trimNum(ex.base_weight)}kg start · +${trimNum(ex.increment)}kg${ex.per_leg ? ' · per leg' : ''}${ex.bodyweight ? ' · bodyweight' : ''}</div>
          </div>
        </div>`).join('')}
      <button class="add-ex-btn" onclick="App.openExerciseForm('${d.id}',null)">+ Add exercise</button>
    </div>`).join('');

  return `
    <div class="label-sm">Your setup</div>
    <div class="next-name title-serif" style="font-size:40px;margin:4px 0 20px">Settings</div>

    <div class="set-section">
      <div class="label-sm" style="margin-bottom:8px">Bodyweight</div>
      <div class="profile-row">
        <div style="font-size:13.5px;color:var(--muted)">Used for bodyweight-based exercises</div>
        <input type="text" inputmode="decimal" value="${trimNum(S.bodyweight)}" onchange="App.saveBodyweight(this.value)"> kg
      </div>
    </div>

    <div class="set-section">
      <div class="label-sm" style="margin-bottom:4px">Program</div>
      ${daysHtml}
      <button class="add-day-btn" onclick="App.addDay()">+ Add day</button>
    </div>

    <button class="signout-btn" onclick="App.signOut()">Sign out</button>
  `;
}

async function addDay() {
  const sort_order = S.days.length ? Math.max(...S.days.map(d => d.sort_order)) + 1 : 0;
  await sb.from('program_days').insert({ user_id: S.user.id, name: 'New day', sort_order });
  await reloadProgram();
}
async function renameDay(id, name) {
  name = name.trim();
  const day = S.days.find(d => d.id === id);
  if (!name || !day || day.name === name) { render(); return; }
  await sb.from('program_days').update({ name }).eq('id', id);
  await reloadProgram();
}
async function deleteDay(id) {
  if (!confirm('Delete this day and its exercises? Logged history for this day is kept.')) return;
  await sb.from('program_days').delete().eq('id', id);
  await reloadProgram();
}
async function moveDay(id, dir) {
  const idx = S.days.findIndex(d => d.id === id);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= S.days.length) return;
  const a = S.days[idx], b = S.days[swapIdx];
  await Promise.all([
    sb.from('program_days').update({ sort_order: b.sort_order }).eq('id', a.id),
    sb.from('program_days').update({ sort_order: a.sort_order }).eq('id', b.id),
  ]);
  await reloadProgram();
}
async function saveBodyweight(val) {
  const n = Math.max(1, +val || 80);
  S.bodyweight = n;
  await sb.from('profiles').update({ bodyweight_kg: n }).eq('id', S.user.id);
}

function openExerciseForm(dayId, exId) {
  if (exId) {
    const ex = exerciseById(exId);
    S.exerciseForm = { dayId, id: exId, name: ex.name, sets: ex.sets, rep_lo: ex.rep_lo, rep_hi: ex.rep_hi, base_weight: ex.base_weight, increment: ex.increment, per_leg: !!ex.per_leg, bodyweight: !!ex.bodyweight };
  } else {
    S.exerciseForm = { dayId, id: null, name: '', sets: 3, rep_lo: 8, rep_hi: 10, base_weight: 20, increment: 2.5, per_leg: false, bodyweight: false };
  }
  render();
}
function closeExerciseForm() { S.exerciseForm = null; render(); }
function setExField(key, val) { S.exerciseForm[key] = val; }
function toggleExField(key) { S.exerciseForm[key] = !S.exerciseForm[key]; render(); }

async function saveExerciseForm() {
  const f = S.exerciseForm;
  const name = (document.getElementById('exfName')?.value ?? f.name).trim();
  const sets = Math.max(1, +(document.getElementById('exfSets')?.value ?? f.sets) || 1);
  const rep_lo = Math.max(1, +(document.getElementById('exfRepLo')?.value ?? f.rep_lo) || 1);
  const rep_hi = Math.max(rep_lo, +(document.getElementById('exfRepHi')?.value ?? f.rep_hi) || rep_lo);
  const base_weight = Math.max(0, +(document.getElementById('exfBaseWeight')?.value ?? f.base_weight) || 0);
  const increment = Math.max(0.5, +(document.getElementById('exfIncrement')?.value ?? f.increment) || 2.5);
  if (!name) { alert('Give the exercise a name.'); return; }
  const payload = { name, sets, rep_lo, rep_hi, base_weight, increment, per_leg: f.per_leg, bodyweight: f.bodyweight };
  if (f.id) {
    await sb.from('program_exercises').update(payload).eq('id', f.id);
  } else {
    const day = S.days.find(d => d.id === f.dayId);
    const sort_order = day.exercises.length ? Math.max(...day.exercises.map(e => e.sort_order)) + 1 : 0;
    await sb.from('program_exercises').insert({ ...payload, user_id: S.user.id, day_id: f.dayId, sort_order });
  }
  S.exerciseForm = null;
  await reloadProgram();
}
async function deleteExerciseForm() {
  const f = S.exerciseForm;
  if (!f.id) { S.exerciseForm = null; render(); return; }
  if (!confirm('Delete this exercise? Logged history for it is kept.')) return;
  await sb.from('program_exercises').delete().eq('id', f.id);
  S.exerciseForm = null;
  await reloadProgram();
}

function exerciseFormSheet() {
  const f = S.exerciseForm;
  return `
  <div class="sheet-backdrop">
    <div class="sheet" style="max-height:88vh;overflow-y:auto">
      <div class="sheet-handle"></div>
      <div class="auth-title" style="font-size:26px">${f.id ? 'Edit exercise' : 'Add exercise'}</div>
      <label class="field-label" style="margin-top:16px">Name</label>
      <input class="field" id="exfName" value="${esc(f.name)}" placeholder="e.g. Barbell back squat">
      <div class="form-grid">
        <div><label class="field-label">Sets</label><input class="field" id="exfSets" type="text" inputmode="numeric" value="${f.sets}"></div>
        <div><label class="field-label">Increment (kg)</label><input class="field" id="exfIncrement" type="text" inputmode="decimal" value="${trimNum(f.increment)}"></div>
        <div><label class="field-label">Rep range low</label><input class="field" id="exfRepLo" type="text" inputmode="numeric" value="${f.rep_lo}"></div>
        <div><label class="field-label">Rep range high</label><input class="field" id="exfRepHi" type="text" inputmode="numeric" value="${f.rep_hi}"></div>
      </div>
      <label class="field-label">Starting weight (kg)</label>
      <input class="field" id="exfBaseWeight" type="text" inputmode="decimal" value="${trimNum(f.base_weight)}">
      <label class="checkline"><input type="checkbox" ${f.per_leg ? 'checked' : ''} onchange="App.toggleExField('per_leg')"> Logged per leg</label>
      <label class="checkline"><input type="checkbox" ${f.bodyweight ? 'checked' : ''} onchange="App.toggleExField('bodyweight')"> Bodyweight exercise (added weight only)</label>
      <div class="form-actions">
        <button class="btn-secondary" onclick="App.closeExerciseForm()">Cancel</button>
        <button class="btn-primary" style="flex:1;margin-top:0" onclick="App.saveExerciseForm()">Save</button>
      </div>
      ${f.id ? `<button class="btn-danger" style="width:100%;text-align:center;margin-top:12px" onclick="App.deleteExerciseForm()">Delete exercise</button>` : ''}
    </div>
  </div>`;
}

// ---- public API ----
window.App = {
  setView, startSession, exitSession, toggleExpand, setField, setNote, toggleSetDone, pickRpe, finishSession,
  openDetail, closeDetail, pickDetailIdx, toggleDetailRange,
  toggleHistory, deleteSession,
  closeDone, signOut,
  addDay, renameDay, deleteDay, moveDay, saveBodyweight,
  openExerciseForm, closeExerciseForm, setExField, toggleExField, saveExerciseForm, deleteExerciseForm,
};

render();
