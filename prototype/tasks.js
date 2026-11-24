/* Tasks tab and the Linear part of the Settings tab: generate tasks from confirmed requirements, review and
   approve them, send to Linear with a confirmation, partial failure and retry of the failed ones.
   Fake data. Throwaway code: only the decisions it produces are kept (docs/design/screens.md). */

const LINEAR = { team: 'ClinicBook (CLB)', project: 'Patient app v1', workspace: 'Acme Studio' };

// status: draft, approved, rejected, sending, sent, failed
const TASK_SEED = [
  { id: 'T-1', req: 'REQ-001', title: 'Booking flow: book, move and cancel an appointment', priority: 'High', status: 'approved',
    desc: 'A patient picks a service, a practitioner and a free slot, and books it. From "My appointments" they can move or cancel it.',
    ac: ['A patient can book a free slot without calling the clinic', 'A booked slot is no longer shown as free', 'A patient can move a booking to another free slot', 'A patient can cancel a booking and the slot becomes free'] },
  { id: 'T-2', req: 'REQ-001', title: 'Enforce the cancellation and reschedule deadline', priority: 'Medium', status: 'draft', gap: 'G-1',
    desc: 'Moving or cancelling is allowed only until a deadline before the appointment. The deadline is not known yet.',
    ac: ['After the deadline the Move and Cancel buttons are disabled with an explanation', 'The deadline is a clinic setting'] },
  { id: 'T-3', req: 'REQ-002', title: 'Reminder scheduler: SMS and email 24 hours before', priority: 'High', status: 'approved',
    desc: 'A scheduled job sends one SMS and one email for every appointment 24 hours before it starts.',
    ac: ['Each appointment gets exactly one SMS and one email', 'A cancelled appointment gets no reminder', 'A failed send is retried and logged'] },
  { id: 'T-4', req: 'REQ-002', title: 'Connect an SMS and email provider', priority: 'Medium', status: 'approved',
    desc: 'Choose and connect providers for SMS and transactional email; keys come from the server environment.',
    ac: ['A test message reaches a real phone and mailbox', 'Provider keys are not stored in the code'] },
  { id: 'T-5', req: 'REQ-003', title: 'Staff can block time slots', priority: 'Medium', status: 'draft', outdated: true,
    desc: 'Clinic staff mark slots as blocked for holidays or maintenance; patients cannot book them.',
    ac: ['A blocked slot is not offered to patients', 'Staff see who blocked the slot and why'] },
  { id: 'T-6', req: 'REQ-006', title: 'Single-clinic configuration', priority: 'Low', status: 'rejected', note: 'Not a task: the constraint only limits scope.',
    desc: 'Hard-code one clinic in version 1.', ac: ['There is no clinic switcher'] },
];
const T = { stage: null, tasks: [], filter: 'all', sel: new Set(), open: null, pick: null, nextIssue: 41, failOnce: new Set(['T-4']) };
const TASK_META = {
  draft: ['', 'Draft'], approved: ['info', 'Approved'], rejected: ['bad', 'Rejected'],
  sending: ['warn work', 'Sending…'], sent: ['ok', 'In Linear'], failed: ['bad', 'Send failed'],
};
const taskById = (id) => T.tasks.find((t) => t.id === id);
const tBadge = (s) => `<span class="badge ${TASK_META[s][0]}">${TASK_META[s][1]}</span>`;
const confirmedReqs = () => REQS.filter((r) => r.status === 'confirmed');

