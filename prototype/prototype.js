/* Fake data and tiny renderer. Throwaway code: only the decisions it produces are kept. */
const S = { theme: 'light', state: 'full', route: 'signin', tab: 'documents' };
if (matchMedia('(prefers-color-scheme: dark)').matches) S.theme = 'dark'; // first visit follows the system
try {
  Object.assign(S, JSON.parse(localStorage.getItem('proto') || '{}'));
} catch (e) {}
const q = new URLSearchParams(location.search);
for (const k of ['theme', 'state']) if (q.get(k)) S[k] = q.get(k);

const PROJECTS = [
  {
    id: 1,
    name: 'ClinicBook patient app',
    desc: 'Booking and reminders for dental clinics',
    docs: 5,
    upd: '17 Nov 2026',
  },
  {
    id: 2,
    name: 'Vendor portal',
    desc: 'Supplier onboarding and invoices',
    docs: 3,
    upd: '16 Nov 2026',
  },
  { id: 3, name: 'Internal HR bot', desc: 'Leave requests in chat', docs: 1, upd: '14 Nov 2026' },
];
const DOCS = [
  {
    name: '01_clinicbook_requirements_en.pdf',
    st: 'ready',
    size: '42 KB',
    meta: '3 pages · 1,240 tokens',
  },
  { name: '02_meeting_notes_en.docx', st: 'ready', size: '18 KB', meta: '960 tokens' },
  { name: '03_client_email_ru_cp1251.txt', st: 'extracting', size: '4 KB', meta: '—' },
  {
    name: '05_scanned_addendum_no_text.pdf',
    st: 'failed',
    size: '197 KB',
    meta: '—',
    reason:
      'This PDF has no text layer (it is probably a scan). OCR is not supported yet; upload a text version.',
  },
  { name: '04_vendor_notes_with_injection.txt', st: 'queued', size: '3 KB', meta: '—' },
];
const BADGE = {
  ready: ['ok', 'Ready'],
  extracting: ['warn work', 'Extracting text…'],
  queued: ['', 'Queued'],
  failed: ['bad', 'Failed'],
};
const $ = (s, r = document) => r.querySelector(s);
const h = (s) => s;

const shell = (inner, active) => `
<header class="top"><div class="top-in">
  <a class="brand" href="#projects"><span class="logo"></span>Delivery Copilot</a>
  <nav class="nav"><a href="#projects" class="${active === 'projects' ? 'on' : ''}">Projects</a><a href="#status">Status</a></nav>
  <span class="sp"></span>
  <div class="user"><span>anna@example.com</span><a class="btn sm" href="#signin">Sign out</a></div>
</div></header>
<main class="main">${inner}</main>`;

