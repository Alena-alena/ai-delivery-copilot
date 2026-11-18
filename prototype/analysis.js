/* Analysis tab of the project page: run, progress, requirements review, gaps, contradictions.
   Fake data. Throwaway code: only the decisions it produces are kept (docs/design/screens.md). */

const DOC1 = '01_clinicbook_requirements_en.pdf';
const DOC2 = '02_meeting_notes_en.docx';
const DOC3 = '03_client_email_ru_cp1251.txt';

// status: ai = AI suggestion, confirmed, needs = needs clarification, rejected
const REQS = [
  { id: 'REQ-001', title: 'Patients can book, move and cancel appointments online', type: 'Functional', priority: 'High', status: 'ai', conf: 'High', doc: DOC1, page: 1,
    desc: 'A patient can create, reschedule and cancel an appointment from the web app without calling the clinic.',
    quote: 'Patients must be able to book, move and cancel appointments online.', ai: 'Clear and testable. The cancellation deadline is not stated (see gap G-1).' },
  { id: 'REQ-002', title: 'Send a reminder 24 hours before the appointment', type: 'Functional', priority: 'High', status: 'confirmed', conf: 'High', doc: DOC1, page: 1,
    desc: 'The system sends a reminder by SMS and email 24 hours before each appointment.',
    quote: 'The system must send a reminder 24 hours before the appointment by SMS and email.', ai: 'Explicit in the spec.' },
  { id: 'REQ-003', title: 'Staff can block time slots', type: 'Functional', priority: 'Medium', status: 'ai', conf: 'High', doc: DOC1, page: 2,
    desc: 'Clinic staff can block slots for holidays and equipment maintenance so patients cannot book them.',
    quote: 'Clinic staff can block time slots for holidays and equipment maintenance.', ai: 'Does not say whether existing bookings in a blocked slot are cancelled.' },
  { id: 'REQ-004', title: 'Patient data is stored in the EU', type: 'Constraint', priority: 'Urgent', status: 'needs', conf: 'Medium', doc: DOC1, page: 2,
    desc: 'All patient data must be stored on servers located in the European Union.',
    quote: 'All patient data must be stored in the EU.', ai: 'Conflicts with the client email (see contradiction C-1). Needs a decision.' },
  { id: 'REQ-005', title: 'Support dental, orthodontic and hygiene services', type: 'Functional', priority: 'Medium', status: 'ai', conf: 'Medium', doc: DOC1, page: 2,
    desc: 'Each service type has its own appointment duration.',
    quote: 'The system should support dental, orthodontic and hygiene services with different durations.', ai: 'Durations are not listed.' },
  { id: 'REQ-006', title: 'First release covers one clinic', type: 'Constraint', priority: 'Low', status: 'confirmed', edited: true, conf: 'High', doc: DOC1, page: 3,
    desc: 'Version 1 supports a single clinic. Multi-clinic support is out of scope.',
    quote: 'The first release covers one clinic; multi-clinic support is out of scope.', ai: 'Edited by you: priority lowered from Medium.' },
  { id: 'REQ-007', title: 'Payments are handled outside the app', type: 'Constraint', priority: 'Low', status: 'rejected', conf: 'Low', doc: DOC1, page: 3,
    desc: 'Online payment is not part of version 1.',
    quote: 'Payments are handled outside the app in version 1.', ai: 'Rejected by you: this is a scope note, not a requirement.' },
  { id: 'REQ-008', title: 'The booking page loads in under 2 seconds on mobile', type: 'Non-functional', priority: 'Medium', status: 'ai', unverified: true, conf: 'Low', doc: DOC2, page: null,
    desc: 'The public booking page loads in under 2 seconds on a mobile connection.',
    quote: 'Booking page must be fast, under two seconds on a phone.', ai: 'The quote could not be matched exactly in the document. Check the source before confirming.' },
];

