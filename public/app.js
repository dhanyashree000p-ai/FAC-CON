// FAC-CON: Faculty Appointment and Consultation Management System
// Full-Stack Client Implementation with Persistent Shared Central Backend & Real-Time SSE Sync

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const REPORT_DAYS = 14;

const t2m = t => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const m2t = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const ov = (a, b, c, d) => t2m(a) < t2m(d) && t2m(c) < t2m(b);
const inst = (d, t) => new Date(`${d}T${t}:00+05:30`);
const dow = d => new Date(d + 'T12:00:00Z').getUTCDay();
const today = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const addD = (d, n) => new Date(new Date(d + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const fD = d => new Date(d + 'T12:00:00+05:30').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const LBL = {
  confirmed: 'Confirmed',
  pending_student_confirmation: 'Pending student confirmation',
  declined_by_student: 'Declined by student',
  cancelled: 'Cancelled',
  cancelled_by_student: 'Cancelled by student',
  cancelled_by_faculty: 'Cancelled by faculty',
  completed: 'Completed',
  awaiting_confirmation: 'Awaiting report confirmation',
  disputed: 'Disputed'
};

const OUT = {
  meeting_happened: 'Meeting happened',
  student_unavailable: 'Student unavailable',
  faculty_unavailable: 'Faculty unavailable',
  disputed: 'Reports differ (disputed)',
  awaiting_confirmation: 'Awaiting other report',
  no_meeting: 'No meeting held (admin resolved)'
};

// Global Application State
const S = {
  role: null,
  uid: null,
  view: 'home',
  arg: null,
  dep: {},
  stu: [],
  fac: [],
  rs: [],
  tt: [],
  av: [],
  apt: [],
  nt: [],
  rep: [],
  rat: [],
  aud: [],
  stats: {},
  network: { ips: [], port: 3000 },
  b: null,         // Student booking state
  sched: null,     // Faculty meeting scheduler state
  done: null,
  q: '',           // Faculty directory search
  dq: '',          // Faculty directory department filter
  sq: '',          // Student management search
  s_dept: '',      // Student filter dept
  s_sem: '',       // Student filter sem
  s_sec: '',       // Student filter sec
  s_st: '',        // Student filter status
  fq: '',          // Faculty management search
  f_dept: '',      // Faculty filter dept
  f_st: '',        // Faculty filter status
  tt_fac: '',      // Timetable faculty selector
  f: 'all',        // Appointments filter
  af: '',          // Admin appointments faculty filter
  as: '',          // Admin appointments status filter
  skip: {},
  err: '',
  msg: '',
  connected: false,
  pick: null
};

// API Helper
async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(S.role ? { 'x-user-role': S.role, 'x-user-id': S.uid } : {}),
    ...(options.headers || {})
  };
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    let errMsg = `Request failed: ${res.status}`;
    try {
      const json = await res.json();
      if (json.error) errMsg = json.error;
    } catch (e) {}
    throw new Error(errMsg);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

// Fetch canonical state from shared persistent backend
async function fetchBootstrap() {
  try {
    const data = await api(`/api/bootstrap?role=${S.role || ''}&uid=${S.uid || ''}`);
    S.dep = Object.fromEntries(data.departments.map(d => [d.department_id, d.department_name]));
    S.stu = data.students || [];
    S.fac = data.faculty || [];
    S.rs = data.reasons || [];
    S.tt = data.timetable || [];
    S.av = data.availability || [];
    S.apt = data.appointments || [];
    S.rep = data.reports || [];
    S.rat = data.ratings || [];
    S.nt = data.notifications || [];
    S.stats = data.stats || {};
    S.network = data.network || { ips: [], port: 3000 };
    S.connected = true;
    S.err = '';
    render();
  } catch (err) {
    console.error('Bootstrap error:', err);
    S.err = 'Failed to connect to central database: ' + err.message;
    S.connected = false;
    render();
  }
}

// Setup Server-Sent Events (SSE) for Real-Time synchronization
function initRealtime() {
  const evtSource = new EventSource('/api/events');
  evtSource.onmessage = e => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'mutation') {
        // Silently refresh canonical shared state from backend
        fetchBootstrapSilently();
      }
    } catch (err) {}
  };
  evtSource.onerror = () => {
    // Retry automatically handled by browser EventSource
  };
}

async function fetchBootstrapSilently() {
  try {
    const data = await api(`/api/bootstrap?role=${S.role || ''}&uid=${S.uid || ''}`);
    S.dep = Object.fromEntries(data.departments.map(d => [d.department_id, d.department_name]));
    S.stu = data.students || [];
    S.fac = data.faculty || [];
    S.rs = data.reasons || [];
    S.tt = data.timetable || [];
    S.av = data.availability || [];
    S.apt = data.appointments || [];
    S.rep = data.reports || [];
    S.rat = data.ratings || [];
    S.nt = data.notifications || [];
    S.stats = data.stats || {};
    draw();
  } catch (err) {}
}

const live = x => ['confirmed', 'pending_student_confirmation', 'awaiting_confirmation', 'completed', 'disputed'].includes(x.appointment_status);
const past = x => inst(x.appointment_date, x.end_time) <= new Date();
const mineA = () => S.apt.filter(x => S.role === 'student' ? x.student_id === S.uid : x.faculty_id === S.uid);
const myRep = x => S.rep.find(r => r.id === x.appointment_id + '_' + S.role);
const F = () => Object.fromEntries(S.fac.map(x => [x.faculty_id, x]));
const ST = () => Object.fromEntries(S.stu.map(x => [x.student_id, x]));
const RS = () => Object.fromEntries(S.rs.map(x => [x.reason_id, x]));

function slots(fid, date, currentStudentId = null) {
  const day = DN[dow(date)];
  const out = [];
  const facultyAvail = S.av.filter(a => a.faculty_id === fid && a.day_of_week === day);
  const facultyTimetable = S.tt.filter(t => t.faculty_id === fid && t.day_of_week === day);

  facultyAvail.forEach(a => {
    const duration = a.slot_duration_minutes || 15;
    for (let m = t2m(a.start_time); m + duration <= t2m(a.end_time); m += duration) {
      const s = m2t(m);
      const e = m2t(m + duration);
      let st = 'open';

      if (inst(date, s) <= new Date()) {
        st = 'past';
      } else if (facultyTimetable.some(t => ov(s, e, t.start_time, t.end_time))) {
        st = 'teaching';
      } else if (S.apt.some(x => live(x) && x.faculty_id === fid && x.appointment_date === date && ov(s, e, x.start_time, x.end_time))) {
        const booked = S.apt.find(x => live(x) && x.faculty_id === fid && x.appointment_date === date && ov(s, e, x.start_time, x.end_time));
        st = booked.appointment_status === 'pending_student_confirmation' ? 'tentative' : 'booked';
      } else if (currentStudentId && S.apt.some(x => live(x) && x.student_id === currentStudentId && x.appointment_date === date && ov(s, e, x.start_time, x.end_time))) {
        st = 'clash';
      }

      out.push({ s, e, l: a.location || 'Faculty Cabin', n: duration, st });
    }
  });
  return out;
}

const nextOpen = fid => {
  for (let i = 0; i < 28; i++) {
    const d = addD(today(), i);
    const s = slots(fid, d).find(x => x.st === 'open');
    if (s) return fD(d) + ', ' + s.s;
  }
  return null;
};

const who = () => {
  if (S.role === 'admin') return 'Demo Administrator (ADM0001)';
  if (S.role === 'faculty') {
    const f = F()[S.uid];
    return f ? `${f.faculty_name} (${f.designation})` : S.uid;
  }
  const s = ST()[S.uid];
  return s ? `${s.student_name} (${s.usn})` : S.uid;
};

const unread = () => S.nt.filter(n => n.to_role === S.role && n.to_id === S.uid && !n.read).length;
const pendingInvitesCount = () => S.apt.filter(a => S.role === 'student' && a.student_id === S.uid && a.appointment_status === 'pending_student_confirmation').length;

// -------------------------------------------------------------
// VIEWS & RENDERING
// -------------------------------------------------------------
function loginView() {
  const r = S.pick;
  return `
    <div class="lg">
      <h1>FAC-CON</h1>
      <p class="mu">Faculty Appointment and Consultation Management System</p>
      <div class="al">
        <b>PERSISTENT SHARED DATABASE</b> &bull; Centralized across Admin, Faculty, and Student portals.
        Refreshing the page, switching accounts, or connecting from another device on the local network retains all real-time changes.
      </div>
      <div class="g3">
        ${['admin', 'faculty', 'student'].map(k => `
          <button data-a="role" data-i="${k}" class="card ${r === k ? 'on' : ''}">
            <b>${k[0].toUpperCase() + k.slice(1)} Login</b>
            <div class="mu">${{ admin: 'Daily data management, records, disputes', faculty: 'Consultations, schedule student meetings, timetable', student: 'Find faculty, book consultations, review invites' }[k]}</div>
          </button>
        `).join('')}
      </div>
      ${r ? `
        <div class="t" style="margin-top:14px">
          ${r === 'admin' ? `
            <p>Continue as the institutional administrator. You will have full daily data management rights.</p>
          ` : `
            <label for="who">Select Demo ${r[0].toUpperCase() + r.slice(1)} Identity</label>
            <select id="who">
              ${(r === 'faculty' ? S.fac : S.stu).map(x => `
                <option value="${x.faculty_id || x.student_id}">
                  ${E(x.faculty_name || x.student_name)} ${x.usn ? `(${E(x.usn)})` : `(${E(x.designation)})`}
                </option>
              `).join('')}
            </select>
          `}
          <p style="margin-top:12px">
            <button class="b1" data-a="login">Sign in to ${r[0].toUpperCase() + r.slice(1)} Portal</button>
          </p>
        </div>
      ` : ''}
    </div>
    ${foot()}
  `;
}