/** The devbar picks a stage; switching it resets the fake tasks to what that stage looks like. */
function seedTasks() {
  T.stage = S.tasks;
  T.sel.clear();
  T.open = null;
  T.tasks = TASK_SEED.map((t) => ({ ...t, ac: [...t.ac] }));
  T.nextIssue = 41;
  T.failOnce = new Set(['T-4']); // the demo's rate-limited task: fails on its first send only
  if (S.tasks === 'sending') T.tasks.forEach((t) => t.status === 'approved' && (t.status = 'sending'));
  if (S.tasks === 'result') applyResult();
}
/** Generate again: unedited drafts are replaced, edited, approved, rejected and sent tasks are kept as they are. */
function regenerate() {
  const keep = T.tasks.filter((t) => t.edited || t.status !== 'draft');
  const fresh = TASK_SEED.filter((s) => !keep.some((k) => k.id === s.id)).map((t) => ({ ...t, ac: [...t.ac], status: 'draft', outdated: false }));
  T.tasks = [...keep, ...fresh].sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));
  T.stage = S.tasks;
}
function applyResult() {
  T.tasks.forEach((t) => {
    if (t.status !== 'approved' && t.status !== 'sending') return;
    if (T.failOnce.delete(t.id)) Object.assign(t, { status: 'failed', error: 'Linear is rate-limiting requests (429). Tried 3 times.' });
    else Object.assign(t, { status: 'sent', linear: `CLB-${T.nextIssue++}`, error: null });
  });
}

function tasksTab() {
  if (T.stage !== S.tasks) seedTasks();
  if (S.tasks === 'none') return generatePanel();
  if (S.tasks === 'generating') return generating();
  if (S.state === 'loading') return `<div class="card" style="padding:12px var(--pad);margin-bottom:14px"><div class="skel" style="width:40%"></div></div>${skel(5, 4)}`;
  if (S.state === 'error') return errBox('the tasks');
  if (S.state === 'empty') return `<div class="card empty"><b>No tasks were generated</b>The AI did not find work to split out of the chosen requirements. Pick other requirements, or add detail to them in Analysis.<div style="margin-top:14px"><button class="btn" data-t="regen-ask">Generate again</button></div></div>`;
  return taskList();
}

/* ---- before and during generation ---- */
function generatePanel() {
  const conf = confirmedReqs();
  if (S.state === 'empty' || conf.length === 0)
    return `<div class="card empty"><b>No confirmed requirements yet</b>Tasks are made only from requirements you confirmed, so AI mistakes do not reach your team's backlog.<div style="margin-top:14px"><button class="btn primary" data-tab="analysis">Review requirements</button></div></div>`;
  if (!T.pick) T.pick = new Set(conf.map((r) => r.id));
  const notConf = REQS.filter((r) => r.status === 'ai' || r.status === 'needs').length;
  const openGaps = (id) => GAPS.filter((g) => g.status === 'open' && g.reqs.includes(id));
  return `<div class="card" style="padding:var(--pad)">
    <h2 style="font-size:1.2em">Turn confirmed requirements into tasks</h2>
    <p class="muted" style="margin:6px 0 14px;max-width:62ch">The AI splits each requirement into tasks with acceptance criteria. You review and approve them; nothing goes to Linear until you send it.</p>
    <div class="card tbl" style="box-shadow:none;margin-bottom:12px"><table><tbody>${conf.map((r) => {
      const g = openGaps(r.id);
      return `<tr><td style="width:32px"><input type="checkbox" data-t="pick" data-v="${r.id}" ${T.pick.has(r.id) ? 'checked' : ''} aria-label="Include ${r.id}"></td>
        <td><div class="name">${esc(r.title)}</div><div class="faint">${r.id}${g.length ? ` <span class="chip warn">${g.length} open gap${g.length > 1 ? 's' : ''}: ${g.map((x) => x.id).join(', ')}</span>` : ''}</div></td>
        <td class="hide" style="white-space:nowrap"><span class="pdot" style="background:${PRIO_DOT[r.priority]}"></span>${r.priority}</td></tr>`;
    }).join('')}</tbody></table></div>
    ${notConf ? `<p class="faint" style="margin:0 0 6px">${notConf} requirements are not confirmed and are left out. <a href="#project" data-tab="analysis" style="color:var(--accent);font-weight:600">Review them</a></p>` : ''}
    <p class="faint" style="margin:0 0 16px">Open gaps are given to the AI too, so a task can say what is still unknown.</p>
    <button class="btn primary" data-t="gen" ${T.pick.size ? '' : 'disabled'}>Generate tasks (${T.pick.size})</button>
    <span class="faint" style="margin-left:10px">About 6,000 tokens · estimated $0.005 · under a minute</span></div>`;
}
function generating() {
  return `<div class="card" style="padding:var(--pad)"><h2 style="font-size:1.2em">Generating tasks for ${T.pick ? T.pick.size : confirmedReqs().length} requirements</h2>
    <p class="muted" style="margin:6px 0 16px">You can leave this page; the tasks appear here when they are ready.</p>
    <div class="meter" style="margin:0 0 16px"><i style="width:55%"></i></div>
    <button class="btn" data-t="gen-cancel">Cancel</button></div>`;
}