const GAPS = [
  { id: 'G-1', type: 'Missing information', sev: 'High', text: 'No cancellation deadline is stated: it is unclear until when a patient may cancel or move an appointment.', reqs: ['REQ-001'],
    q: 'Until how many hours before the appointment may a patient cancel or move it?', status: 'open' },
  { id: 'G-2', type: 'Missing information', sev: 'Medium', text: 'Service durations are not listed, so slots cannot be calculated.', reqs: ['REQ-005'],
    q: 'What is the duration of each service type (dental, orthodontic, hygiene)?', status: 'open' },
  { id: 'G-3', type: 'Missing requirement', sev: 'High', text: 'No roles or permissions are described: who may see patient data, and who may block slots.', reqs: [],
    q: 'Which roles exist (patient, receptionist, dentist, admin), and what may each of them do?', status: 'open' },
  { id: 'G-4', type: 'Missing requirement', sev: 'Medium', text: 'No availability or backup target is stated for a system that holds patient data.', reqs: [],
    q: 'What uptime and data backup guarantees does the clinic expect?', status: 'resolved', note: 'Clarified on the call: 99.5% and daily backups.' },
  { id: 'G-5', type: 'Unclear wording', sev: 'Low', text: '"Reminder" does not say whether patients can switch it off or choose SMS or email.', reqs: ['REQ-002'],
    q: 'May a patient choose the reminder channel or turn reminders off?', status: 'dismissed', note: 'Out of scope for version 1.' },
];

const CONTRA = [
  { id: 'C-1', conf: 'High', a: { doc: DOC1, page: 2, quote: 'All patient data must be stored in the EU.' },
    b: { doc: DOC3, page: null, quote: 'Мы планируем использовать сервер в США, так дешевле.' },
    why: 'The spec requires EU storage, while the client email plans a server in the United States.',
    ask: 'Is EU data residency mandatory, or may a US server be used?', status: 'open' },
  { id: 'C-2', conf: 'Medium', a: { doc: DOC1, page: 1, quote: 'send a reminder 24 hours before the appointment' },
    b: { doc: DOC2, page: null, quote: 'Reminders go out two days ahead, agreed with the clinic.' },
    why: 'One document says 24 hours, another says two days.', ask: 'Should reminders be sent 24 or 48 hours before?', status: 'open' },
  { id: 'C-3', conf: 'Low', a: { doc: DOC1, page: 3, quote: 'multi-clinic support is out of scope' },
    b: { doc: DOC2, page: null, quote: 'Second clinic joins in the spring.' },
    why: 'The first release is single-clinic, but a second clinic is mentioned soon after.', ask: 'Is multi-clinic support needed within the first months?', status: 'open' },
];

const A = { sub: 'reqs', filter: 'all', sel: new Set(), open: null };
const STATUS_META = {
  ai: ['AI suggestion', 'info'], confirmed: ['Confirmed', 'ok'], needs: ['Needs clarification', 'warn'], rejected: ['Rejected', 'bad'],
};
const PRIO_DOT = { Urgent: 'var(--bad)', High: 'var(--warn)', Medium: 'var(--accent)', Low: 'var(--ink-3)' };
const reqById = (id) => REQS.find((r) => r.id === id);
const aBadge = (s) => `<span class="badge ${STATUS_META[s][1]}">${STATUS_META[s][0]}</span>`;
const aFlags = (r) =>
  `${r.edited ? '<span class="chip">Edited</span>' : ''}${r.unverified ? '<span class="chip warn">Unverified source</span>' : ''}`;
const srcLabel = (doc, page) => `${esc(doc)}${page ? ' · page ' + page : ''}`;

function analysisTab() {
  if (S.run === 'none') return runIdle();
  if (S.run === 'running') return runProgress();
  if (S.run === 'failed') return runFailed();
  return results();
}