const foot = () => {
  const lanIps = S.network.ips && S.network.ips.length ? S.network.ips.map(ip => `http://${ip}:${S.network.port}`).join(', ') : 'localhost:3000';
  return `
    <footer>
      <span>FAC-CON Centralized Build</span>
      <span>&bull;</span>
      <span class="mono">Network Access: ${lanIps}</span>
      <span class="sp"></span>
      <button data-a="doc" data-i="network">Device Access Guide</button>
      <button data-a="doc" data-i="privacy">Privacy</button>
      <button data-a="doc" data-i="terms">Terms</button>
      <button data-a="doc" data-i="help">Help</button>
    </footer>
  `;
};

const DOCS = {
  network: ['Multi-Device & Network Access Guide', 'FAC-CON is deployed with a centralized backend and persistent shared database. To access from another laptop, tablet, or phone on the same Wi-Fi network, open any browser on that device and navigate to the LAN URL displayed in the footer (e.g. http://' + (S.network.ips[0] || 'YOUR_IP') + ':' + S.network.port + '). All updates made on any device reflect centrally in real time.'],
  privacy: ['Privacy Policy (Draft)', 'FAC-CON stores student and faculty institutional master records, consultation schedules, appointment notes, attendance reports, and audit logs. Access is governed by role-based authorization. Internal IDs and historical appointments are permanently retained.'],
  terms: ['Terms of Consultation Service', 'Consultation slots are reserved institutional resources. Cancellations must be performed before the start time so that slots can be released to other participants. Both parties must submit independent outcome reports following meetings.'],
  help: ['Institutional Help & Support', 'Student queries: Contact Academic Affairs. Technical inquiries: Submit via Institutional IT Helpdesk. Cabin locations are updated by the institutional administrator.']
};

const nav = () => {
  const n = {
    student: [
      ['home', 'Overview'],
      ['find', 'Find faculty'],
      ['invites', `Faculty invitations${pendingInvitesCount() ? ` <span class="badge-counter">${pendingInvitesCount()}</span>` : ''}`],
      ['apts', 'My appointments'],
      ['nts', `Notifications${unread() ? ` <span class="badge-counter">${unread()}</span>` : ''}`]
    ],
    faculty: [
      ['home', 'Overview'],
      ['apts', 'Appointments'],
      ['sched', 'Schedule Meeting with Student'],
      ['tt', 'My timetable & availability'],
      ['nts', `Notifications${unread() ? ` <span class="badge-counter">${unread()}</span>` : ''}`]
    ],
    admin: [
      ['home', 'Overview'],
      ['apts', 'Appointment records'],
      ['stu', 'Student management'],
      ['facs', 'Faculty management'],
      ['dept_tt', 'Timetables & Departments'],
      ['aud', 'System audit log']
    ]
  }[S.role] || [];

  return n.map(([k, t]) => `
    <button data-a="go" data-i="${k}" class="${S.view === k || (k === 'find' && S.view === 'fac') ? 'on' : ''}">
      ${t}
    </button>
  `).join('');
};

function render() {
  const app = $('#app');
  if (S.view === 'doc') {
    app.innerHTML = `
      <main style="max-width:800px;margin:4vh auto">
        <h1>${DOCS[S.arg][0]}</h1>
        <p style="white-space:pre-wrap;line-height:1.7;margin:16px 0 24px">${E(DOCS[S.arg][1])}</p>
        <button class="b2" data-a="back">Return to Application</button>
      </main>
      ${foot()}
    `;
    return;
  }

  if (!S.role) {
    app.innerHTML = loginView();
    return;
  }

  app.innerHTML = `
    <header class="top">
      <span class="logo">FAC-CON</span>
      <span class="mu">${E(S.role.toUpperCase())}: ${E(who())}</span>
      <span class="sp"></span>
      <button class="b2" data-a="out">Sign out</button>
    </header>
    <div class="shell">
      <nav>${nav()}</nav>
      <main>
        <div class="banner-sync">
          <div><span class="status-dot"></span><b>Persistent Shared Database:</b> Changes persist on reload and sync across all tabs & devices.</div>
          <span class="mu mono">Ref: ${S.network.ips[0] || 'localhost'}:${S.network.port}</span>
        </div>
        ${S.err ? `<div class="al er">${E(S.err)}</div>` : ''}
        ${S.msg ? `<div class="al ok">${E(S.msg)}</div>` : ''}
        ${view()}
      </main>
    </div>
    ${foot()}
  `;
}

function view() {
  const v = S.view;
  if (v === 'home') return S.role === 'admin' ? adminHome() : (S.role === 'faculty' ? facultyHome() : studentHome());
  if (v === 'apts') return S.role === 'admin' ? adminApts() : aptsView();
  if (v === 'invites') return studentInvitesView();
  if (v === 'sched') return facultyScheduleMeetingView();
  if (v === 'nts') return ntsView();
  if (v === 'find') return findView();
  if (v === 'fac') return facView(S.arg, S.role === 'student');
  if (v === 'tt') return facultyTimetableView();
  if (v === 'stu') return adminStudentManagementView();
  if (v === 'facs') return adminFacultyManagementView();
  if (v === 'dept_tt') return adminDeptTimetableView();
  if (v === 'aud') return adminAuditView();
  return '';
}

const badge = x => {
  const isPastConfirmed = past(x) && x.appointment_status === 'confirmed';
  let color = 'wn';
  if (x.appointment_status === 'completed') color = 'ok';
  else if (x.appointment_status === 'confirmed' && !isPastConfirmed) color = 'ok';
  else if (x.appointment_status === 'disputed' || x.appointment_status.startsWith('cancelled') || x.appointment_status === 'declined_by_student') color = 'er';

  const label = isPastConfirmed ? 'Outcome due' : (LBL[x.appointment_status] || x.appointment_status);
  return `<span class="bd ${color}">${E(label)}</span>`;
};

// Appointment Row Component with connected actions
function row(x) {
  const facultyMap = F();
  const studentMap = ST();
  const reasonsMap = RS();
  const f = facultyMap[x.faculty_id];
  const s = studentMap[x.student_id];
  const r = S.role;
  const mr = r !== 'admin' && myRep(x);
  let act = '';

  const isEligibleToCancel = (x.appointment_status === 'confirmed' || x.appointment_status === 'pending_student_confirmation') && !past(x);
  if (r !== 'admin' && isEligibleToCancel) {
    act += `<button class="b3" data-a="cancel" data-i="${E(x.appointment_id)}">Cancel appointment</button>`;
  }

  // Student Invitation actions
  if (r === 'student' && x.appointment_status === 'pending_student_confirmation' && !past(x)) {
    act += `
      <button class="b4" data-a="accept_invite" data-i="${E(x.appointment_id)}">Accept invitation</button>
      <button class="b3" data-a="decline_invite" data-i="${E(x.appointment_id)}">Decline invitation</button>
    `;
  }

  // Outcome reporting
  if (r !== 'admin' && past(x) && ['confirmed', 'awaiting_confirmation'].includes(x.appointment_status) && !mr && (new Date() - inst(x.appointment_date, x.end_time) < REPORT_DAYS * 864e5)) {
    act += `
      <span class="mu">Report meeting outcome:</span>
      <button class="b2" data-a="rep" data-i="${E(x.appointment_id)}" data-j="meeting_happened">Meeting happened</button>
      <button class="b2" data-a="rep" data-i="${E(x.appointment_id)}" data-j="${r === 'student' ? 'faculty' : 'student'}_unavailable">${r === 'student' ? 'Faculty' : 'Student'} unavailable</button>
    `;
  }

  if (mr) {
    act += `<span class="mu">Your submitted report: <b>${OUT[mr.v] || E(mr.v)}</b></span>`;
  }

  const rated = S.rat.find(q => q.id === x.appointment_id + '_' + r);
  if (r !== 'admin' && x.appointment_status === 'completed' && x.meeting_outcome === 'meeting_happened' && !rated && !S.skip[x.appointment_id]) {
    act += `
      <div>
        <span class="mu">Optional consultation rating:</span>
        ${[1, 2, 3, 4, 5].map(n => `<button class="b2" data-a="rate" data-i="${E(x.appointment_id)}" data-j="${n}">${n}</button>`).join(' ')}
        <button class="b2" data-a="skip" data-i="${E(x.appointment_id)}">Skip</button>
      </div>
    `;
  }
  if (rated) {
    act += `<span class="mu">You rated this consultation ${E(rated.v)} / 5</span>`;
  }

  if (r === 'admin' && x.appointment_status === 'disputed') {
    act += `
      <div>
        <span class="mu">Admin dispute resolution:</span>
        <button class="b2" data-a="resolve" data-i="${E(x.appointment_id)}" data-j="meeting_happened">Resolve: Meeting happened</button>
        <button class="b2" data-a="resolve" data-i="${E(x.appointment_id)}" data-j="no_meeting">Resolve: No meeting held</button>
      </div>
    `;
  }

  const reasonName = x.custom_reason || reasonsMap[x.reason_id]?.reason_name || x.reason_id;
  const cabinDisplay = x.cabin_location_snapshot || f?.cabin_location || 'Faculty Cabin';

  return `
    <div class="t">
      <div class="h">
        <b>${fD(x.appointment_date)}, <span class="mono">${E(x.start_time)}-${E(x.end_time)}</span></b>
        ${badge(x)}
      </div>
      <div style="margin:4px 0">
        ${r === 'student' ? `Faculty: <b>${E(f?.faculty_name || x.faculty_id)}</b> (${E(S.dep[f?.department_id] || '')})` :
          r === 'faculty' ? `Student: <b>${E(s?.student_name || x.student_id)}</b> <span class="mono mu">${E(s?.usn || '')}</span>` :
          `<b>${E(f?.faculty_name)}</b> with <b>${E(s?.student_name)}</b> (${E(s?.usn)})`}
      </div>
      <div class="mu">
        Reason: <b>${E(reasonName)}</b> &bull; Cabin: ${E(cabinDisplay)} &bull; Ref: <span class="mono">${E(x.appointment_id)}</span>
        ${x.initiated_by ? ` &bull; Initiated by: <b>${E(x.initiated_by)}</b>` : ''}
        ${x.meeting_outcome ? ` &bull; Outcome: <b>${E(OUT[x.meeting_outcome] || x.meeting_outcome)}</b>` : ''}
        ${x.cancelled_by ? ` &bull; Cancelled by: <span class="mono">${E(x.cancelled_by)}</span>` : ''}
      </div>
      ${x.student_message ? `<div style="margin-top:6px;font-size:13.5px;padding:6px 8px;background:var(--bg);border-radius:4px">${E(x.student_message)}</div>` : ''}
      ${x.cancellation_reason ? `<div class="mu" style="color:var(--er);margin-top:4px">Cancellation reason: ${E(x.cancellation_reason)}</div>` : ''}
      ${act ? `<div class="row" style="margin-top:10px">${act}</div>` : ''}
    </div>
  `;
}