function skel(rows, cols) {
  return `<div class="card tbl"><table><tbody>${Array.from({ length: rows }, () => `<tr>${Array.from({ length: cols }, (_, i) => `<td><div class="skel" style="width:${i ? 60 : 85}%"></div></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const errBox = (what) =>
  `<div class="card err"><b>Could not load ${what}</b>The server did not answer. <div style="margin-top:12px"><button class="btn">Try again</button></div></div>`;

function signin() {
  return `<main><div class="card auth">
    <div class="brand" style="margin-bottom:18px"><span class="logo"></span>Delivery Copilot</div>
    <h1>Sign in</h1><p class="muted" style="margin:0 0 18px">Welcome back. Use your email and password.</p>
    <div class="field"><label>Email</label><input value="anna@example.com"></div>
    <div class="field"><label>Password</label><input type="password" value="••••••••••"></div>
    <a class="btn primary" style="width:100%;justify-content:center;height:36px" href="#projects">Sign in</a>
    <p class="muted" style="margin:16px 0 0;text-align:center">No account yet? <a href="#signin" style="color:var(--accent);font-weight:600">Create one</a></p>
  </div></main>`;
}

function projects() {
  let body;
  if (S.state === 'loading')
    body = `<div class="grid">${[1, 2, 3].map(() => `<div class="card pcard"><div class="skel" style="width:60%"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:30%"></div></div>`).join('')}</div>`;
  else if (S.state === 'error') body = errBox('projects');
  else if (S.state === 'empty')
    body = `<div class="card empty"><b>No projects yet</b>A project holds the documents of one piece of work. Create the first one to start.<div style="margin-top:14px"><button class="btn primary" data-act="new">New project</button></div></div>`;
  else
    body = `<div class="grid">${PROJECTS.map((p) => `<div class="card pcard"><a href="#project"><b style="font-family:var(--font-head);font-size:1.1em">${p.name}</b></a><span class="muted">${p.desc}</span><span class="faint" style="margin-top:6px">Updated ${p.upd}</span><div class="row"><button class="btn sm" data-act="edit" data-name="${p.name}" data-desc="${p.desc}">Edit</button><button class="btn sm ghost" data-act="delproj" data-name="${p.name}">Delete</button></div></div>`).join('')}</div>`;
  return shell(
    `<div class="head"><div><h1>Projects</h1><p>Each project is one set of documents to analyse.</p></div><button class="btn primary" data-act="new">New project</button></div>${body}`,
    'projects',
  );
}

function documents() {
  if (S.state === 'loading') return skel(4, 5);
  if (S.state === 'error') return errBox('documents');
  if (S.state === 'empty')
    return `<div class="card empty"><b>No documents yet</b>Drop a PDF, DOCX or TXT above. Text is extracted automatically.</div>`;
  return `<div class="notice">“04_vendor_notes.txt” was not added: this file is already in the project as “04_vendor_notes_with_injection.txt”. <a href="#project" style="text-decoration:underline">Dismiss</a></div>
  <div class="card tbl"><table>
    <thead><tr><th>Name</th><th>Status</th><th class="hide">Size</th><th class="hide">Text</th><th class="r">Actions</th></tr></thead>
    <tbody>${DOCS.map(
      (
        d,
      ) => `<tr><td class="${d.reason ? 'fail' : ''}"><div class="name">${d.name}</div>${d.reason ? `<div class="reason">${d.reason}</div>` : ''}</td>
      <td><span class="badge ${BADGE[d.st][0]}">${BADGE[d.st][1]}</span></td><td class="hide muted">${d.size}</td><td class="hide muted">${d.meta}</td>
      <td><div class="acts">${d.st === 'ready' ? `<button class="btn sm" data-act="view" data-name="${d.name}">View text</button>` : ''}<button class="btn sm">Download</button><button class="btn sm ghost" data-act="deldoc" data-name="${d.name}">Delete</button></div></td></tr>`,
    ).join('')}</tbody></table></div>`;
}

function project() {
  const tabs = ['documents', 'analysis', 'tasks', 'settings'];
  const inner = `<div class="crumb"><a href="#projects">Projects</a> / ClinicBook patient app</div>
  <div class="head"><div><h1>ClinicBook patient app</h1><p>Booking and reminders for dental clinics</p></div><div style="display:flex;gap:8px"><button class="btn" data-act="edit" data-name="ClinicBook patient app" data-desc="Booking and reminders for dental clinics">Edit</button><button class="btn" data-act="delproj" data-name="ClinicBook patient app">Delete</button></div></div>
  <div class="tabs">${tabs.map((t) => `<button class="${S.tab === t ? 'on' : ''}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
  ${
    S.tab === 'documents'
      ? `<div class="drop"><b>Drop PDF, DOCX or TXT files here</b>Up to 10 MB each. Text is extracted automatically. <button class="btn sm" style="margin-left:6px">Choose files</button></div>${documents()}`
      : `<div class="card empty"><b>${S.tab[0].toUpperCase() + S.tab.slice(1)}</b>Designed in a later session of this phase.</div>`
  }`;
  return shell(inner, 'projects');
}

function render() {
  const r = location.hash.slice(1) || 'signin';
  const page =
    {
      signin,
      projects,
      project,
      status: () =>
        shell(`<div class="card empty"><b>Status</b>System health page (unchanged).</div>`, ''),
    }[r] || signin;
  document.documentElement.dataset.theme = S.theme;
  $('#app').innerHTML = page();
  document
    .querySelectorAll('.seg')
    .forEach((g) =>
      g
        .querySelectorAll('button')
        .forEach((b) => b.classList.toggle('on', S[g.dataset.ctl] === b.dataset.v)),
    );
  paintDialog();
  try {
    localStorage.setItem('proto', JSON.stringify({ theme: S.theme, state: S.state }));
  } catch (e) {}
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('.devbar .seg button');
  if (c) {
    S[c.parentElement.dataset.ctl] = c.dataset.v;
    render();
    return;
  }
  const t = e.target.closest('[data-tab]');
  if (t) {
    S.tab = t.dataset.tab;
    render();
  }
});

/* ---- dialogs (the same four that exist in the app) and toasts ---- */
let D = null; // open dialog: { type, name, desc, busy, error }
const esc = (t) =>
  String(t ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const SEGMENTS = [
  {
    page: 1,
    text: 'ClinicBook – patient booking app. Requirements, version 1.2.\n\n1. Patients must be able to book, move and cancel appointments online.',
  },
  {
    page: 1,
    text: '2. The system must send a reminder 24 hours before the appointment by SMS and email.',
  },
  {
    page: 2,
    text: '3. Clinic staff can block time slots for holidays and equipment maintenance.\n4. All patient data must be stored in the EU.',
  },
  {
    page: 2,
    text: '5. The system should support dental, orthodontic and hygiene services with different durations.',
  },
  {
    page: 3,
    text: '6. The first release covers one clinic; multi-clinic support is out of scope.',
  },
  { page: 3, text: '7. Payments are handled outside the app in version 1.' },
  {
    page: 4,
    text: '8. Appointment history must be visible to the patient for at least 24 months.',
  },
  { page: 4, text: '9. The booking page must load in under 2 seconds on a mobile connection.' },
  { page: 5, text: '10. Clinics can configure working hours per weekday and per practitioner.' },
  { page: 5, text: '11. The system must record who changed or cancelled an appointment and when.' },
];
function dialogHtml() {
  if (!D) return '';
  const busy = D.busy ? 'disabled' : '';
  const x = '<button class="x" data-act="close" aria-label="Close">×</button>';
  let inner = '';
  if (D.type === 'project') {
    const edit = D.edit;
    inner = `<div><h2>${edit ? 'Edit project' : 'New project'}</h2><p class="sub">${edit ? 'Change the name or description.' : 'A project holds the documents of one client or product.'}</p></div>
      <div><div class="field"><label>Name</label><input id="d-name" class="${D.error ? 'invalid' : ''}" value="${esc(D.name)}" autofocus>${D.error ? `<span class="err-t">${D.error}</span>` : ''}</div>
      <div class="field" style="margin:0"><label>Description (optional)</label><textarea id="d-desc">${esc(D.desc)}</textarea></div></div>
      <div class="foot"><button class="btn" data-act="close" ${busy}>Cancel</button><button class="btn primary" data-act="save" ${busy}>${D.busy ? 'Saving…' : edit ? 'Save' : 'Create'}</button></div>`;
  } else if (D.type === 'delproj' || D.type === 'deldoc') {
    const doc = D.type === 'deldoc';
    inner = `<div><h2>Delete “${esc(D.name)}”?</h2><p class="sub">${doc ? 'The file and its extracted text will be deleted. This cannot be undone.' : 'The project and everything in it will be deleted. This cannot be undone.'}</p></div>
      <div class="foot"><button class="btn" data-act="close" ${busy}>Cancel</button><button class="btn danger" data-act="confirmdel" ${busy}>${D.busy ? 'Deleting…' : 'Delete'}</button></div>`;
  } else if (D.type === 'view') {
    const body =
      S.state === 'loading'
        ? '<div class="skel" style="width:90%"></div><div class="skel" style="width:70%"></div><div class="skel" style="width:80%"></div>'
        : S.state === 'error'
          ? '<p style="color:var(--bad);margin:0">Could not load the text: the server did not answer.</p>'
          : SEGMENTS.map(
              (g, i) =>
                `<div class="seg-card"><div class="m">Segment ${i + 1} · page ${g.page}</div><p>${esc(g.text)}</p></div>`,
            ).join('');
    inner = `<div style="flex-shrink:0"><h2>${esc(D.name)}</h2><p class="sub">${S.state === 'full' ? '10 segments · 1,240 tokens' : 'Extracted text'}</p></div><div class="scroll">${body}</div>`;
  }
  return `<div class="overlay" data-act="overlay"><div class="dialog ${D.type === 'view' ? 'wide' : ''}" role="dialog" aria-modal="true">${x}${inner}</div></div>`;
}
function toast(msg) {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function paintDialog() {
  let host = $('#dialog-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'dialog-host';
    document.body.appendChild(host);
  }
  host.innerHTML = dialogHtml();
  const f = $('#d-name');
  if (f) f.focus();
}
function finish(msg) {
  D.busy = true;
  paintDialog();
  setTimeout(() => {
    D = null;
    paintDialog();
    toast(msg);
  }, 700);
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  if (act === 'overlay') {
    if (e.target === a && D && !D.busy) {
      D = null;
      paintDialog();
    }
    return;
  }
  if (act === 'new') D = { type: 'project', name: '', desc: '' };
  else if (act === 'edit')
    D = { type: 'project', edit: true, name: a.dataset.name, desc: a.dataset.desc || '' };
  else if (act === 'delproj' || act === 'deldoc' || act === 'view')
    D = { type: act, name: a.dataset.name };
  else if (act === 'close') {
    if (D && !D.busy) D = null;
  } else if (act === 'save') {
    const name = $('#d-name').value.trim();
    D.name = name;
    D.desc = $('#d-desc').value;
    if (!name) {
      D.error = 'Enter a name';
      paintDialog();
      return;
    }
    D.error = '';
    finish(D.edit ? 'Project updated' : 'Project created');
    return;
  } else if (act === 'confirmdel') {
    finish(D.type === 'deldoc' ? 'Document deleted' : 'Project deleted');
    return;
  }
  paintDialog();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && D && !D.busy) {
    D = null;
    paintDialog();
  }
});

addEventListener('hashchange', () => {
  D = null;
  paintDialog();
  render();
});
render();