/* ---- before, during and after a run ---- */
function runIdle() {
  return `<div class="card" style="padding:var(--pad)">
    <h2 style="font-size:1.2em">Analyse the documents of this project</h2>
    <p class="muted" style="margin:6px 0 14px;max-width:60ch">The AI reads every ready document and lists requirements, gaps and contradictions. Each item cites its source. You review everything; nothing is sent anywhere until you approve it.</p>
    <div class="seg-card" style="margin-bottom:14px"><div class="m">Included (3 ready documents)</div><p>${DOC1} · ${DOC2} · ${DOC3}</p></div>
    <div class="seg-card" style="margin-bottom:16px;border-color:var(--warn)"><div class="m" style="color:var(--warn)">Not included (2)</div><p>05_scanned_addendum_no_text.pdf: no text layer · 04_vendor_notes_with_injection.txt: still queued</p></div>
    <button class="btn primary" data-a="run-ask">Run analysis</button>
    <span class="faint" style="margin-left:10px">About 35,000 tokens · estimated $0.03 · about 2 minutes</span>
  </div>`;
}
function runProgress() {
  const steps = [['Requirements', 'done', '8 found'], ['Gaps', 'work', 'reading…'], ['Contradictions', 'wait', 'waiting']];
  return `<div class="card" style="padding:var(--pad)"><h2 style="font-size:1.2em">Analysis is running</h2>
    <p class="muted" style="margin:6px 0 16px">You can leave this page; the analysis keeps running and the results appear here.</p>
    <ol class="steps">${steps.map(([n, st, m], i) => `<li class="step ${st}"><span class="dot">${st === 'done' ? '✓' : i + 1}</span><b>${n}</b><span class="muted">${m}</span></li>`).join('')}</ol>
    <div class="meter" style="margin:16px 0"><i style="width:48%"></i></div>
    <button class="btn" data-a="cancel-ask">Cancel analysis</button></div>`;
}
function runFailed() {
  return `<div class="card" style="padding:var(--pad);border-color:var(--bad)"><h2 style="font-size:1.2em;color:var(--bad)">The analysis stopped at the gaps step</h2>
    <p class="muted" style="margin:6px 0 4px">The AI service did not answer in time. Nothing was sent anywhere.</p>
    <p style="margin:0 0 14px">Nothing from this run was saved. The results of earlier runs are unchanged.</p>
    <div style="display:flex;gap:8px"><button class="btn primary" data-a="run-ask">Try again</button><button class="btn" data-a="show-partial">Show earlier results</button></div>
    <p class="faint" style="margin:12px 0 0">Reference: request 9af30945</p></div>`;
}

/* ---- results ---- */
function results() {
  if (S.state === 'loading') return `<div class="grid" style="margin-bottom:16px">${[1, 2, 3].map(() => '<div class="card pcard"><div class="skel" style="width:40%"></div><div class="skel" style="width:60%;height:22px"></div></div>').join('')}</div>${skel(5, 6)}`;
  if (S.state === 'error') return errBox('the analysis');
  if (S.state === 'empty') return `<div class="card empty"><b>No requirements found</b>The documents did not contain anything the AI could turn into a requirement. Add more documents, or check that the text was extracted correctly.<div style="margin-top:14px"><button class="btn" data-a="run-ask">Run again</button></div></div>`;
  const openG = GAPS.filter((g) => g.status === 'open').length;
  const openC = CONTRA.filter((c) => c.status === 'open').length;
  const needs = REQS.filter((r) => r.status === 'ai').length;
  const subs = [['reqs', 'Requirements', REQS.length, needs ? `${needs} to review` : ''], ['gaps', 'Gaps', GAPS.length, openG ? `${openG} open` : ''], ['contra', 'Contradictions', CONTRA.length, openC ? `${openC} open` : '']];
  return `<div class="card" style="padding:12px var(--pad);display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <span><b>Run 2</b> <span class="muted">· finished today 11:22 · cost $0.0238</span></span><span class="sp"></span>
      <span class="faint">Edited and confirmed items stay when you run again.</span><button class="btn sm" data-a="run-ask">Run again</button></div>
    <div class="subtabs">${subs.map(([k, n, c, h]) => `<button class="${A.sub === k ? 'on' : ''}" data-a="sub" data-v="${k}">${n} <b>${c}</b>${h ? `<span class="hint">${h}</span>` : ''}</button>`).join('')}</div>
    ${A.sub === 'reqs' ? reqsView() : A.sub === 'gaps' ? gapsView() : contraView()}${A.open ? sheetHtml(reqById(A.open)) : ''}`;
}