const empty = t => `<p class="mu" style="padding:12px 0">${t}</p>`;

// -------------------------------------------------------------
// STUDENT VIEWS
// -------------------------------------------------------------
function studentHome() {
  const m = mineA().sort((a, b) => (a.appointment_date + a.start_time).localeCompare(b.appointment_date + b.start_time));
  const up = m.filter(x => x.appointment_status === 'confirmed' && !past(x));
  const pendingInvites = m.filter(x => x.appointment_status === 'pending_student_confirmation' && !past(x));
  const due = m.filter(x => past(x) && ['confirmed', 'awaiting_confirmation'].includes(x.appointment_status) && !myRep(x));
  const rec = m.filter(x => !up.includes(x) && !pendingInvites.includes(x)).slice(-4).reverse();

  return `
    <h1>Student Overview</h1>
    <p class="mu">${fD(today())}, Asia/Kolkata</p>
    <div class="g4">
      <div class="card"><dl><dt>Upcoming Appointments</dt><dd>${up.length}</dd></dl></div>
      <div class="card"><dl><dt>Pending Faculty Invitations</dt><dd>${pendingInvites.length}</dd></dl></div>
      <div class="card"><dl><dt>Outcomes to Report</dt><dd>${due.length}</dd></dl></div>
      <div class="card"><dl><dt>Unread Notifications</dt><dd>${unread()}</dd></dl></div>
    </div>
    ${pendingInvites.length ? `
      <h2>Faculty Meeting Invitations Awaiting Your Response</h2>
      <div class="al" style="border-left:4px solid var(--wn)">You have ${pendingInvites.length} pending meeting invitation(s) from faculty. Please accept or decline below.</div>
      ${pendingInvites.map(row).join('')}
    ` : ''}
    ${up[0] ? `<h2>Next Scheduled Appointment</h2>${row(up[0])}` : ''}
    ${due.length ? `<h2>Waiting for Your Outcome Report</h2>${due.map(row).join('')}` : ''}
    <h2>Recent History</h2>
    ${rec.map(row).join('') || empty('No earlier appointments recorded.')}
    <p style="margin-top:16px">
      <button class="b1" data-a="go" data-i="find">Find Faculty and Book Appointment</button>
    </p>
  `;
}

function studentInvitesView() {
  const m = mineA().filter(x => x.initiated_by === 'faculty');
  const pending = m.filter(x => x.appointment_status === 'pending_student_confirmation');
  const confirmed = m.filter(x => x.appointment_status === 'confirmed');
  const declined = m.filter(x => x.appointment_status === 'declined_by_student');
  const others = m.filter(x => ['completed', 'cancelled', 'cancelled_by_faculty', 'cancelled_by_student', 'disputed'].includes(x.appointment_status));

  return `
    <h1>Faculty-Initiated Meeting Invitations</h1>
    <p class="mu">Meetings scheduled by teachers regarding attendance, academic performance, or project guidance.</p>
    <h2>Invitations Awaiting Your Confirmation (${pending.length})</h2>
    ${pending.map(row).join('') || empty('No pending invitations waiting for your response.')}
    <h2>Confirmed Meetings (${confirmed.length})</h2>
    ${confirmed.map(row).join('') || empty('No confirmed faculty-initiated meetings.')}
    <h2>Declined Invitations (${declined.length})</h2>
    ${declined.map(row).join('') || empty('No declined invitations.')}
    ${others.length ? `<h2>Past & Cancelled (${others.length})</h2>${others.map(row).join('')}` : ''}
  `;
}

// -------------------------------------------------------------
// FACULTY VIEWS
// -------------------------------------------------------------
function facultyHome() {
  const m = mineA().sort((a, b) => (a.appointment_date + a.start_time).localeCompare(b.appointment_date + b.start_time));
  const up = m.filter(x => x.appointment_status === 'confirmed' && !past(x));
  const td = up.filter(x => x.appointment_date === today());
  const pending = m.filter(x => x.appointment_status === 'pending_student_confirmation');
  const due = m.filter(x => past(x) && ['confirmed', 'awaiting_confirmation'].includes(x.appointment_status) && !myRep(x));
  const rec = m.filter(x => !up.includes(x)).slice(-4).reverse();

  return `
    <h1>Faculty Overview</h1>
    <p class="mu">${fD(today())}, Asia/Kolkata</p>
    <div class="g4">
      <div class="card"><dl><dt>Upcoming Appointments</dt><dd>${up.length}</dd></dl></div>
      <div class="card"><dl><dt>Today's Appointments</dt><dd>${td.length}</dd></dl></div>
      <div class="card"><dl><dt>Awaiting Student Response</dt><dd>${pending.length}</dd></dl></div>
      <div class="card"><dl><dt>Outcomes to Report</dt><dd>${due.length}</dd></dl></div>
    </div>
    <div style="margin:16px 0">
      <button class="b1" data-a="go" data-i="sched">Schedule Meeting with Student</button>
      <button class="b2" data-a="go" data-i="tt" style="margin-left:8px">View My Timetable & Availability</button>
    </div>
    ${pending.length ? `<h2>Meeting Invitations Sent to Students (${pending.length})</h2>${pending.map(row).join('')}` : ''}
    ${up[0] ? `<h2>Next Consultation</h2>${row(up[0])}` : ''}
    ${due.length ? `<h2>Waiting for Your Outcome Report</h2>${due.map(row).join('')}` : ''}
    <h2>Recent Consultations</h2>
    ${rec.map(row).join('') || empty('No earlier consultation records.')}
  `;
}

// Faculty Schedule Meeting with Student (Requirement #2)
function facultyScheduleMeetingView() {
  const sched = S.sched || { step: 'select_student', student_id: '', reason_id: 'RSN001', custom_reason: '', date: '', slot: '', msg: '' };
  S.sched = sched;

  const filteredStudents = S.stu.filter(s => {
    if (!S.sq) return true;
    const q = S.sq.toLowerCase();
    return (s.student_name || '').toLowerCase().includes(q) || (s.usn || '').toLowerCase().includes(q);
  });

  const selectedStudent = S.stu.find(s => s.student_id === sched.student_id);

  let dateSlots = [];
  if (sched.date) {
    dateSlots = slots(S.uid, sched.date, sched.student_id);
  }

  const futureDates = [];
  for (let i = 1; i <= 28; i++) {
    const d = addD(today(), i);
    futureDates.push(d);
  }

  return `
    <h1>Schedule Meeting with Student</h1>
    <p class="mu">Initiate an academic consultation regarding attendance, performance, project guidance, or other institutional matters.</p>
    
    <div class="t">
      <h3>1. Select Student</h3>
      <div class="row">
        <div>
          <label for="sq">Search student by Name or USN</label>
          <input id="sq" data-f="sq" value="${E(S.sq || '')}" placeholder="Type name or USN...">
        </div>
      </div>
      <div style="margin:10px 0;max-height:160px;overflow-y:auto;border:1px solid var(--bd);border-radius:4px">
        <table>
          <tr><th>Select<th>Name<th>USN<th>Department<th>Sem/Sec</tr>
          ${filteredStudents.map(s => `
            <tr style="${sched.student_id === s.student_id ? 'background:var(--sel);font-weight:600' : ''}">
              <td><button class="b2" data-a="sched_student" data-i="${s.student_id}">${sched.student_id === s.student_id ? '&check; Selected' : 'Select'}</button></td>
              <td>${E(s.student_name)}</td>
              <td class="mono">${E(s.usn)}</td>
              <td>${E(S.dep[s.department_id] || s.department_id)}</td>
              <td>Sem ${s.semester} (${s.section})</td>
            </tr>
          `).join('')}
        </table>
      </div>
      ${selectedStudent ? `<div class="al ok" style="padding:6px 10px">Selected: <b>${E(selectedStudent.student_name)}</b> (${E(selectedStudent.usn)}) &bull; ${E(S.dep[selectedStudent.department_id])}</div>` : ''}

      <h3>2. Meeting Reason</h3>
      <label for="sched_reason">Reason for Meeting</label>
      <select id="sched_reason" data-f="sched_reason">
        ${S.rs.map(r => `<option value="${r.reason_id}" ${sched.reason_id === r.reason_id ? 'selected' : ''}>${E(r.reason_name)}</option>`).join('')}
      </select>

      ${sched.reason_id === 'RSN010' ? `
        <label for="sched_custom">Custom Reason Description (Required for 'Other')</label>
        <input id="sched_custom" data-f="sched_custom" value="${E(sched.custom_reason || '')}" placeholder="Enter specific meeting purpose...">
      ` : ''}

      <label for="sched_msg">Meeting Instructions or Message for Student (Optional)</label>
      <textarea id="sched_msg" data-f="sched_msg" maxlength="300" placeholder="e.g. Please bring your phase 1 documentation and logbook...">${E(sched.msg || '')}</textarea>
      <div class="mu">Up to 300 characters.</div>

      <h3>3. Select Date and Time Slot</h3>
      <label>Consultation Date</label>
      <div class="row" style="max-height:110px;overflow-y:auto;padding:4px 0">
        ${futureDates.map(d => `
          <button class="sl ${sched.date === d ? 'on' : ''}" data-a="sched_date" data-i="${d}">
            ${fD(d).replace(/,? \d{4}$/, '')}
          </button>
        `).join('')}
      </div>

      ${sched.date ? `
        <label style="margin-top:14px">Available Time Slots for ${E(fD(sched.date))}</label>
        <div class="row">
          ${dateSlots.map(s => `
            <button class="sl ${sched.slot === s.s ? 'on' : ''}" ${s.st === 'open' ? '' : 'disabled'} data-a="sched_slot" data-i="${s.s}" data-j="${s.e}">
              ${s.s}-${s.e}<br>
              <small>${{ open: s.n + ' min', past: 'Past', teaching: 'Class scheduled', booked: 'Occupied', tentative: 'Tentative', clash: 'Student clash' }[s.st]}</small>
            </button>
          `).join('')}
        </div>
      ` : ''}

      <div style="margin-top:20px;border-top:1px solid var(--bd);padding-top:14px">
        <button class="b1" data-a="sched_confirm" ${!sched.student_id || !sched.date || !sched.slot ? 'disabled' : ''}>
          Send Meeting Invitation to Student
        </button>
        <button class="b2" data-a="go" data-i="home" style="margin-left:8px">Cancel</button>
      </div>
    </div>
  `;
}