/* ---- the task list ---- */
function taskList() {
  const f = T.filter;
  const n = (s) => T.tasks.filter((t) => s === 'all' || t.status === s).length;
  const ready = T.tasks.filter((t) => t.status === 'approved').length;
  const failed = T.tasks.filter((t) => t.status === 'failed').length;
  const sending = T.tasks.filter((t) => t.status === 'sending').length;
  const filt = [['all', 'All'], ['draft', 'Draft'], ['approved', 'Approved'], ['sent', 'In Linear'], ...(failed ? [['failed', 'Send failed']] : []), ['rejected', 'Rejected']];
  const groups = [...new Set(T.tasks.map((t) => t.req))];
  const selN = T.sel.size;
  let banner = '';
  if (sending) banner = `<div class="card" style="padding:12px var(--pad);margin-bottom:14px;display:flex;gap:12px;align-items:center"><span class="badge warn work">Sending ${sending} tasks to Linear…</span><span class="muted">Each task is sent once; a retry checks Linear first, so nothing is created twice.</span></div>`;
  else if (failed) banner = `<div class="card" style="padding:12px var(--pad);margin-bottom:14px;border-color:var(--bad);display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <span><b>${T.tasks.filter((t) => t.status === 'sent').length} created in Linear, ${failed} failed.</b> <span class="muted">The created issues are kept; only the failed ${failed === 1 ? 'one is' : 'ones are'} sent again.</span></span><span class="sp"></span>
      <button class="btn sm primary" data-t="retry">Retry failed (${failed})</button></div>`;
  return `${banner}<div class="card" style="padding:12px var(--pad);display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <span><b>${T.tasks.length} tasks</b> <span class="muted">from ${groups.length} requirements · generated today 12:05 · cost $0.0049</span></span><span class="sp"></span>
      <button class="btn sm" data-t="regen-ask">Generate again</button></div>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <div class="seg2">${filt.map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-t="filter" data-v="${k}">${l} ${n(k)}</button>`).join('')}</div>
      ${selN ? `<span class="sp"></span><span class="muted">${selN} selected</span><button class="btn sm primary" data-t="bulk" data-v="approved">Approve selected</button><button class="btn sm" data-t="bulk" data-v="rejected">Reject selected</button><button class="btn sm ghost" data-t="bulk-clear">Clear</button>` : ''}</div>
    ${groups.map((g) => groupHtml(g, f)).join('') || '<div class="card empty" style="padding:24px">No tasks with this status.</div>'}
    <div class="readybar card"><span><b>${ready}</b> ${ready === 1 ? 'task is' : 'tasks are'} approved and ready to send</span><span class="sp"></span>
      <span class="faint hide-sm">${S.linear === 'ok' ? `${LINEAR.team} · ${LINEAR.project}` : 'Linear is not connected'}</span>
      <button class="btn primary" data-t="send-ask" ${ready && !sending ? '' : 'disabled'}>Send to Linear (${ready})</button></div>
    ${T.open ? taskSheet(taskById(T.open)) : ''}`;
}
function groupHtml(reqId, f) {
  const r = reqById(reqId);
  const rows = T.tasks.filter((t) => t.req === reqId && (f === 'all' || t.status === f));
  if (!rows.length) return '';
  return `<h3 class="grp"><a class="chip link" data-t="open-req" data-v="${r.id}">${r.id}</a>${esc(r.title)}</h3>
  <div class="card tbl" style="margin-bottom:6px"><table><tbody>${rows.map((t) => {
    const lock = ['sending', 'sent'].includes(t.status);
    return `<tr class="click ${t.status === 'rejected' ? 'off' : ''}" data-t="open" data-v="${t.id}">
      <td style="width:32px" data-t="none">${lock ? '' : `<input type="checkbox" data-t="sel" data-v="${t.id}" ${T.sel.has(t.id) ? 'checked' : ''} aria-label="Select ${t.id}">`}</td>
      <td style="height:auto;padding-block:9px"><div class="name">${esc(t.title)}</div>
        <div class="faint">${t.id} · ${t.ac.length} criteria${t.linear ? ` · <a class="chip link" style="margin:0" href="#project" data-t="none" title="Open in Linear">${t.linear} ↗</a>` : ''}${t.outdated ? ' <span class="chip warn">Requirement changed</span>' : ''}${t.gap ? ` <span class="chip warn">Open gap ${t.gap}</span>` : ''}</div>
        ${t.error ? `<div class="reason">${esc(t.error)}</div>` : ''}</td>
      <td class="hide" style="white-space:nowrap;width:1%"><span class="pdot" style="background:${PRIO_DOT[t.priority]}"></span>${t.priority}</td>
      <td class="r" style="white-space:nowrap;width:1%">${tBadge(t.status)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

/* ---- side panel: edit one task ---- */
function taskSheet(t) {
  const r = reqById(t.req);
  const ro = ['sending', 'sent'].includes(t.status);
  const field = (label, html) => `<div class="field" style="margin:0"><label>${label}</label>${html}</div>`;
  const body = ro
    ? `<p style="margin:0">${esc(t.desc)}</p>
       <div><div class="faint" style="margin-bottom:6px">Acceptance criteria</div><ul class="aclist">${t.ac.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>
       <div class="notice" style="margin:0;background:var(--surface-2);color:var(--ink-2)">${t.status === 'sent' ? `Created in Linear as <b>${t.linear}</b>. Change it in Linear from now on; edits here would not reach it.` : 'Being sent to Linear. It cannot be edited until the send finishes.'}</div>`
    : `${t.outdated ? `<div class="notice" style="margin:0">${r.id} was edited after this task was approved, so it went back to Draft. Check it against the new text and approve it again.</div>` : ''}
       ${t.gap ? `<div class="notice" style="margin:0">Open gap ${t.gap}: ${esc(GAPS.find((g) => g.id === t.gap).text)}</div>` : ''}
       ${field('Title', `<input id="t-title" value="${esc(t.title)}">`)}
       ${field('Description', `<textarea id="t-desc" class="ta">${esc(t.desc)}</textarea>`)}
       ${field('Priority', `<select id="t-prio" class="sel">${['Urgent', 'High', 'Medium', 'Low'].map((p) => `<option ${p === t.priority ? 'selected' : ''}>${p}</option>`).join('')}</select>`)}
       <div class="field" style="margin:0"><label>Acceptance criteria</label>
         ${t.ac.map((a, i) => `<div class="acrow"><input data-ac="${i}" value="${esc(a)}" aria-label="Criterion ${i + 1}"><button class="btn sm ghost" data-t="ac-del" data-v="${i}" aria-label="Remove criterion ${i + 1}" ${t.ac.length === 1 ? 'disabled title="A task needs at least one criterion"' : ''}>×</button></div>`).join('')}
         <button class="btn sm" style="align-self:flex-start" data-t="ac-add">+ Add criterion</button></div>`;
  const foot = ro
    ? `${t.linear ? `<a class="btn" href="#project">Open ${t.linear} in Linear ↗</a>` : ''}`
    : t.status === 'rejected'
      ? `<span class="faint">${esc(t.note || 'Rejected')}</span><span class="sp"></span><button class="btn" data-t="set" data-v="draft">Restore as draft</button>`
      : `<button class="btn" data-t="set" data-v="rejected">Reject</button><span class="sp"></span><button class="btn" data-t="save">Save</button><button class="btn primary" data-t="set" data-v="approved">${t.status === 'approved' ? 'Save, keep approved' : 'Approve'}</button>`;
  return `<div class="overlay sheet-bg" data-t="sheet-bg"><aside class="sheet" role="dialog" aria-modal="true" aria-label="${t.id}">
    <button class="x" data-t="sheet-close" aria-label="Close">×</button>
    <div class="faint">${t.id} · from <a class="chip link" style="margin:0" data-t="open-req" data-v="${r.id}">${r.id}</a></div>
    <h2 style="margin:2px 28px 8px 0">${esc(t.title)}</h2>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${tBadge(t.status)}${t.edited ? '<span class="chip">Edited</span>' : ''}</div>
    <div class="scroll" style="gap:14px">${body}
      <div><div class="faint" style="margin-bottom:6px">Source of ${r.id}</div><blockquote class="quote">“${esc(r.quote)}”</blockquote><div class="faint" style="margin-top:6px">${srcLabel(r.doc, r.page)}</div></div></div>
    <div class="foot" style="flex-wrap:wrap;border-top:1px solid var(--line);padding-top:12px;align-items:center">${foot}</div></aside></div>`;
}

/* ---- Settings tab: the Linear connection ---- */
function settingsTab() {
  if (S.state === 'loading') return `<div class="card" style="padding:var(--pad)"><div class="skel" style="width:30%"></div><div class="skel" style="width:70%;margin-top:12px"></div><div class="skel" style="width:50%;margin-top:12px"></div></div>`;
  if (S.state === 'error') return errBox('the settings');
  const st = {
    ok: ['ok', 'Connected', `Workspace ${LINEAR.workspace}. The API key comes from the server (LINEAR_API_KEY) and is never shown here.`],
    none: ['', 'Not connected', 'Set LINEAR_API_KEY on the server and restart it. A personal API key with the "Create issues" scope is enough.'],
    bad: ['bad', 'Key rejected', 'Linear did not accept LINEAR_API_KEY: it is wrong, expired or revoked. Create a new key in Linear (Settings → API) and restart the server.'],
  }[S.linear];
  const off = S.linear !== 'ok' ? 'disabled' : '';
  const map = [['Urgent', '1 · Urgent'], ['High', '2 · High'], ['Medium', '3 · Medium'], ['Low', '4 · Low']];
  return `<div class="card" style="padding:var(--pad);max-width:720px">
    <div class="frow"><h2 style="font-size:1.2em">Linear</h2><span class="badge ${st[0]}">${st[1]}</span><span class="sp"></span><button class="btn sm" data-t="test">Check connection</button></div>
    <p class="muted" style="margin:6px 0 18px">${st[2]}</p>
    ${S.linear === 'ok' ? '' : '<div class="notice">Tasks can be generated and approved, but not sent, until Linear is connected.</div>'}
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-bottom:6px">
      <div class="field"><label>Team</label><select class="sel" ${off}><option>${S.linear === 'ok' ? LINEAR.team : '—'}</option><option>Mobile (MOB)</option></select></div>
      <div class="field"><label>Project (optional)</label><select class="sel" ${off}><option>${S.linear === 'ok' ? LINEAR.project : '—'}</option><option>No project</option></select></div></div>
    <label class="check"><input type="checkbox" checked ${off}> Add the label <span class="chip" style="margin:0">copilot</span> to every issue, so you can filter them in Linear</label>
    <div class="faint" style="margin:18px 0 6px">Priority in Linear</div>
    <div class="card tbl" style="box-shadow:none;max-width:420px"><table><tbody>${map.map(([p, l]) => `<tr><td><span class="pdot" style="background:${PRIO_DOT[p]}"></span>${p}</td><td class="r">→</td><td><select class="sel" style="height:30px" ${off}><option>${l}</option><option>0 · No priority</option></select></td></tr>`).join('')}</tbody></table></div>
    <p class="faint" style="margin:14px 0 16px">Assignee and status are left to Linear. Changing these settings does not touch issues that were already created.</p>
    <button class="btn primary" data-t="settings-save" ${off}>Save settings</button></div>`;
}

/* ---- dialogs ---- */
function sendAskDialog() {
  const ready = T.tasks.filter((t) => t.status === 'approved');
  if (S.linear !== 'ok')
    return customDialog(() => `<div><h2>Linear is not connected</h2><p class="sub">${S.linear === 'bad' ? 'Linear rejected the API key on the server.' : 'There is no Linear API key on the server yet.'} Your approved tasks are kept and can be sent once it is connected.</p></div>
      <div class="foot"><button class="btn" data-act="close">Close</button><button class="btn primary" data-t="go-settings">Open settings</button></div>`);
  customDialog(() => `<div><h2>Create ${ready.length} issues in Linear?</h2><p class="sub">Team <b>${LINEAR.team}</b>, project <b>${LINEAR.project}</b>, label <b>copilot</b>. Issues created in Linear stay there; to remove one, delete it in Linear.</p></div>
    <div class="scroll" style="max-height:220px">${ready.map((t) => `<div class="seg-card"><div class="m">${t.id} · ${t.req} · ${t.priority}</div><p>${esc(t.title)}</p></div>`).join('')}</div>
    <div class="foot"><button class="btn" data-act="close" ${D && D.busy ? 'disabled' : ''}>Cancel</button><button class="btn primary" data-t="send-go" ${D && D.busy ? 'disabled' : ''}>${D && D.busy ? 'Sending…' : `Create ${ready.length} issues`}</button></div>`);
}
function regenAskDialog() {
  customDialog(() => `<div><h2>Generate tasks again?</h2><p class="sub">Uses the requirements that are confirmed now. About $0.005.</p></div>
    <div class="notice" style="margin:0;background:var(--surface-2);color:var(--ink-2)">Drafts you have not edited are replaced. Edited, approved and sent tasks are kept, and a sent task is never created in Linear twice.</div>
    <div class="foot"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-t="regen-go">Generate</button></div>`);
}

/* ---- events ---- */
function readSheet(t) {
  t.title = $('#t-title').value.trim() || t.title;
  t.desc = $('#t-desc').value;
  t.priority = $('#t-prio').value;
  t.ac = [...document.querySelectorAll('[data-ac]')].map((i) => i.value.trim()); // blanks stay while editing
}
/** Saving or approving needs at least one criterion; blank rows are dropped only then. */
function commitAc(t) {
  const ac = t.ac.filter(Boolean);
  if (!ac.length) { toast('Add at least one acceptance criterion'); render(); return false; }
  t.ac = ac;
  return true;
}
function later(ms, fn) { setTimeout(() => { fn(); render(); }, ms); }
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-t]');
  if (!el) return;
  const a = el.dataset.t, v = el.dataset.v;
  const t = T.open && taskById(T.open);
  if (a === 'none') return;
  if (a === 'sel') { T.sel.has(v) ? T.sel.delete(v) : T.sel.add(v); e.stopPropagation(); return render(); }
  if (a === 'pick') { T.pick.has(v) ? T.pick.delete(v) : T.pick.add(v); return render(); }
  if (a === 'filter') { T.filter = v; return render(); }
  if (a === 'open') { T.open = v; return render(); }
  if (a === 'sheet-close' || (a === 'sheet-bg' && e.target === el)) { T.open = null; return render(); }
  if (a === 'open-req') { T.open = null; S.tab = 'analysis'; A.sub = 'reqs'; A.open = v; return render(); }
  if (a === 'ac-add') { readSheet(t); t.ac.push(''); render(); const ins = document.querySelectorAll('[data-ac]'); ins[ins.length - 1].focus(); return; }
  if (a === 'ac-del') { readSheet(t); t.ac.splice(Number(v), 1); return render(); }
  if (a === 'save') { readSheet(t); if (!commitAc(t)) return; t.edited = true; toast(`${t.id} saved`); return render(); }
  if (a === 'set') {
    if (v !== 'rejected' && t.status !== 'rejected') { readSheet(t); if (!commitAc(t)) return; }
    t.status = v; t.outdated = false; T.open = null;
    toast(`${t.id}: ${TASK_META[v][1]}`); return render();
  }
  if (a === 'bulk') {
    let n = 0;
    T.sel.forEach((id) => { const x = taskById(id); if (x.status !== 'sent' && x.status !== 'sending') { x.status = v; x.outdated = false; n++; } });
    T.sel.clear(); toast(`${n} ${v === 'approved' ? 'approved' : 'rejected'}`); return render();
  }
  if (a === 'bulk-clear') { T.sel.clear(); return render(); }
  if (a === 'gen') { S.tasks = T.stage = 'generating'; render(); return later(2500, () => { if (S.tasks === 'generating') { S.tasks = 'review'; seedTasks(); toast('6 tasks generated'); } }); }
  if (a === 'gen-cancel') { S.tasks = T.stage = 'none'; toast('Generation cancelled'); return render(); }
  if (a === 'regen-ask') return regenAskDialog();
  if (a === 'regen-go') { T.pick = new Set(confirmedReqs().map((r) => r.id)); closeDialog(); S.tasks = T.stage = 'generating'; render(); return later(2500, () => { if (S.tasks === 'generating') { S.tasks = 'review'; regenerate(); toast('Tasks updated'); } }); }
  if (a === 'send-ask') return sendAskDialog();
  if (a === 'go-settings') { closeDialog(); S.tab = 'settings'; return render(); }
  if (a === 'send-go') {
    if (D.busy) return; // a double click sends once
    D.busy = true; paintDialog();
    return later(700, () => {
      D = null; paintDialog();
      if (S.tasks !== 'review' && S.tasks !== 'result') return; // the devbar moved on meanwhile
      T.tasks.forEach((x) => x.status === 'approved' && (x.status = 'sending'));
      S.tasks = T.stage = 'sending';
      later(2500, () => {
        if (S.tasks !== 'sending') return;
        applyResult(); S.tasks = T.stage = 'result';
        const c = (s) => T.tasks.filter((x) => x.status === s).length;
        toast(`${c('sent')} issues created, ${c('failed')} failed`);
      });
    });
  }
  if (a === 'retry') {
    if (S.linear !== 'ok') return sendAskDialog(); // shows the 'not connected' dialog
    const ids = T.tasks.filter((x) => x.status === 'failed').map((x) => x.id);
    ids.forEach((id) => Object.assign(taskById(id), { status: 'sending', error: null }));
    const stage = S.tasks;
    render();
    return later(1800, () => {
      if (S.tasks !== stage) return; // the devbar moved on meanwhile
      const retried = T.tasks.filter((x) => ids.includes(x.id) && x.status === 'sending');
      retried.forEach((x) => Object.assign(x, { status: 'sent', linear: `CLB-${T.nextIssue++}` }));
      toast(`${retried.length} ${retried.length === 1 ? 'issue' : 'issues'} created`);
    });
  }
  if (a === 'test') { toast(S.linear === 'ok' ? 'Connected to Linear' : 'Could not connect to Linear'); return; }
  if (a === 'settings-save') { toast('Settings saved'); return; }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && T.open && !D) { T.open = null; render(); } });