function reqsView() {
  const f = A.filter;
  const rows = REQS.filter((r) => f === 'all' || r.status === f);
  const count = (s) => REQS.filter((r) => s === 'all' || r.status === s).length;
  const filt = [['all', 'All'], ['ai', 'AI suggestion'], ['confirmed', 'Confirmed'], ['needs', 'Needs clarification'], ['rejected', 'Rejected']];
  const selN = A.sel.size;
  return `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
    <div class="seg2">${filt.map(([k, n]) => `<button class="${f === k ? 'on' : ''}" data-a="filter" data-v="${k}">${n} ${count(k)}</button>`).join('')}</div>
    ${selN ? `<span class="sp"></span><span class="muted">${selN} selected</span><button class="btn sm primary" data-a="bulk-confirm">Confirm selected</button><button class="btn sm" data-a="bulk-clear">Clear</button>` : ''}</div>
  <div class="card tbl"><table>
    <thead><tr><th style="width:32px"></th><th>Requirement</th><th class="hide">Type</th><th>Priority</th><th>Status</th><th class="hide">Source</th></tr></thead>
    <tbody>${rows.map((r) => `<tr class="click" data-a="open" data-v="${r.id}">
      <td data-a="none"><input type="checkbox" data-a="sel" data-v="${r.id}" ${A.sel.has(r.id) ? 'checked' : ''} aria-label="Select ${r.id}"></td>
      <td><div class="name">${esc(r.title)}</div><div class="faint">${r.id} ${aFlags(r)}</div></td><td class="hide muted">${r.type}</td>
      <td style="white-space:nowrap"><span class="pdot" style="background:${PRIO_DOT[r.priority]}"></span>${r.priority}</td><td style="white-space:nowrap">${aBadge(r.status)}</td>
      <td class="hide faint">${srcLabel(r.doc, r.page)}</td></tr>`).join('') || `<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">Nothing with this status.</td></tr>`}</tbody></table></div>
  <p class="faint" style="margin-top:10px">AI suggestions are not facts. Confirm what is right, edit what is close, reject the rest. Only confirmed requirements become tasks.</p>`;
}

function sheetHtml(r) {
  return `<div class="overlay sheet-bg" data-a="sheet-bg"><aside class="sheet" role="dialog" aria-modal="true" aria-label="${r.id}">
    <button class="x" data-a="sheet-close" aria-label="Close">×</button>
    <div class="faint">${r.id} · ${r.type}</div><h2 style="margin:2px 28px 8px 0">${esc(r.title)}</h2>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${aBadge(r.status)}${aFlags(r)}<span class="chip"><span class="pdot" style="background:${PRIO_DOT[r.priority]}"></span>${r.priority}</span><span class="chip">AI confidence: ${r.conf}</span></div>
    <div class="scroll" style="gap:14px">
      <p style="margin:0">${esc(r.desc)}</p>
      <div><div class="faint" style="margin-bottom:6px">Source</div>
        <blockquote class="quote ${r.unverified ? 'unv' : ''}">“${esc(r.quote)}”</blockquote>
        <div class="faint" style="margin-top:6px">${srcLabel(r.doc, r.page)} ${r.unverified ? '· <b style="color:var(--warn)">could not be matched exactly in the text</b>' : '· verified in the text'}</div>
        <button class="btn sm" style="margin-top:8px" data-act="view" data-name="${esc(r.doc)}">Open in document</button></div>
      <div><div class="faint" style="margin-bottom:6px">AI note</div><p style="margin:0;color:var(--ink-2)">${esc(r.ai)}</p></div></div>
    <div class="foot" style="flex-wrap:wrap;border-top:1px solid var(--line);padding-top:12px">
      <button class="btn" data-a="edit" data-v="${r.id}">Edit</button><span class="sp"></span>
      <button class="btn" data-a="set" data-v="${r.id}:rejected">Reject</button>
      <button class="btn" data-a="set" data-v="${r.id}:needs">Needs clarification</button>
      <button class="btn primary" data-a="set" data-v="${r.id}:confirmed">Confirm</button></div></aside></div>`;
}

function gapsView() {
  const types = [...new Set(GAPS.map((g) => g.type))];
  const openQ = GAPS.filter((g) => g.status === 'open').length;
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;flex-wrap:wrap">
      <p class="muted" style="margin:0">What is missing or unclear in the documents, with a ready question for the client.</p>
      <button class="btn sm" data-a="copy-all">Copy all open questions (${openQ})</button></div>
    ${types.map((t) => `<h3 class="grp">${t}</h3>${GAPS.filter((g) => g.type === t).map(gapCard).join('')}`).join('')}`;
}
function gapCard(g) {
  const st = g.status === 'open' ? '' : `<span class="badge ${g.status === 'resolved' ? 'ok' : ''}">${g.status === 'resolved' ? 'Resolved' : 'Dismissed'}</span>`;
  return `<div class="card fcard ${g.status !== 'open' ? 'done' : ''}">
    <div class="frow"><span class="sev ${g.sev}">${g.sev}</span><span class="faint">${g.id}</span>${st}<span class="sp"></span>
      ${g.status === 'open' ? `<button class="btn sm" data-a="finding" data-v="gap:${g.id}:resolved">Resolve</button><button class="btn sm ghost" data-a="finding" data-v="gap:${g.id}:dismissed">Dismiss</button>` : `<button class="btn sm ghost" data-a="reopen" data-v="gap:${g.id}">Reopen</button>`}</div>
    <p style="margin:6px 0">${esc(g.text)}</p>
    <div class="frow">${g.reqs.length ? g.reqs.map((id) => `<a class="chip link" data-a="open-req" data-v="${id}">${id}</a>`).join('') : '<span class="chip warn">Absent from the documents</span>'}</div>
    <div class="ask"><div class="faint">Question for the client</div><div style="display:flex;gap:10px;align-items:flex-start"><p style="margin:2px 0;flex:1">${esc(g.q)}</p><button class="btn sm" data-a="copy" data-v="${g.id}">Copy</button></div></div>
    ${g.note ? `<p class="faint" style="margin:8px 0 0">Note: ${esc(g.note)}</p>` : ''}</div>`;
}

