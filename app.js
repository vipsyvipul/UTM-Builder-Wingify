// ---- Taxonomy (edit here) ----
const ALLOWED_DOMAINS = ['wingify.com'];

const FUNNEL_STAGES = [
  { code: 'tof', label: 'Top of funnel' },
  { code: 'mof', label: 'Middle of funnel' },
  { code: 'bof', label: 'Bottom of funnel' },
];

const TYPES = [
  { code: 'wb', label: 'Webinar', note: 'Includes virtual events' },
  { code: 'eb', label: 'Ebook' },
  { code: 'ev', label: 'Field event' },
  { code: 'pc', label: 'Podcast' },
];

// utm_content values for marketing email, by content type
const EMAIL_CONTENTS = {
  wb: ['invite', 'reminder', 'recording'],
  ev: ['invite', 'reminder'],
  eb: ['invite', 'reminder'],
  pc: ['invite', 'reminder'],
};

// Emails sent more than once are numbered: invite-1, invite-2...
const NUMBERED_EMAILS = [
  { code: 'invite', label: 'Invites' },
  { code: 'reminder', label: 'Reminders' },
];
const MAX_EMAILS = 10;

// Mediums listed for "Other"; the user can also type their own
const OTHER_MEDIUMS = ['social', 'paid-social', 'email', 'partner', 'community'];

// contents: 'social' | 'email' | array of fixed values ([] = no utm_content)
// input: free-text source the user must type (partner name, community name...)
const CHANNEL_GROUPS = [
  { group: 'Social', items: [
    { id: 'linkedin', label: 'LinkedIn', source: 'linkedin', medium: 'social', contents: 'social' },
    { id: 'x', label: 'X', source: 'x', medium: 'social', contents: 'social' },
    { id: 'facebook', label: 'Facebook', source: 'facebook', medium: 'social', contents: 'social' },
    { id: 'instagram', label: 'Instagram', source: 'instagram', medium: 'social', contents: 'social' },
    { id: 'youtube', label: 'YouTube', source: 'youtube', medium: 'social', contents: 'social' },
    { id: 'linkedin-ads', label: 'LinkedIn Ads', source: 'linkedin', medium: 'paid-social', contents: ['ad'] },
  ]},
  { group: 'Email', items: [
    { id: 'marketing', label: 'Marketing email', source: 'marketing', medium: 'email', contents: 'email' },
    { id: 'newsletter', label: 'Newsletter', source: 'newsletter', medium: 'email', contents: [] },
    { id: 'sdr', label: 'SDR email', source: 'sdr', medium: 'email', contents: [] },
    { id: 'ae', label: 'AE email', source: 'ae', medium: 'email', contents: [] },
    { id: 'cs', label: 'CS email', source: 'cs', medium: 'email', contents: [] },
  ]},
  { group: 'Other', items: [
    { id: 'partner', label: 'Partner', medium: 'partner', contents: [], input: 'Partner name' },
    { id: 'community', label: 'Community', medium: 'community', contents: [], input: 'Community name' },
    { id: 'other', label: 'Other', medium: null, contents: [], input: 'Source name' },
  ]},
];

// ---- Pure logic ----
function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Salesforce 15 -> 18 char ID: each 5-char chunk encodes which chars are uppercase
function toId18(id15) {
  const map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  let suffix = '';
  for (let i = 0; i < 3; i++) {
    let flags = 0;
    for (let j = 0; j < 5; j++) {
      const c = id15.charAt(i * 5 + j);
      if (c >= 'A' && c <= 'Z') flags += 1 << j;
    }
    suffix += map.charAt(flags);
  }
  return id15 + suffix;
}

function parseSfId(raw) {
  const id = String(raw || '').trim();
  if (!id) return { error: 'Add the Salesforce Campaign ID.' };
  if (!/^[a-zA-Z0-9]+$/.test(id) || (id.length !== 15 && id.length !== 18)) {
    return { error: 'Salesforce Campaign ID must be 15 or 18 letters/numbers.' };
  }
  if (!id.startsWith('701')) return { error: 'Salesforce Campaign ID must start with 701 (that prefix means Campaign).' };
  const id18 = toId18(id.slice(0, 15));
  if (id.length === 18 && id18.slice(15) !== id.slice(15).toUpperCase()) {
    return { error: 'Salesforce Campaign ID looks mistyped: the last 3 characters do not match. Copy it again from Salesforce.' };
  }
  return { id18 };
}