function facultyTimetableView() {
  const f = F()[S.uid];
  if (!f) return empty('Faculty record not found.');
  const days = DN.slice(1, 6);

  const grid = days.map(d => `
    <div class="day">
      <h3>${d}</h3>
      ${S.tt.filter(t => t.faculty_id === S.uid && t.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time)).map(t => `
        <div class="cl">
          <span class="mono">${t.start_time}-${t.end_time}</span> Teaching: ${E(t.course_name)}, ${E(t.classroom)}, Sec ${E(t.section)}
        </div>
      `).join('')}
      ${S.av.filter(a => a.faculty_id === S.uid && a.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time)).map(a => `
        <div class="cn">
          <span class="mono">${a.start_time}-${a.end_time}</span> Consultation (${a.slot_duration_minutes} min slots)
        </div>
      `).join('')}
    </div>
  `).join('');

  return `
    <h1>My Timetable & Consultation Availability</h1>
    <p class="mu">${E(f.faculty_name)}, ${E(f.designation)} &bull; Cabin: ${E(f.cabin_location)}</p>
    <h2>Weekly Schedule (Classes & Consultation Hours)</h2>
    <div class="g4" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">${grid}</div>
    <p class="mu" style="margin-top:10px">Grey blocks represent assigned teaching hours. Blue blocks represent active consultation availability.</p>
  `;
}