function contraView() {
  const strong = CONTRA.filter((c) => c.conf !== 'Low');
  const low = CONTRA.filter((c) => c.conf === 'Low');
  return `<p class="muted" style="margin:0 0 12px">Places where two sources seem to disagree. These are <b>possible</b> contradictions: please check both quotes.</p>
    ${strong.map(contraCard).join('')}
    <h3 class="grp">Low confidence (${low.length})</h3>
    <p class="faint" style="margin:0 0 8px">Shown separately so they do not hide the likely ones.</p>${low.map(contraCard).join('')}`;
}
function contraCard(c) {
  const side = (s, l) => `<div class="qside"><div class="faint">${l} · ${srcLabel(s.doc, s.page)}</div><blockquote class="quote">“${esc(s.quote)}”</blockquote></div>`;
  return `<div class="card fcard ${c.status !== 'open' ? 'done' : ''}"><div class="frow"><span class="sev ${c.conf === 'High' ? 'High' : c.conf === 'Medium' ? 'Medium' : 'Low'}">${c.conf} confidence</span><span class="faint">${c.id}</span>
      ${c.status !== 'open' ? `<span class="badge ${c.status === 'resolved' ? 'ok' : ''}">${c.status === 'resolved' ? 'Resolved' : 'Dismissed'}</span>` : ''}<span class="sp"></span>
      ${c.status === 'open' ? `<button class="btn sm" data-a="finding" data-v="contra:${c.id}:resolved">Resolve</button><button class="btn sm ghost" data-a="finding" data-v="contra:${c.id}:dismissed">Dismiss</button>` : `<button class="btn sm ghost" data-a="reopen" data-v="contra:${c.id}">Reopen</button>`}</div>
    <div class="qcols">${side(c.a, 'A')}${side(c.b, 'B')}</div>
    <p style="margin:8px 0">${esc(c.why)}</p>
    <div class="ask"><div class="faint">Clarification to ask</div><div style="display:flex;gap:10px;align-items:flex-start"><p style="margin:2px 0;flex:1">${esc(c.ask)}</p><button class="btn sm" data-a="copy" data-v="${c.id}">Copy</button></div></div></div>`;
}