// Adds https:// when a URL has no scheme; an existing scheme is kept
function withScheme(raw) {
  const v = String(raw || '').trim();
  if (!v || /^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
  return 'https://' + v.replace(/^\/\//, '');
}

function parseUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch (e) {
    return null;
  }
}

function isAllowedHost(host) {
  return ALLOWED_DOMAINS.some(d => host === d || host.endsWith('.' + d));
}

function slugFromPermalink(u) {
  const parts = u.pathname.split('/').filter(Boolean);
  const last = parts.length ? parts[parts.length - 1].replace(/\.(php|html?)$/, '') : '';
  return last === 'index' ? '' : slugify(decodeURIComponent(last));
}

// counts: { invite: 2, reminder: 1 }; each count is kept between 1 and MAX_EMAILS, missing means 1
function contentsFor(item, type, counts = {}) {
  if (item.contents === 'social') {
    return ['company', 'employee'].concat(type === 'wb' || type === 'pc' ? ['speaker'] : []);
  }
  if (item.contents === 'email') {
    return EMAIL_CONTENTS[type].flatMap(c => {
      if (!NUMBERED_EMAILS.some(n => n.code === c)) return [c];
      const n = Math.min(Math.max(parseInt(counts[c], 10) || 1, 1), MAX_EMAILS);
      return Array.from({ length: n }, (_, i) => c + '-' + (i + 1));
    });
  }
  return item.contents;
}

function withUtms(baseUrl, params) {
  const u = new URL(baseUrl.href);
  for (const [k, v] of params) u.searchParams.set(k, v);
  return u.href;
}

// state: { type, stage, long, short, sfid, emailCounts, channels: { [id]: { on, source, medium } } }
// Returns checks: [{ label, error, empty }] for the checklist; error is '' when the check passes,
// empty is true when the input is blank (the checklist shows error text only for filled-in but wrong inputs)
function build(state) {
  const checks = [];
  const check = (label, error, empty) => checks.push({ label, error: error || '', empty: !!empty });
  const typeCode = state.type;
  check('Funnel stage', FUNNEL_STAGES.some(f => f.code === state.stage) ? '' : 'Pick a funnel stage.', true);

  const long = parseUrl(withScheme(state.long));
  const slug = long ? slugFromPermalink(long) : '';
  check('Permalink',
    !String(state.long || '').trim() ? 'Add the permalink (long URL).'
    : !long ? 'Permalink is not a valid URL. It should start with https://'
    : !isAllowedHost(long.hostname) ? 'Permalink must be on ' + ALLOWED_DOMAINS.join(' or ') + '.'
    : !slug ? 'Permalink has no slug. Use the full WordPress permalink, like https://wingify.com/webinars/your-webinar/'
    : '', !String(state.long || '').trim());

  let short = null;
  if (String(state.short || '').trim()) {
    short = parseUrl(withScheme(state.short));
    check('Short URL', short ? '' : 'Short URL is not a valid URL. It should start with https://');
  }

  const sf = parseSfId(state.sfid);
  check('Salesforce Campaign ID', sf.error, !String(state.sfid || '').trim());

  const selected = [];
  const channelChecks = [];
  for (const g of CHANNEL_GROUPS) {
    for (const item of g.items) {
      const ch = state.channels[item.id];
      if (!ch || !ch.on) continue;
      const source = item.input ? slugify(ch.source) : item.source;
      const medium = item.medium || slugify(ch.medium);
      if (item.input) channelChecks.push([item.label + ': ' + item.input.toLowerCase(), source ? '' : item.label + ': add the ' + item.input.toLowerCase() + '.', true]);
      if (!item.medium) channelChecks.push([item.label + ': medium', medium ? '' : item.label + ': pick or type a medium.', true]);
      selected.push({ group: g.group, item, source, medium });
    }
  }
  check('Channels', selected.length ? '' : 'Tick at least one channel.', true);
  for (const [label, error, empty] of channelChecks) check(label, error, empty);

  const errors = checks.filter(c => c.error).map(c => c.error);
  if (errors.length) return { errors, checks };

  const campaign = state.stage + '-' + typeCode + '_' + slug + '_' + sf.id18;
  const links = [];
  for (const s of selected) {
    const contents = contentsFor(s.item, typeCode, state.emailCounts);
    const variants = contents.length ? contents : [null];
    for (const content of variants) {
      const params = [['utm_source', s.source], ['utm_medium', s.medium], ['utm_campaign', campaign]];
      if (content) params.push(['utm_content', content]);
      params.push(['utm_id', sf.id18]);
      const label = s.item.input ? s.item.label + ' (' + s.source + ')' : s.item.label;
      links.push({
        group: s.group,
        label: content ? label + ' · ' + content : label,
        long: withUtms(long, params),
        short: short ? withUtms(short, params) : null,
      });
    }
  }
  return { errors: [], checks, campaign, id18: sf.id18, links };
}

// ---- UI ----
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const CUSTOM = '__custom';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function pill(type, name, value, label, checked) {
    return `<label class="pill"><input type="${type}" name="${name}" value="${value}"${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;
  }

  $('type').innerHTML = TYPES.map((t, i) => pill('radio', 'type', t.code, t.label, i === 0)).join('');
  $('stage').innerHTML = FUNNEL_STAGES.map(f => pill('radio', 'stage', f.code, f.label, false)).join('');

  $('channels').innerHTML = CHANNEL_GROUPS.map(g => {
    const extras = g.items.filter(item => item.input || item.contents === 'email');
    return `<div class="ch-group" role="group" aria-label="${g.group}">
      <p class="ch-group-name">${g.group}</p>
      <div class="pills">
        ${g.items.map(item => `<label class="pill"><input type="checkbox" data-ch="${item.id}"><span>${esc(item.label)}</span></label>`).join('')}
      </div>
      ${extras.length ? `<div class="extras">
        ${extras.map(item => item.contents === 'email' ? `
          <div class="extra" data-extra="${item.id}">
            <span class="extra-label">How many</span>
            ${NUMBERED_EMAILS.map(n => `<label class="count"><span>${esc(n.label)}</span><input type="number" data-count="${n.code}" min="1" max="${MAX_EMAILS}" value="1"></label>`).join('')}
          </div>` : `
          <div class="extra" data-extra="${item.id}">
            <span class="extra-label">${esc(item.label)}</span>
            <input type="text" data-src="${item.id}" placeholder="${esc(item.input)}" aria-label="${esc(item.label)}: ${esc(item.input)}">
            ${item.medium ? '' : `<select data-med="${item.id}" aria-label="${esc(item.label)}: medium"><option value="">Medium…</option>${OTHER_MEDIUMS.map(m => `<option>${m}</option>`).join('')}<option value="${CUSTOM}">Type your own…</option></select>
            <input type="text" class="med-custom" data-med-custom="${item.id}" placeholder="Medium" aria-label="${esc(item.label)}: your own medium" hidden>`}
          </div>`).join('')}
      </div>` : ''}
    </div>`;
  }).join('');

  function checkedValue(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : '';
  }

  function readState() {
    const channels = {};
    for (const g of CHANNEL_GROUPS) {
      for (const item of g.items) {
        const box = document.querySelector(`[data-ch="${item.id}"]`);
        const src = document.querySelector(`[data-src="${item.id}"]`);
        const med = document.querySelector(`[data-med="${item.id}"]`);
        const custom = document.querySelector(`[data-med-custom="${item.id}"]`);
        if (custom) custom.hidden = med.value !== CUSTOM;
        const extra = document.querySelector(`[data-extra="${item.id}"]`);
        if (extra) extra.classList.toggle('show', box.checked);
        channels[item.id] = { on: box.checked, source: src ? src.value : '', medium: !med ? '' : med.value === CUSTOM ? custom.value : med.value };
      }
    }
    const emailCounts = {};
    document.querySelectorAll('[data-count]').forEach(el => { emailCounts[el.dataset.count] = el.value; });
    return {
      type: checkedValue('type'),
      stage: checkedValue('stage'),
      long: $('long').value,
      short: $('short').value,
      sfid: $('sfid').value,
      emailCounts,
      channels,
    };
  }

  // Campaign parts for the live preview, filled in as soon as each input is valid
  function campaignParts(state) {
    const long = parseUrl(withScheme(state.long));
    const slug = long && isAllowedHost(long.hostname) ? slugFromPermalink(long) : '';
    const sf = parseSfId(state.sfid);
    return [
      { value: state.stage, label: 'Stage', placeholder: 'stage', sep: '-' },
      { value: state.type, label: 'Type', placeholder: 'type', sep: '_' },
      { value: slug, label: 'Slug', placeholder: 'permalink-slug', sep: '_' },
      { value: sf.id18 || '', label: 'Salesforce ID', placeholder: 'salesforce-id', sep: '' },
    ];
  }

  let lastParts = [];
  function renderAnatomy(state) {
    const parts = campaignParts(state);
    $('segments').innerHTML = parts.map((p, i) => `<span class="seg${p.value ? '' : ' empty'}">
        <span class="seg-row"><span class="seg-val${p.value && p.value !== lastParts[i] ? ' pop' : ''}">${esc(p.value || p.placeholder)}</span>${p.sep ? `<span class="sep">${p.sep}</span>` : ''}</span>
        <span class="seg-label">${p.label}</span>
      </span>`).join('');
    const id = parts[3].value;
    $('anatomy-id').innerHTML = id
      ? `The same ID goes in <code>utm_id</code>: <code>${esc(id)}</code>`
      : 'The Salesforce ID also goes in <code>utm_id</code>, so analytics tools can match it.';
    lastParts = parts.map(p => p.value);
  }

  // URL with each utm_ value highlighted in its parameter color
  function urlHtml(href) {
    const u = new URL(href);
    const query = [...u.searchParams].map(([k, v]) => {
      const kind = k.startsWith('utm_') ? k.slice(4) : '';
      return kind ? `${esc(k)}=<mark class="p-${kind}">${esc(v)}</mark>` : `${esc(k)}=${esc(v)}`;
    }).join('&amp;<wbr>');
    return esc(u.origin + u.pathname) + (query ? '?' + query : '') + esc(u.hash);
  }

  function copy(text, btn) {
    const done = () => {
      const old = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    }
  }

  let current = null;
  let lastDone;

  function render() {
    const state = readState();
    renderAnatomy(state);
    const result = build(state);
    const out = $('output');

    if (result.errors.length) {
      current = null;
      const done = result.checks.filter(c => !c.error).length;
      out.innerHTML = `<div class="todo">
        <h2 class="panel-title">Checklist<small><span class="${done !== lastDone ? 'pop' : ''}">${done}</span> of ${result.checks.length} done</small></h2>
        <ul>${result.checks.map(c => `<li class="${c.error ? '' : 'done'}">
          <span class="tick" aria-hidden="true"></span>
          <span><span class="todo-label">${esc(c.label)}</span>${c.error && !c.empty ? `<span class="todo-hint">${esc(c.error)}</span>` : ''}${c.error ? '' : '<span class="sr-only"> (done)</span>'}</span>
        </li>`).join('')}</ul>
      </div>`;
      lastDone = done;
      return;
    }

    current = result;
    const groups = [];
    for (const l of result.links) {
      if (!groups.length || groups[groups.length - 1].name !== l.group) groups.push({ name: l.group, links: [] });
      groups[groups.length - 1].links.push(l);
    }
    let i = 0;
    out.innerHTML = `
      <div class="panel-head">
        <h2 class="panel-title">Your links<small>${result.links.length} links</small></h2>
        <button type="button" class="btn btn-primary" data-copy-all>Copy all for Sheets</button>
      </div>
      <ul class="legend" aria-label="Parameter colors">
        <li class="chip p-source">source</li>
        <li class="chip p-medium">medium</li>
        <li class="chip p-campaign">campaign</li>
        <li class="chip p-content">content</li>
        <li class="chip p-id">id</li>
      </ul>
      ${groups.map(g => `
        <div class="group">
          <div class="group-head"><span class="group-name">${esc(g.name)}</span><span class="group-count">${g.links.length}</span></div>
          ${g.links.map(l => {
            const n = i++;
            const [name, content] = l.label.split(' · ');
            return `<div class="link">
              <div class="link-head">
                <button type="button" class="link-toggle" aria-expanded="false" aria-controls="url-${n}">
                  <span class="chev" aria-hidden="true"></span>
                  <span class="link-name">${esc(name)}</span>${content ? `<span class="chip p-content">${esc(content)}</span>` : ''}
                </button>
                <span class="link-actions">
                  <button type="button" class="btn btn-small" data-copy="${n}" data-kind="long">Copy</button>
                  ${l.short ? `<button type="button" class="btn btn-small" data-copy="${n}" data-kind="short">Copy short</button>` : ''}
                </span>
              </div>
              <div class="url-box" id="url-${n}" inert><div><code class="url">${urlHtml(l.long)}</code></div></div>
            </div>`;
          }).join('')}
        </div>`).join('')}`;
  }

  // ---- Matrix tab (built from the same taxonomy as the builder) ----
  const chip = (kind, v) => `<span class="chip p-${kind}">${esc(v)}</span>`;

  function contentsHtml(item) {
    if (item.contents === 'social') return `${chip('content', 'company')}${chip('content', 'employee')}${chip('content', 'speaker')} <span class="muted">speaker for webinars and podcasts only</span>`;
    if (item.contents === 'email') return '<span class="muted">Depends on content type, see below</span>';
    return item.contents.length ? item.contents.map(c => chip('content', c)).join('') : '<span class="muted">None</span>';
  }

  function renderMatrix() {
    const byMedium = new Map();
    for (const g of CHANNEL_GROUPS) {
      for (const item of g.items) {
        const key = item.medium || '';
        if (!byMedium.has(key)) byMedium.set(key, []);
        byMedium.get(key).push(item);
      }
    }
    let channelRows = '';
    for (const [medium, items] of byMedium) {
      const mediumCell = medium
        ? chip('medium', medium)
        : `<span class="muted">Picked from the list, or typed by the user:</span> ${OTHER_MEDIUMS.map(m => chip('medium', m)).join('')}`;
      channelRows += `<tr><td class="medium-row" colspan="3">${mediumCell}</td></tr>`;
      for (const item of items) {
        const source = item.input ? `<span class="muted">${esc(item.input)}, as typed</span>` : chip('source', item.source);
        channelRows += `<tr class="sub"><td>${source}</td><td>${esc(item.label)}</td><td>${contentsHtml(item)}</td></tr>`;
      }
    }

    const typeRows = TYPES.map(t => `<tr>
      <td>${esc(t.label)}${t.note ? `<br><span class="muted">${esc(t.note)}</span>` : ''}</td>
      <td>${chip('campaign', t.code)}</td>
      <td>${EMAIL_CONTENTS[t.code].map(c => chip('content', NUMBERED_EMAILS.some(n => n.code === c) ? c + '-{n}' : c)).join('')}</td>
    </tr>`).join('');

    const stageRows = FUNNEL_STAGES.map(f => `<tr><td>${esc(f.label)}</td><td>${chip('campaign', f.code)}</td></tr>`).join('');

    $('tab-matrix').innerHTML = `
      <section class="panel">
        <h2>Parameters</h2>
        <div class="table-wrap"><table>
          <tr><th>Parameter</th><th>Answers</th><th>Value</th></tr>
          <tr><td>${chip('source', 'utm_source')}</td><td>Which platform or sender?</td><td>Set by the channel</td></tr>
          <tr><td>${chip('medium', 'utm_medium')}</td><td>What kind of channel?</td><td>Set by the channel</td></tr>
          <tr><td>${chip('campaign', 'utm_campaign')}</td><td>Which content?</td><td><code class="chip p-campaign">{stage}-{type}_{permalink-slug}_{salesforce-id}</code><br><span class="muted">e.g. tof-wb_discover-the-new-wingify-platform_701MI000016cpgkYAA</span></td></tr>
          <tr><td>${chip('content', 'utm_content')}</td><td>Which post or email?</td><td>Set by the channel and content type</td></tr>
          <tr><td>${chip('id', 'utm_id')}</td><td>Which Salesforce campaign?</td><td>The 18-character Salesforce Campaign ID</td></tr>
          <tr><td><span class="chip" style="background:var(--eggshell)">utm_term</span></td><td class="muted">Not used</td><td class="muted">Kept for paid search keywords</td></tr>
        </table></div>
      </section>

      <section class="panel">
        <h2>Channels</h2>
        <p>Grouped by utm_medium.</p>
        <div class="table-wrap"><table>
          <tr><th>Source</th><th>Channel</th><th>Content</th></tr>
          ${channelRows}
        </table></div>
      </section>

      <div class="matrix-grid">
        <section class="panel">
          <h2>Content types</h2>
          <div class="table-wrap"><table>
            <tr><th>Type</th><th>Code</th><th>Marketing emails</th></tr>
            ${typeRows}
          </table></div>
          <p class="hint">{n} is the email number: invite-1, invite-2 and so on. Set how many in the builder.</p>
        </section>
        <section class="panel">
          <h2>Funnel stages</h2>
          <div class="table-wrap"><table>
            <tr><th>Stage</th><th>Code</th></tr>
            ${stageRows}
          </table></div>
        </section>
      </div>

      <section class="panel">
        <h2>Formatting rules</h2>
        <p>Applied automatically.</p>
        <ul class="rules">
          <li>Values are lowercase. Spaces and special characters become hyphens, and accents are removed: Conversión becomes conversion.</li>
          <li>Underscores separate the parts of the campaign name. Hyphens join words inside a part.</li>
          <li>The Salesforce Campaign ID keeps its original case. 15-character IDs are converted to 18.</li>
          <li>Permalinks must be on ${ALLOWED_DOMAINS.join(' or ')}.</li>
        </ul>
      </section>`;
  }

  function showTab() {
    const tab = location.hash === '#matrix' ? 'matrix' : 'builder';
    $('tab-builder').hidden = tab !== 'builder';
    $('tab-matrix').hidden = tab !== 'matrix';
    document.querySelectorAll('[data-tab]').forEach(a => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.body.dataset.tab = tab;
    setOpen(tab === 'builder' && !narrow.matches);
  }

  // ---- Sidebar: open by default on wide screens, closed on narrow ones ----
  const narrow = matchMedia('(max-width: 980px)');
  function setOpen(open) {
    document.body.classList.toggle('open', open);
    $('side').inert = !open;
    $('toggle').setAttribute('aria-expanded', String(open));
  }
  $('toggle').addEventListener('click', () => setOpen(!document.body.classList.contains('open')));
  $('dim').addEventListener('click', () => setOpen(false));

  renderMatrix();
  showTab();
  window.addEventListener('hashchange', showTab);

  // Keep invite/reminder boxes within 1 to MAX_EMAILS; a blank box is allowed while typing and becomes 1 on leaving it
  function clampCount(e) {
    const el = e.target;
    if (!el.matches('[data-count]')) return;
    if (el.value === '') { if (e.type === 'change') el.value = 1; return; }
    const n = parseInt(el.value, 10);
    if (!(n >= 1)) el.value = 1;
    else if (n > MAX_EMAILS) el.value = MAX_EMAILS;
    else if (String(n) !== el.value) el.value = n;
  }
  // ---- Remember the form in this browser ----
  const key = el => el.id || (el.type === 'radio' ? el.name + '=' + el.value : Object.entries(el.dataset).flat().join('='));
  const isBox = el => el.type === 'radio' || el.type === 'checkbox';
  function save() {
    const data = {};
    for (const el of $('form').elements) if (key(el)) data[key(el)] = isBox(el) ? el.checked : el.value;
    try { localStorage.setItem('form', JSON.stringify(data)); } catch (e) {}
  }
  function load() {
    let data = {};
    try { data = JSON.parse(localStorage.getItem('form')) || {}; } catch (e) {}
    for (const el of $('form').elements) {
      if (!(key(el) in data)) continue;
      if (isBox(el)) el.checked = data[key(el)]; else el.value = data[key(el)];
    }
  }
  $('clear').addEventListener('click', () => { $('form').reset(); render(); save(); });

  $('form').addEventListener('input', e => { clampCount(e); render(); save(); });
  $('form').addEventListener('change', e => {
    clampCount(e);
    if (e.target === $('long') || e.target === $('short')) e.target.value = withScheme(e.target.value);
    render();
    save();
  });
  $('form').addEventListener('submit', e => e.preventDefault());

  $('output').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn || !current) return;
    if (btn.classList.contains('link-toggle')) {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      const box = $(btn.getAttribute('aria-controls'));
      box.classList.toggle('open', open);
      box.inert = !open;
      return;
    }
    if (btn.hasAttribute('data-copy-all')) {
      const hasShort = current.links.some(l => l.short);
      const rows = [['Link', 'Long URL'].concat(hasShort ? ['Short URL'] : [])];
      for (const l of current.links) rows.push([l.label, l.long].concat(hasShort ? [l.short || ''] : []));
      copy(rows.map(r => r.join('\t')).join('\n'), btn);
      return;
    }
    const link = current.links[Number(btn.dataset.copy)];
    copy(btn.dataset.kind === 'short' ? link.short : link.long, btn);
  });

  load();
  render();
}