// -------------------------------------------------------------
// APPOINTMENTS LIST VIEW (Student & Faculty)
// -------------------------------------------------------------
function aptsView() {
  const m = mineA().sort((a, b) => (b.appointment_date + b.start_time).localeCompare(a.appointment_date + a.start_time));
  const f = S.f || 'all';
  const ok = x => {
    if (f === 'all') return true;
    if (f === 'upcoming') return x.appointment_status === 'confirmed' && !past(x);
    if (f === 'pending') return x.appointment_status === 'pending_student_confirmation';
    if (f === 'completed') return x.appointment_status === 'completed';
    if (f === 'cancelled') return x.appointment_status.startsWith('cancelled') || x.appointment_status === 'declined_by_student';
    if (f === 'disputed') return x.appointment_status === 'disputed';
    if (f === 'awaiting_confirmation') return x.appointment_status === 'awaiting_confirmation';
    return x.appointment_status === f;
  };

  return `
    <div class="row" style="justify-content:space-between">
      <h1>${S.role === 'student' ? 'My Appointments' : 'Appointments'}</h1>
      ${S.role === 'faculty' ? `<button class="b1" data-a="go" data-i="sched">Schedule Meeting with Student</button>` : ''}
    </div>
    <label for="f">Filter by Status</label>
    <select id="f" data-f="f">
      ${[
        ['all', 'All Appointments'],
        ['upcoming', 'Upcoming Confirmed'],
        ['pending', 'Pending Student Confirmation'],
        ['completed', 'Completed'],
        ['cancelled', 'Cancelled or Declined'],
        ['disputed', 'Disputed Outcomes'],
        ['awaiting_confirmation', 'Awaiting Outcome Report']
      ].map(([k, t]) => `<option value="${k}" ${k === f ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
    <div style="margin-top:12px">
      ${m.filter(ok).map(row).join('') || empty('No appointments match the selected filter.')}
    </div>
  `;
}

// -------------------------------------------------------------
// FIND FACULTY & BOOKING (Student)
// -------------------------------------------------------------
const facList = () => {
  const list = S.fac.filter(f => (!S.dq || f.department_id === S.dq) && (!S.q || (f.faculty_name + f.designation).toLowerCase().includes(S.q.toLowerCase())));
  return list.map(f => `
    <div class="t">
      <div class="h">
        <b>${E(f.faculty_name)}</b>
        <span class="mu">${E(S.dep[f.department_id] || f.department_id)}</span>
      </div>
      <div class="mu">${E(f.designation)} &bull; ${E(f.cabin_location)}</div>
      <div class="row" style="margin-top:8px">
        <span>${(n => n ? 'Next open slot: <b>' + n + '</b>' : 'No open slots in next 4 weeks')(nextOpen(f.faculty_id))}</span>
        <span class="sp"></span>
        <button class="b1" data-a="go" data-i="fac" data-j="${f.faculty_id}">View timetable and book</button>
      </div>
    </div>
  `).join('') || empty('No faculty members match the search query.');
};

const findView = () => `
  <h1>Find Faculty</h1>
  <p class="mu">Search faculty members to book an appointment during their available consultation hours.</p>
  <div class="row">
    <div>
      <label for="q">Name or Designation</label>
      <input id="q" data-f="q" value="${E(S.q)}" placeholder="e.g. Rao, Professor...">
    </div>
    <div>
      <label for="dq">Department</label>
      <select id="dq" data-f="dq">
        <option value="">All Departments</option>
        ${Object.entries(S.dep).map(([k, v]) => `<option value="${k}" ${S.dq === k ? 'selected' : ''}>${E(v)}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="list" style="margin-top:12px">${facList()}</div>
`;

function facView(fid, book) {
  const f = F()[fid];
  if (!f) return empty('Faculty record not found.');
  const days = DN.slice(1, 6);

  const grid = days.map(d => `
    <div class="day">
      <h3>${d}</h3>
      ${S.tt.filter(t => t.faculty_id === fid && t.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time)).map(t => `
        <div class="cl"><span class="mono">${t.start_time}-${t.end_time}</span> Teaching: ${E(t.course_name)}, ${E(t.classroom)}, Sec ${E(t.section)}</div>
      `).join('')}
      ${S.av.filter(a => a.faculty_id === fid && a.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time)).map(a => `
        <div class="cn"><span class="mono">${a.start_time}-${a.end_time}</span> Consultation (${a.slot_duration_minutes} min slots)</div>
      `).join('')}
    </div>
  `).join('');

  return `
    <h1>${E(f.faculty_name)}</h1>
    <p class="mu">${E(f.designation)}, ${E(S.dep[f.department_id])} &bull; Cabin: <b>${E(f.cabin_location)}</b></p>
    <h2>Weekly Timetable</h2>
    <div class="g4" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">${grid}</div>
    <p class="mu">Grey blocks are assigned teaching periods. Blue blocks are consultation hours.</p>
    ${book ? bookPanel(fid) : ''}
  `;
}

function bookPanel(fid) {
  const b = S.b && S.b.fid === fid ? S.b : null;
  const dd = [];
  if (S.done) {
    const doneApt = S.apt.find(x => x.appointment_id === S.done);
    return `
      <h2>Booking Confirmed</h2>
      <div class="t">
        <p><b>Confirmation Reference: <span class="mono">${E(S.done)}</span></b></p>
        ${doneApt ? row(doneApt) : ''}
        <button class="b2" data-a="go" data-i="apts">View My Appointments</button>
      </div>
    `;
  }

  for (let i = 0; i < 28; i++) {
    const d = addD(today(), i);
    if (S.av.some(a => a.faculty_id === fid && a.day_of_week === DN[dow(d)])) dd.push(d);
  }

  let h = `
    <h2>Book a Consultation Slot</h2>
    <label>Select Date</label>
    <div class="row">${dd.map(d => `
      <button class="sl ${b?.date === d ? 'on' : ''}" data-a="date" data-i="${d}" data-j="${fid}">
        ${fD(d).replace(/,? \d{4}$/, '')}
      </button>
    `).join('')}</div>
  `;

  if (b?.date) {
    const sl = slots(fid, b.date, S.uid);
    h += `
      <label style="margin-top:14px">Select Slot for ${E(fD(b.date))}</label>
      <div class="row">${sl.map(s => `
        <button class="sl ${b.s === s.s ? 'on' : ''}" ${s.st === 'open' ? '' : 'disabled'} data-a="slot" data-i="${s.s}" data-j="${s.e}">
          ${s.s}-${s.e}<br>
          <small>${{ open: s.n + ' min', past: 'Past', teaching: 'Class scheduled', booked: 'Booked', tentative: 'Tentative', clash: 'Clash with your booking' }[s.st]}</small>
        </button>
      `).join('')}</div>
    `;
  }

  if (b?.s && b.step !== 'review') {
    const need = RS()[b.reason]?.requires_additional_details;
    h += `
      <label for="rs">Reason for Consultation</label>
      <select id="rs" data-f="reason">
        <option value="">Select a reason</option>
        ${S.rs.map(r => `<option value="${r.reason_id}" ${b.reason === r.reason_id ? 'selected' : ''}>${E(r.reason_name)}</option>`).join('')}
      </select>
      <label for="ms">Message ${need ? '(Required)' : '(Optional)'}</label>
      <textarea id="ms" data-f="msg" maxlength="300" placeholder="Provide any details about your question...">${E(b.msg || '')}</textarea>
      <div class="mu">Up to 300 characters.</div>
      <p style="margin-top:12px"><button class="b1" data-a="review">Review Booking</button></p>
    `;
  }

  if (b?.step === 'review') {
    const f = F()[fid];
    const e = slots(fid, b.date, S.uid).find(s => s.s === b.s);
    h += `
      <h2>Review & Confirm Consultation</h2>
      <div class="t">
        <dl>
          <dt>Faculty</dt><dd style="font-size:16px">${E(f.faculty_name)}, ${E(S.dep[f.department_id])}</dd>
          <dt>Location</dt><dd style="font-size:16px">${E(e.l)}</dd>
          <dt>Date & Time</dt><dd style="font-size:16px">${fD(b.date)}, ${b.s}-${b.e || e.e} (${e.n} min)</dd>
          <dt>Reason</dt><dd style="font-size:16px">${E(RS()[b.reason]?.reason_name)}</dd>
          <dt>Message</dt><dd style="font-size:16px">${E(b.msg || 'None')}</dd>
        </dl>
        <div class="row" style="margin-top:14px">
          <button class="b1" data-a="confirm" ${b.busy ? 'disabled' : ''}>${b.busy ? 'Confirming...' : 'Confirm Consultation'}</button>
          <button class="b2" data-a="unreview">Back</button>
        </div>
      </div>
    `;
  }

  return h;
}

// -------------------------------------------------------------
// NOTIFICATIONS VIEW
// -------------------------------------------------------------
function ntsView() {
  const n = S.nt.filter(x => x.to_role === S.role && x.to_id === S.uid).sort((a, b) => b.at.localeCompare(a.at));
  return `
    <div class="row" style="justify-content:space-between">
      <h1>Notifications</h1>
      ${n.some(x => !x.read) ? `<button class="b2" data-a="read_all">Mark all as read</button>` : ''}
    </div>
    <div style="margin-top:10px">
      ${n.map(x => `
        <div class="t">
          <div class="h">
            <span>${x.read ? '' : '<span class="bd wn" style="margin-right:6px">New</span>'}<b>${E(x.msg)}</b></span>
            <span class="mu">${new Date(x.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
          <div class="row" style="margin-top:6px">
            ${x.apt && S.role !== 'admin' ? `<button class="b2" data-a="go" data-i="apts">Open appointment details</button>` : ''}
            ${x.read ? '' : `<button class="b2" data-a="read" data-i="${E(x.id)}">Mark as read</button>`}
          </div>
        </div>
      `).join('') || empty('No notifications received.')}
    </div>
  `;
}

// -------------------------------------------------------------
// ADMIN VIEWS (Requirement #1: Daily Data Management)
// -------------------------------------------------------------
function adminHome() {
  const st = S.stats || {};
  return `
    <h1>Institutional Administrator Overview</h1>
    <p class="mu">Central database statistics &bull; Authoritative across all portals</p>
    <div class="g4">
      <div class="card"><dl><dt>Registered Students</dt><dd>${st.registered_students || S.stu.length}</dd></dl></div>
      <div class="card"><dl><dt>Active Faculty</dt><dd>${st.active_faculty || S.fac.length}</dd></dl></div>
      <div class="card"><dl><dt>Departments</dt><dd>${st.departments_count || Object.keys(S.dep).length}</dd></dl></div>
      <div class="card"><dl><dt>Upcoming Appointments</dt><dd>${st.upcoming_appointments || 0}</dd></dl></div>
      <div class="card"><dl><dt>Meetings Completed</dt><dd>${st.meetings_held || 0}</dd></dl></div>
      <div class="card"><dl><dt>Cancelled Appointments</dt><dd>${st.cancelled_appointments || 0}</dd></dl></div>
      <div class="card"><dl><dt>Pending Faculty Invites</dt><dd>${st.pending_invitations || 0}</dd></dl></div>
      <div class="card"><dl><dt>Disputed Outcomes</dt><dd>${st.disputed_outcomes || 0}</dd></dl></div>
    </div>
    
    <h2>Disputed Meeting Outcomes (${S.apt.filter(x => x.appointment_status === 'disputed').length})</h2>
    ${S.apt.filter(x => x.appointment_status === 'disputed').map(row).join('') || empty('No disputed outcomes requiring administrative review.')}
  `;
}

function adminApts() {
  const f = S.af || '';
  const s = S.as || '';
  const list = S.apt.filter(x => (!f || x.faculty_id === f) && (!s || x.appointment_status === s))
    .sort((a, b) => (b.appointment_date + b.start_time).localeCompare(a.appointment_date + a.start_time));

  return `
    <h1>All Institutional Appointment Records</h1>
    <div class="row">
      <div>
        <label for="af">Filter by Faculty</label>
        <select id="af" data-f="af">
          <option value="">All Faculty</option>
          ${S.fac.map(x => `<option value="${x.faculty_id}" ${f === x.faculty_id ? 'selected' : ''}>${E(x.faculty_name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label for="as">Filter by Status</label>
        <select id="as" data-f="as">
          <option value="">All Statuses</option>
          ${Object.entries(LBL).map(([k, v]) => `<option value="${k}" ${s === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div style="align-self:end">
        <a class="b2" href="/api/appointments/export-csv" download style="text-decoration:none">Export Appointments CSV</a>
      </div>
    </div>
    <div style="margin-top:14px">
      ${list.map(row).join('') || empty('No appointment records match the criteria.')}
    </div>
  `;
}

// Student Management (Requirement #1)
function adminStudentManagementView() {
  const filtered = S.stu.filter(s => {
    if (S.sq) {
      const q = S.sq.toLowerCase();
      if (!(s.student_name || '').toLowerCase().includes(q) && !(s.usn || '').toLowerCase().includes(q)) return false;
    }
    if (S.s_dept && s.department_id !== S.s_dept) return false;
    if (S.s_sem && String(s.semester) !== String(S.s_sem)) return false;
    if (S.s_sec && (s.section || '').toUpperCase() !== S.s_sec.toUpperCase()) return false;
    if (S.s_st && s.account_status !== S.s_st) return false;
    return true;
  });

  return `
    <div class="row" style="justify-content:space-between">
      <h1>Student Management</h1>
      <div class="row">
        <button class="b1" data-a="modal_add_student">+ Add Student</button>
        <button class="b2" data-a="modal_import_students">Import CSV</button>
        <a class="b2" href="/api/students/export-csv" download style="text-decoration:none">Export CSV</a>
      </div>
    </div>
    <p class="mu">Update student profiles, departments, sections, or archive records. Changes persist centrally and synchronize throughout all views.</p>
    
    <div class="row" style="margin-bottom:12px">
      <div>
        <label for="sq">Search Name or USN</label>
        <input id="sq" data-f="sq" value="${E(S.sq || '')}" placeholder="Search name or USN...">
      </div>
      <div>
        <label for="s_dept">Department</label>
        <select id="s_dept" data-f="s_dept">
          <option value="">All Departments</option>
          ${Object.entries(S.dep).map(([k, v]) => `<option value="${k}" ${S.s_dept === k ? 'selected' : ''}>${E(v)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label for="s_sem">Semester</label>
        <select id="s_sem" data-f="s_sem">
          <option value="">All</option>
          ${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${String(S.s_sem) === String(n) ? 'selected' : ''}>Sem ${n}</option>`).join('')}
        </select>
      </div>
      <div>
        <label for="s_sec">Section</label>
        <select id="s_sec" data-f="s_sec">
          <option value="">All</option>
          ${['A', 'B', 'C'].map(c => `<option value="${c}" ${S.s_sec === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div>
        <label for="s_st">Status</label>
        <select id="s_st" data-f="s_st">
          <option value="">All</option>
          <option value="active" ${S.s_st === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${S.s_st === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>

    <div class="scroll">
      <table>
        <tr>
          <th>Name
          <th>USN
          <th>Department
          <th>Sem
          <th>Sec
          <th>DOB
          <th>Status
          <th>Actions
        </tr>
        ${filtered.map(s => `
          <tr>
            <td><b>${E(s.student_name)}</b></td>
            <td class="mono">${E(s.usn)}</td>
            <td>${E(S.dep[s.department_id] || s.department_id)}</td>
            <td>${s.semester}</td>
            <td>${E(s.section)}</td>
            <td class="mono">${E(s.dob || '-')}</td>
            <td><span class="bd ${s.account_status === 'active' ? 'ok' : 'er'}">${E(s.account_status)}</span></td>
            <td>
              <button class="b2" data-a="modal_edit_student" data-i="${s.student_id}">Edit</button>
              <button class="b3" data-a="archive_student" data-i="${s.student_id}">${s.account_status === 'active' ? 'Deactivate' : 'Archive'}</button>
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
    <p class="mu" style="margin-top:6px">Showing ${filtered.length} of ${S.stu.length} student records.</p>
  `;
}

// Faculty Management (Requirement #1)
function adminFacultyManagementView() {
  const filtered = S.fac.filter(f => {
    if (S.fq) {
      const q = S.fq.toLowerCase();
      if (!(f.faculty_name || '').toLowerCase().includes(q) && !(f.designation || '').toLowerCase().includes(q)) return false;
    }
    if (S.f_dept && f.department_id !== S.f_dept) return false;
    if (S.f_st && f.account_status !== S.f_st) return false;
    return true;
  });

  return `
    <div class="row" style="justify-content:space-between">
      <h1>Faculty Management</h1>
      <div class="row">
        <button class="b1" data-a="modal_add_faculty">+ Add Faculty</button>
        <button class="b2" data-a="modal_import_faculty">Import CSV</button>
        <a class="b2" href="/api/faculty/export-csv" download style="text-decoration:none">Export CSV</a>
      </div>
    </div>
    <p class="mu">Update faculty names, designations, cabin locations, or departments. Cabin location updates reflect across future bookings immediately.</p>

    <div class="row" style="margin-bottom:12px">
      <div>
        <label for="fq">Search Name or Designation</label>
        <input id="fq" data-f="fq" value="${E(S.fq || '')}" placeholder="Search name or designation...">
      </div>
      <div>
        <label for="f_dept">Department</label>
        <select id="f_dept" data-f="f_dept">
          <option value="">All Departments</option>
          ${Object.entries(S.dep).map(([k, v]) => `<option value="${k}" ${S.f_dept === k ? 'selected' : ''}>${E(v)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label for="f_st">Status</label>
        <select id="f_st" data-f="f_st">
          <option value="">All</option>
          <option value="active" ${S.f_st === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${S.f_st === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>

    <div class="scroll">
      <table>
        <tr>
          <th>Name
          <th>Department
          <th>Designation
          <th>Cabin Location
          <th>Email
          <th>Status
          <th>Actions
        </tr>
        ${filtered.map(f => `
          <tr>
            <td><b>${E(f.faculty_name)}</b></td>
            <td>${E(S.dep[f.department_id] || f.department_id)}</td>
            <td>${E(f.designation)}</td>
            <td><b>${E(f.cabin_location)}</b></td>
            <td class="mono">${E(f.email || '-')}</td>
            <td><span class="bd ${f.account_status === 'active' ? 'ok' : 'er'}">${E(f.account_status)}</span></td>
            <td>
              <button class="b2" data-a="modal_edit_faculty" data-i="${f.faculty_id}">Edit</button>
              <button class="b3" data-a="archive_faculty" data-i="${f.faculty_id}">${f.account_status === 'active' ? 'Deactivate' : 'Archive'}</button>
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
    <p class="mu" style="margin-top:6px">Showing ${filtered.length} of ${S.fac.length} faculty members.</p>
  `;
}

// Departments & Timetables Management (Requirement #1)
function adminDeptTimetableView() {
  const currentFacId = S.tt_fac || (S.fac[0] ? S.fac[0].faculty_id : '');
  const selectedFaculty = F()[currentFacId];
  const facultyClasses = S.tt.filter(t => t.faculty_id === currentFacId);
  const facultyAvail = S.av.filter(a => a.faculty_id === currentFacId);

  return `
    <h1>Department and Timetable Management</h1>
    
    <h2>1. Institutional Departments</h2>
    <div class="scroll" style="margin-bottom:12px">
      <table>
        <tr><th>ID<th>Department Name<th>Actions</tr>
        ${Object.entries(S.dep).map(([id, name]) => `
          <tr>
            <td class="mono">${E(id)}</td>
            <td><b>${E(name)}</b></td>
            <td><button class="b2" data-a="modal_edit_department" data-i="${id}">Edit Name</button></td>
          </tr>
        `).join('')}
      </table>
    </div>
    <button class="b2" data-a="modal_add_department">+ Add New Department</button>

    <h2 style="margin-top:28px">2. Faculty Teaching Timetables & Consultation Availability</h2>
    <label for="tt_fac">Select Faculty Member</label>
    <select id="tt_fac" data-f="tt_fac">
      ${S.fac.map(f => `<option value="${f.faculty_id}" ${currentFacId === f.faculty_id ? 'selected' : ''}>${E(f.faculty_name)} (${E(S.dep[f.department_id])})</option>`).join('')}
    </select>

    ${selectedFaculty ? `
      <div style="margin-top:14px">
        <div class="row" style="justify-content:space-between">
          <h3>Scheduled Teaching Classes for ${E(selectedFaculty.faculty_name)}</h3>
          <button class="b1" data-a="modal_add_timetable" data-i="${currentFacId}">+ Add Teaching Period</button>
        </div>
        <div class="scroll">
          <table>
            <tr><th>Day<th>Time<th>Course Name<th>Classroom<th>Section<th>Action</tr>
            ${facultyClasses.map(t => `
              <tr>
                <td><b>${E(t.day_of_week)}</b></td>
                <td class="mono">${E(t.start_time)}-${E(t.end_time)}</td>
                <td>${E(t.course_name)}</td>
                <td>${E(t.classroom)}</td>
                <td>${E(t.section)}</td>
                <td><button class="b3" data-a="delete_timetable" data-i="${t.schedule_id}">Delete</button></td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="mu">No teaching classes registered.</td></tr>'}
          </table>
        </div>

        <div class="row" style="justify-content:space-between;margin-top:20px">
          <h3>Consultation Availability Blocks</h3>
          <button class="b1" data-a="modal_add_avail" data-i="${currentFacId}">+ Add Consultation Hours</button>
        </div>
        <div class="scroll">
          <table>
            <tr><th>Day<th>Time<th>Slot Duration<th>Location<th>Action</tr>
            ${facultyAvail.map(a => `
              <tr>
                <td><b>${E(a.day_of_week)}</b></td>
                <td class="mono">${E(a.start_time)}-${E(a.end_time)}</td>
                <td>${a.slot_duration_minutes} minutes</td>
                <td>${E(a.location)}</td>
                <td><button class="b3" data-a="delete_avail" data-i="${a.availability_id}">Delete</button></td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="mu">No consultation blocks registered.</td></tr>'}
          </table>
        </div>
      </div>
    ` : ''}
  `;
}

function adminAuditView() {
  const logs = [...S.aud].reverse();
  return `
    <h1>System Audit Log</h1>
    <p class="mu">Chronological record of institutional actions, appointment cancellations, outcome resolutions, and profile updates.</p>
    <div class="scroll" style="margin-top:14px">
      <table>
        <tr><th>Timestamp<th>Actor<th>Action<th>Target Ref<th>Details</tr>
        ${logs.map(l => `
          <tr>
            <td class="mono">${new Date(l.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium' })}</td>
            <td><span class="mono">${E(l.actor)}</span></td>
            <td><b>${E(l.action)}</b></td>
            <td class="mono">${E(l.apt || '-')}</td>
            <td class="mono" style="font-size:12px">${E(JSON.stringify(l.meta || {}))}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
}

// -------------------------------------------------------------
// MODALS FOR DATA MANAGEMENT & DIALOGS
// -------------------------------------------------------------
function showModal(title, bodyHtml, onConfirm = null, confirmText = 'Save Changes') {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head">
          <h2>${title}</h2>
          <button class="close-btn" data-a="close_modal">&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="row" style="margin-top:18px;justify-content:flex-end">
          <button class="b2" data-a="close_modal">Cancel</button>
          ${onConfirm ? `<button class="b1" id="modal-confirm-btn">${confirmText}</button>` : ''}
        </div>
      </div>
    </div>
  `;
  if (onConfirm) {
    $('#modal-confirm-btn').addEventListener('click', async () => {
      const btn = $('#modal-confirm-btn');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        await onConfirm();
        closeModal();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = confirmText;
      }
    });
  }
}

function closeModal() {
  const root = $('#modal-root');
  if (root) root.innerHTML = '';
}

// -------------------------------------------------------------
// EVENT DISPATCHER & ACTIONS
// -------------------------------------------------------------
const fail = m => {
  S.err = m;
  if (S.b) S.b.busy = 0;
  render();
};

const act = {
  role: i => { S.pick = i; render(); },
  login: async () => {
    S.role = S.pick;
    S.uid = S.role === 'admin' ? 'ADM0001' : $('#who').value;
    S.view = 'home';
    S.err = '';
    S.msg = '';
    await fetchBootstrap();
  },
  out: () => {
    S.role = null;
    S.pick = null;
    S.b = null;
    S.sched = null;
    S.view = 'home';
    S.err = '';
    S.msg = '';
    render();
  },
  doc: i => { S.view = 'doc'; S.arg = i; render(); },
  back: () => { S.view = S.role ? 'home' : 'home'; render(); },
  go: (i, j) => {
    S.view = i;
    S.arg = j;
    S.b = null;
    S.done = null;
    S.err = '';
    S.msg = '';
    render();
    window.scrollTo(0, 0);
  },
  date: (i, j) => { S.b = { fid: j, date: i }; render(); },
  slot: (i, j) => { S.b = { ...S.b, s: i, e: j, step: null }; render(); },
  review: () => {
    const b = S.b;
    if (!b.reason) return fail('Please select a consultation reason.');
    if (RS()[b.reason]?.requires_additional_details && !(b.msg || '').trim()) {
      return fail('Please provide a short explanation message for this reason.');
    }
    S.err = '';
    b.step = 'review';
    render();
  },
  unreview: () => { S.b.step = null; render(); },

  // Student booking confirmation
  async confirm() {
    const b = S.b;
    b.busy = 1;
    render();
    try {
      const res = await api('/api/appointments/book', {
        method: 'POST',
        body: JSON.stringify({
          student_id: S.uid,
          faculty_id: b.fid,
          reason_id: b.reason,
          appointment_date: b.date,
          start_time: b.s,
          end_time: b.e,
          student_message: b.msg
        })
      });
      S.done = res.appointment_id;
      S.b = null;
      S.err = '';
      S.msg = 'Appointment successfully confirmed!';
      await fetchBootstrap();
    } catch (e) {
      fail('Booking failed: ' + e.message);
    }
  },

  // Faculty Schedule Meeting handlers (Requirement #2)
  sched_student: id => {
    if (!S.sched) S.sched = {};
    S.sched.student_id = id;
    render();
  },
  sched_date: d => {
    if (!S.sched) S.sched = {};
    S.sched.date = d;
    S.sched.slot = '';
    render();
  },
  sched_slot: (s, e) => {
    if (!S.sched) S.sched = {};
    S.sched.slot = s;
    S.sched.end_slot = e;
    render();
  },
  sched_confirm: async () => {
    const sched = S.sched;
    if (!sched.student_id || !sched.date || !sched.slot) return;
    if (sched.reason_id === 'RSN010' && !(sched.custom_reason || '').trim()) {
      return alert('Please specify the custom meeting reason.');
    }
    try {
      await api('/api/appointments/schedule-meeting', {
        method: 'POST',
        body: JSON.stringify({
          faculty_id: S.uid,
          student_id: sched.student_id,
          reason_id: sched.reason_id,
          custom_reason: sched.custom_reason,
          appointment_date: sched.date,
          start_time: sched.slot,
          end_time: sched.end_slot,
          message: sched.msg
        })
      });
      S.sched = null;
      S.msg = 'Meeting invitation successfully sent to the student!';
      S.view = 'apts';
      await fetchBootstrap();
    } catch (e) {
      alert('Error scheduling meeting: ' + e.message);
    }
  },

  // Student accepts/declines faculty invitations (Requirement #2)
  async accept_invite(id) {
    if (!confirm('Accept this faculty meeting invitation? This will confirm the appointment.')) return;
    try {
      await api(`/api/appointments/${id}/accept`, {
        method: 'POST',
        body: JSON.stringify({ student_id: S.uid })
      });
      S.msg = 'Meeting invitation confirmed successfully!';
      await fetchBootstrap();
    } catch (e) {
      alert('Error confirming invitation: ' + e.message);
    }
  },

  decline_invite: id => {
    showModal('Decline Meeting Invitation', `
      <p>Are you sure you want to decline this meeting invitation? The reserved slot will be released.</p>
      <label for="dec_reason">Reason for Declining (Optional)</label>
      <input id="dec_reason" placeholder="e.g. Clashing exam, out of station...">
    `, async () => {
      const reason = $('#dec_reason').value;
      await api(`/api/appointments/${id}/decline`, {
        method: 'POST',
        body: JSON.stringify({ student_id: S.uid, reason })
      });
      S.msg = 'Meeting invitation declined.';
      await fetchBootstrap();
    }, 'Decline Invitation');
  },

  // Working Cancellation Engine (Requirement #3)
  cancel: i => {
    const apt = S.apt.find(a => a.appointment_id === i);
    if (!apt) return alert('Appointment record not found');

    showModal('Cancel Appointment', `
      <p>Are you sure you want to cancel the appointment on <b>${fD(apt.appointment_date)}</b> at <b>${apt.start_time}</b>?</p>
      <p class="mu">The reserved slot will be immediately released for other participants.</p>
      <label for="canc_reason">Cancellation Reason</label>
      <input id="canc_reason" placeholder="Brief reason for cancellation..." required>
    `, async () => {
      const reason = $('#canc_reason').value;
      await api(`/api/appointments/${i}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      S.msg = 'Appointment successfully cancelled and slot released.';
      await fetchBootstrap();
    }, 'Confirm Cancellation');
  },

  // Outcome reporting & ratings
  rep: async (i, j) => {
    try {
      await api(`/api/appointments/${i}/report`, {
        method: 'POST',
        body: JSON.stringify({ outcome: j })
      });
      S.msg = 'Outcome report successfully submitted.';
      await fetchBootstrap();
    } catch (e) {
      alert('Report submission error: ' + e.message);
    }
  },

  rate: async (i, j) => {
    try {
      await api(`/api/appointments/${i}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating: j })
      });
      S.msg = 'Thank you for your rating!';
      await fetchBootstrap();
    } catch (e) {
      alert('Rating error: ' + e.message);
    }
  },

  skip: i => {
    S.skip[i] = 1;
    render();
  },

  // Admin dispute resolution
  resolve: async (i, j) => {
    if (!confirm(`Record administrative resolution as '${OUT[j] || j}'? Both original attendance reports will be preserved in audit records.`)) return;
    try {
      await api(`/api/appointments/${i}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ outcome: j })
      });
      S.msg = 'Dispute successfully resolved.';
      await fetchBootstrap();
    } catch (e) {
      alert('Resolution error: ' + e.message);
    }
  },

  // Notifications
  read: async i => {
    await api(`/api/notifications/${i}/read`, { method: 'POST' });
    const n = S.nt.find(x => x.id === i);
    if (n) n.read = true;
    render();
  },

  read_all: async () => {
    await api('/api/notifications/read-all', { method: 'POST' });
    S.nt.forEach(n => { n.read = true; });
    render();
  },

  close_modal: () => closeModal(),

  // -----------------------------------------------------------
  // ADMIN MODALS: STUDENT MANAGEMENT
  // -----------------------------------------------------------
  modal_add_student: () => {
    showModal('Add New Student', `
      <label for="m_s_name">Student Full Name</label>
      <input id="m_s_name" placeholder="e.g. Aarav Sharma" required>
      <label for="m_s_usn">USN (Unique Identifier)</label>
      <input id="m_s_usn" placeholder="e.g. 1SV25CS031" required>
      <label for="m_s_dob">Date of Birth</label>
      <input id="m_s_dob" type="date" value="2005-01-01" required>
      <label for="m_s_dept">Department</label>
      <select id="m_s_dept">
        ${Object.entries(S.dep).map(([k, v]) => `<option value="${k}">${E(v)}</option>`).join('')}
      </select>
      <div class="row">
        <div>
          <label for="m_s_sem">Semester</label>
          <input id="m_s_sem" type="number" min="1" max="8" value="3" style="width:80px">
        </div>
        <div>
          <label for="m_s_sec">Section</label>
          <input id="m_s_sec" value="A" maxlength="2" style="width:80px">
        </div>
      </div>
      <label for="m_s_st">Account Status</label>
      <select id="m_s_st">
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    `, async () => {
      const student_name = $('#m_s_name').value;
      const usn = $('#m_s_usn').value;
      const dob = $('#m_s_dob').value;
      const department_id = $('#m_s_dept').value;
      const semester = $('#m_s_sem').value;
      const section = $('#m_s_sec').value;
      const account_status = $('#m_s_st').value;

      await api('/api/students', {
        method: 'POST',
        body: JSON.stringify({ student_name, usn, dob, department_id, semester, section, account_status })
      });
      S.msg = 'Student record successfully added to central database!';
      await fetchBootstrap();
    }, 'Add Student');
  },

  modal_edit_student: id => {
    const s = S.stu.find(x => x.student_id === id);
    if (!s) return alert('Student not found');

    showModal(`Edit Student Record (${E(s.student_id)})`, `
      <label for="m_s_name">Student Full Name</label>
      <input id="m_s_name" value="${E(s.student_name)}" required>
      <label for="m_s_usn">USN (Unique Identifier)</label>
      <input id="m_s_usn" value="${E(s.usn)}" required>
      <label for="m_s_dob">Date of Birth</label>
      <input id="m_s_dob" type="date" value="${E(s.dob || '2005-01-01')}" required>
      <label for="m_s_dept">Department</label>
      <select id="m_s_dept">
        ${Object.entries(S.dep).map(([k, v]) => `<option value="${k}" ${s.department_id === k ? 'selected' : ''}>${E(v)}</option>`).join('')}
      </select>
      <div class="row">
        <div>
          <label for="m_s_sem">Semester</label>
          <input id="m_s_sem" type="number" min="1" max="8" value="${s.semester}" style="width:80px">
        </div>
        <div>
          <label for="m_s_sec">Section</label>
          <input id="m_s_sec" value="${E(s.section)}" maxlength="2" style="width:80px">
        </div>
      </div>
      <label for="m_s_st">Account Status</label>
      <select id="m_s_st">
        <option value="active" ${s.account_status === 'active' ? 'selected' : ''}>Active</option>
        <option value="inactive" ${s.account_status === 'inactive' ? 'selected' : ''}>Inactive</option>
      </select>
      <p class="mu" style="margin-top:10px">Internal ID: <span class="mono">${E(s.student_id)}</span> and appointment history are preserved.</p>
    `, async () => {
      const student_name = $('#m_s_name').value;
      const usn = $('#m_s_usn').value;
      const dob = $('#m_s_dob').value;
      const department_id = $('#m_s_dept').value;
      const semester = $('#m_s_sem').value;
      const section = $('#m_s_sec').value;
      const account_status = $('#m_s_st').value;

      await api(`/api/students/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ student_name, usn, dob, department_id, semester, section, account_status })
      });
      S.msg = 'Student updated! Changes are reflected throughout the institution.';
      await fetchBootstrap();
    }, 'Save Changes');
  },

  archive_student: async id => {
    const s = S.stu.find(x => x.student_id === id);
    if (!s) return;
    if (!confirm(`Are you sure you want to deactivate or archive student ${s.student_name} (${s.usn})? Historical appointment records will be preserved.`)) return;

    try {
      await api(`/api/students/${id}`, { method: 'DELETE' });
      S.msg = `Student ${s.student_name} archived safely.`;
      await fetchBootstrap();
    } catch (e) {
      alert(e.message);
    }
  },

  modal_import_students: () => {
    showModal('Import Students via CSV', `
      <p class="mu">Paste CSV rows below with header: <code>student_name,usn,dob,department_id,semester,section,account_status</code></p>
      <textarea id="csv_paste" rows="8" placeholder="student_name,usn,dob,department_id,semester,section,account_status&#10;Kavita Sharma,DEMO-CSE-099,2005-04-12,DEPT001,3,A,active"></textarea>
    `, async () => {
      const csv = $('#csv_paste').value;
      const res = await api('/api/students/import-csv', {
        method: 'POST',
        body: JSON.stringify({ csv })
      });
      S.msg = `Successfully imported ${res.createdCount} student(s).`;
      if (res.errors && res.errors.length) {
        alert(`Imported ${res.createdCount} rows with some warnings:\n${res.errors.join('\n')}`);
      }
      await fetchBootstrap();
    }, 'Import CSV');
  },

  // -----------------------------------------------------------
  // ADMIN MODALS: FACULTY MANAGEMENT
  // -----------------------------------------------------------
  modal_add_faculty: () => {
    showModal('Add Faculty Member', `
      <label for="m_f_name">Faculty Full Name</label>
      <input id="m_f_name" placeholder="e.g. Dr. Kavitha Rao" required>
      <label for="m_f_dept">Department</label>
      <select id="m_f_dept">
        ${Object.entries(S.dep).map(([k, v]) => `<option value="${k}">${E(v)}</option>`).join('')}
      </select>
      <label for="m_f_desig">Designation</label>
      <input id="m_f_desig" placeholder="e.g. Professor" required>
      <label for="m_f_cabin">Cabin Location (Building, Floor, Room)</label>
      <input id="m_f_cabin" placeholder="e.g. C Block, Ground Floor, Room 208" required>
      <label for="m_f_email">Official Email</label>
      <input id="m_f_email" type="email" placeholder="e.g. prof.rao@institution.edu">
      <label for="m_f_st">Account Status</label>
      <select id="m_f_st">
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    `, async () => {
      const faculty_name = $('#m_f_name').value;
      const department_id = $('#m_f_dept').value;
      const designation = $('#m_f_desig').value;
      const cabin_location = $('#m_f_cabin').value;
      const email = $('#m_f_email').value;
      const account_status = $('#m_f_st').value;

      await api('/api/faculty', {
        method: 'POST',
        body: JSON.stringify({ faculty_name, department_id, designation, cabin_location, email, account_status })
      });
      S.msg = 'Faculty member created in central database!';
      await fetchBootstrap();
    }, 'Add Faculty');
  },

  modal_edit_faculty: id => {
    const f = S.fac.find(x => x.faculty_id === id);
    if (!f) return alert('Faculty not found');

    showModal(`Edit Faculty Record (${E(f.faculty_id)})`, `
      <label for="m_f_name">Faculty Full Name</label>
      <input id="m_f_name" value="${E(f.faculty_name)}" required>
      <label for="m_f_dept">Department</label>
      <select id="m_f_dept">
        ${Object.entries(S.dep).map(([k, v]) => `<option value="${k}" ${f.department_id === k ? 'selected' : ''}>${E(v)}</option>`).join('')}
      </select>
      <label for="m_f_desig">Designation</label>
      <input id="m_f_desig" value="${E(f.designation)}" required>
      <label for="m_f_cabin">Cabin Location (Building, Floor, Room)</label>
      <input id="m_f_cabin" value="${E(f.cabin_location)}" required>
      <div class="mu">Updating cabin location updates faculty directory and student booking screens immediately.</div>
      <label for="m_f_email">Official Email</label>
      <input id="m_f_email" type="email" value="${E(f.email || '')}">
      <label for="m_f_st">Account Status</label>
      <select id="m_f_st">
        <option value="active" ${f.account_status === 'active' ? 'selected' : ''}>Active</option>
        <option value="inactive" ${f.account_status === 'inactive' ? 'selected' : ''}>Inactive</option>
      </select>
    `, async () => {
      const faculty_name = $('#m_f_name').value;
      const department_id = $('#m_f_dept').value;
      const designation = $('#m_f_desig').value;
      const cabin_location = $('#m_f_cabin').value;
      const email = $('#m_f_email').value;
      const account_status = $('#m_f_st').value;

      await api(`/api/faculty/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ faculty_name, department_id, designation, cabin_location, email, account_status })
      });
      S.msg = 'Faculty record updated! Updated cabin location is now live institutional-wide.';
      await fetchBootstrap();
    }, 'Save Changes');
  },

  archive_faculty: async id => {
    const f = S.fac.find(x => x.faculty_id === id);
    if (!f) return;
    if (!confirm(`Are you sure you want to deactivate or archive faculty member ${f.faculty_name}? Historical appointment records will be preserved.`)) return;

    try {
      await api(`/api/faculty/${id}`, { method: 'DELETE' });
      S.msg = `Faculty ${f.faculty_name} archived safely.`;
      await fetchBootstrap();
    } catch (e) {
      alert(e.message);
    }
  },

  modal_import_faculty: () => {
    showModal('Import Faculty via CSV', `
      <p class="mu">Paste CSV rows below with header: <code>faculty_name,department_id,designation,cabin_location,email,account_status</code></p>
      <textarea id="csv_paste" rows="8" placeholder="faculty_name,department_id,designation,cabin_location,email,account_status&#10;Dr. Sanjay Kumar,DEPT001,Professor,C Block 301,sanjay@example.com,active"></textarea>
    `, async () => {
      const csv = $('#csv_paste').value;
      const res = await api('/api/faculty/import-csv', {
        method: 'POST',
        body: JSON.stringify({ csv })
      });
      S.msg = `Successfully imported ${res.createdCount} faculty member(s).`;
      if (res.errors && res.errors.length) {
        alert(`Imported ${res.createdCount} rows with some warnings:\n${res.errors.join('\n')}`);
      }
      await fetchBootstrap();
    }, 'Import CSV');
  },

  // -----------------------------------------------------------
  // ADMIN MODALS: DEPARTMENTS & TIMETABLES
  // -----------------------------------------------------------
  modal_add_department: () => {
    showModal('Add Department', `
      <label for="m_dept_name">Department Name</label>
      <input id="m_dept_name" placeholder="e.g. Mechanical Engineering" required>
    `, async () => {
      const department_name = $('#m_dept_name').value;
      await api('/api/departments', {
        method: 'POST',
        body: JSON.stringify({ department_name })
      });
      S.msg = 'Department added successfully!';
      await fetchBootstrap();
    }, 'Add Department');
  },

  modal_edit_department: id => {
    const name = S.dep[id] || '';
    showModal(`Edit Department Name (${id})`, `
      <label for="m_dept_name">Department Name</label>
      <input id="m_dept_name" value="${E(name)}" required>
    `, async () => {
      const department_name = $('#m_dept_name').value;
      await api(`/api/departments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ department_name })
      });
      S.msg = 'Department name updated centrally!';
      await fetchBootstrap();
    }, 'Save Changes');
  },

  modal_add_timetable: fid => {
    const f = F()[fid];
    showModal(`Add Teaching Period for ${E(f?.faculty_name)}`, `
      <label for="m_tt_day">Day of Week</label>
      <select id="m_tt_day">
        ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => `<option value="${d}">${d}</option>`).join('')}
      </select>
      <div class="row">
        <div>
          <label for="m_tt_s">Start Time (HH:MM)</label>
          <input id="m_tt_s" value="09:00" placeholder="09:00" required>
        </div>
        <div>
          <label for="m_tt_e">End Time (HH:MM)</label>
          <input id="m_tt_e" value="10:00" placeholder="10:00" required>
        </div>
      </div>
      <label for="m_tt_c">Course Name</label>
      <input id="m_tt_c" placeholder="e.g. Computer Networks" required>
      <label for="m_tt_r">Classroom</label>
      <input id="m_tt_r" placeholder="e.g. C Block, Room 302" required>
      <label for="m_tt_sec">Section</label>
      <input id="m_tt_sec" value="A" required>
    `, async () => {
      const day_of_week = $('#m_tt_day').value;
      const start_time = $('#m_tt_s').value;
      const end_time = $('#m_tt_e').value;
      const course_name = $('#m_tt_c').value;
      const classroom = $('#m_tt_r').value;
      const section = $('#m_tt_sec').value;

      await api('/api/timetable', {
        method: 'POST',
        body: JSON.stringify({ faculty_id: fid, day_of_week, start_time, end_time, course_name, classroom, section })
      });
      S.msg = 'Teaching schedule added successfully!';
      await fetchBootstrap();
    }, 'Add Teaching Class');
  },

  delete_timetable: async id => {
    if (!confirm('Delete this scheduled class?')) return;
    try {
      await api(`/api/timetable/${id}`, { method: 'DELETE' });
      S.msg = 'Class removed from timetable.';
      await fetchBootstrap();
    } catch (e) {
      alert(e.message);
    }
  },

  modal_add_avail: fid => {
    const f = F()[fid];
    showModal(`Add Consultation Availability for ${E(f?.faculty_name)}`, `
      <label for="m_av_day">Day of Week</label>
      <select id="m_av_day">
        ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => `<option value="${d}">${d}</option>`).join('')}
      </select>
      <div class="row">
        <div>
          <label for="m_av_s">Start Time</label>
          <input id="m_av_s" value="13:00" placeholder="13:00" required>
        </div>
        <div>
          <label for="m_av_e">End Time</label>
          <input id="m_av_e" value="14:00" placeholder="14:00" required>
        </div>
      </div>
      <label for="m_av_dur">Slot Duration</label>
      <select id="m_av_dur">
        <option value="15">15 minutes</option>
        <option value="30">30 minutes</option>
      </select>
      <label for="m_av_loc">Consultation Location</label>
      <input id="m_av_loc" value="${E(f?.cabin_location || 'Faculty Cabin')}" required>
    `, async () => {
      const day_of_week = $('#m_av_day').value;
      const start_time = $('#m_av_s').value;
      const end_time = $('#m_av_e').value;
      const slot_duration_minutes = $('#m_av_dur').value;
      const location = $('#m_av_loc').value;

      await api('/api/availability', {
        method: 'POST',
        body: JSON.stringify({ faculty_id: fid, day_of_week, start_time, end_time, slot_duration_minutes, location })
      });
      S.msg = 'Consultation availability block created!';
      await fetchBootstrap();
    }, 'Add Availability');
  },

  delete_avail: async id => {
    if (!confirm('Remove this consultation availability block?')) return;
    try {
      await api(`/api/availability/${id}`, { method: 'DELETE' });
      S.msg = 'Availability block removed.';
      await fetchBootstrap();
    } catch (e) {
      alert(e.message);
    }
  }
};

// Event Listeners for clicks, inputs, changes
document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]');
  if (t) {
    act[t.dataset.a]?.(t.dataset.i, t.dataset.j);
  }
});

document.addEventListener('input', e => {
  const k = e.target.dataset.f;
  if (!k) return;
  const v = e.target.value;
  if (k === 'q') {
    S.q = v;
    const l = $('#list');
    if (l) l.innerHTML = facList();
  } else if (k === 'sq') {
    S.sq = v;
    render();
  } else if (k === 'fq') {
    S.fq = v;
    render();
  } else if (k === 'msg' && S.b) {
    S.b.msg = v;
  } else if (k === 'sched_msg' && S.sched) {
    S.sched.msg = v;
  } else if (k === 'sched_custom' && S.sched) {
    S.sched.custom_reason = v;
  }
});

document.addEventListener('change', e => {
  const k = e.target.dataset.f;
  if (!k || k === 'q' || k === 'msg' || k === 'sched_msg' || k === 'sched_custom') return;
  const v = e.target.value;
  if (k === 'reason' && S.b) {
    S.b.reason = v;
  } else if (k === 'sched_reason' && S.sched) {
    S.sched.reason_id = v;
    render();
  } else if (k === 'tt_fac') {
    S.tt_fac = v;
    render();
  } else {
    S[k] = v;
    render();
  }
});

function draw() {
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('main')) return;
  render();
}

// Initial Bootstrapping
async function init() {
  initRealtime();
  await fetchBootstrap();
}

init();