/* ---- dialogs (through the shared D / paintDialog) ---- */
function customDialog(render, opts = {}) {
  D = { type: 'custom', render, wide: opts.wide };
  paintDialog();
}
function runAskDialog() {
  const again = S.run === 'done' || S.run === 'failed';
  customDialog(() => `<div><h2>${again ? 'Run the analysis again?' : 'Run the analysis?'}</h2>
    <p class="sub">The AI will read 3 ready documents (about 35,000 tokens) and cost about $0.03. It takes about 2 minutes and you can leave the page.</p></div>
    ${again ? '<div class="notice" style="margin:0;background:var(--surface-2);color:var(--ink-2)">Your edits and confirmed requirements are kept. New findings are added as AI suggestions.</div>' : ''}
    <div class="foot"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-a="run-go">Run analysis</button></div>`);
}
function cancelAskDialog() {
  customDialog(() => `<div><h2>Cancel the analysis?</h2><p class="sub">Steps already finished are kept. You can run the rest later.</p></div>
    <div class="foot"><button class="btn" data-act="close">Keep running</button><button class="btn danger" data-a="cancel-go">Cancel analysis</button></div>`);
}
function editDialog(id) {
  const r = reqById(id);
  customDialog(() => `<div><h2>Edit ${r.id}</h2><p class="sub">The source quote cannot be changed. Your edit is marked as Edited.</p></div>
    <div><div class="field"><label>Title</label><input id="e-title" value="${esc(r.title)}"></div>
    <div class="field"><label>Description</label><textarea id="e-desc">${esc(r.desc)}</textarea></div>
    <div class="field" style="margin:0"><label>Priority</label><select id="e-prio" class="sel">${['Urgent', 'High', 'Medium', 'Low'].map((p) => `<option ${p === r.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>
    <div class="foot"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-a="edit-save" data-v="${id}">Save</button></div>`);
}
function findingDialog(kind, id, to) {
  const o = (kind === 'gap' ? GAPS : CONTRA).find((x) => x.id === id);
  customDialog(() => `<div><h2>${to === 'resolved' ? 'Mark as resolved' : 'Dismiss this finding'}</h2><p class="sub">${esc(kind === 'gap' ? o.text : o.why)}</p></div>
    <div class="field" style="margin:0"><label>Comment (optional)</label><textarea id="f-note" placeholder="${to === 'resolved' ? 'What was decided?' : 'Why is this not a problem?'}"></textarea></div>
    <div class="foot"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-a="finding-save" data-v="${kind}:${id}:${to}">${to === 'resolved' ? 'Resolve' : 'Dismiss'}</button></div>`);
}

/* ---- events ---- */
const closeDialog = () => { D = null; paintDialog(); };
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const a = el.dataset.a, v = el.dataset.v;
  if (a === 'none') return;
  if (a === 'sel') { A.sel.has(v) ? A.sel.delete(v) : A.sel.add(v); e.stopPropagation(); return render(); }
  if (a === 'sheet-bg') { if (e.target === el) { A.open = null; render(); } return; }
  if (a === 'sheet-close') { A.open = null; return render(); }
  if (a === 'sub') { A.sub = v; A.open = null; return render(); }
  if (a === 'filter') { A.filter = v; return render(); }
  if (a === 'open') { A.open = v; return render(); }
  if (a === 'open-req') { A.sub = 'reqs'; A.open = v; return render(); }
  if (a === 'run-ask') return runAskDialog();
  if (a === 'cancel-ask') return cancelAskDialog();
  if (a === 'run-go') { closeDialog(); S.run = 'running'; toast('Analysis started'); render(); setTimeout(() => { if (S.run === 'running') { S.run = 'done'; toast('Analysis finished'); render(); } }, 3500); return; }
  if (a === 'cancel-go') { closeDialog(); S.run = 'none'; toast('Analysis cancelled'); return render(); }
  if (a === 'show-partial') { S.run = 'done'; return render(); }
  if (a === 'set') { const [id, st] = v.split(':'); reqById(id).status = st; toast(`${id}: ${STATUS_META[st][0]}`); A.open = null; return render(); }
  if (a === 'bulk-confirm') { A.sel.forEach((id) => (reqById(id).status = 'confirmed')); toast(`${A.sel.size} confirmed`); A.sel.clear(); return render(); }
  if (a === 'bulk-clear') { A.sel.clear(); return render(); }
  if (a === 'edit') return editDialog(v);
  if (a === 'edit-save') { const r = reqById(v); r.title = $('#e-title').value.trim() || r.title; r.desc = $('#e-desc').value; r.priority = $('#e-prio').value; r.edited = true; closeDialog(); toast(`${v} updated`); return render(); }
  if (a === 'finding') { const [k, id, to] = v.split(':'); return findingDialog(k, id, to); }
  if (a === 'finding-save') { const [k, id, to] = v.split(':'); const o = (k === 'gap' ? GAPS : CONTRA).find((x) => x.id === id); o.status = to; o.note = $('#f-note').value.trim(); closeDialog(); toast(to === 'resolved' ? 'Marked as resolved' : 'Dismissed'); return render(); }
  if (a === 'reopen') { const [k, id] = v.split(':'); (k === 'gap' ? GAPS : CONTRA).find((x) => x.id === id).status = 'open'; return render(); }
  if (a === 'copy') { toast('Question copied'); return; }
  if (a === 'copy-all') { toast(`${GAPS.filter((g) => g.status === 'open').length} questions copied`); return; }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && A.open && !D) { A.open = null; render(); } });
