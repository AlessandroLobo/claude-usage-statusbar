'use strict';

// Lógica pura (sem dependência do VS Code): localiza o transcript da sessão do
// Claude Code, lê só o que foi acrescentado desde a última leitura e calcula as métricas.

const fs = require('fs');
const os = require('os');
const path = require('path');

// USD por 1M de tokens. `cr` = cache read; escrita de cache = 1.25x (5m) e 2x (1h) do input.
// Haiku 5.5 usa outra tabela quando o prompt passa de 100K tokens.
const PRICES = [
  { re: /fable|mythos/, in: 10, out: 50, cr: 0.25 },
  { re: /opus-5-5/, in: 4, out: 20, cr: 0.2 },
  { re: /opus-(5|4-[5-9])(?!\d)/, in: 5, out: 25 },
  { re: /opus/, in: 15, out: 75 },
  { re: /sonnet-5/, in: 2, out: 10 },
  { re: /sonnet/, in: 3, out: 15 },
  { re: /haiku-5/, in: 0.1, out: 0.5, long: { in: 0.5, out: 2.5 } },
  { re: /haiku-4/, in: 1, out: 5 },
  { re: /haiku-3-5/, in: 0.8, out: 4 },
  { re: /haiku/, in: 0.25, out: 1.25 },
];

const priceFor = model => (model ? PRICES.find(p => p.re.test(model)) : undefined);

const messageCost = (model, u) => {
  const p = priceFor(model);
  if (!p) return null;
  const input = u.input_tokens || 0;
  const read = u.cache_read_input_tokens || 0;
  const written = u.cache_creation_input_tokens || 0;
  let w5 = written;
  let w1h = 0;
  if (u.cache_creation) {
    w5 = u.cache_creation.ephemeral_5m_input_tokens || 0;
    w1h = u.cache_creation.ephemeral_1h_input_tokens || 0;
    if (w5 + w1h === 0) w5 = written;
  }
  const card = p.long && input + read + written > 100_000 ? { ...p, ...p.long, cr: undefined } : p;
  const crPrice = card.cr ?? card.in * 0.1;
  return (
    (input * card.in + w5 * card.in * 1.25 + w1h * card.in * 2 + read * crPrice + (u.output_tokens || 0) * card.out) /
    1e6
  );
};

const claudeDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

const encodeProject = p => p.replace(/[^a-zA-Z0-9]/g, '-');

const newestJsonl = dir => {
  let best = null;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const n of names) {
    if (!n.endsWith('.jsonl')) continue;
    const file = path.join(dir, n);
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    if (st.isFile() && (!best || st.mtimeMs > best.mtime)) best = { file, mtime: st.mtimeMs };
  }
  return best;
};

// Sessão mais recente dos projetos que correspondem às pastas abertas (ou de todos, sem pasta aberta).
const findSession = workspacePaths => {
  const root = path.join(claudeDir(), 'projects');
  let dirs;
  try {
    dirs = fs.readdirSync(root);
  } catch {
    return null;
  }
  const wanted = new Set(workspacePaths.map(p => encodeProject(p).toLowerCase()));
  const pool = workspacePaths.length ? dirs.filter(d => wanted.has(d.toLowerCase())) : dirs;
  let best = null;
  for (const d of pool) {
    const n = newestJsonl(path.join(root, d));
    if (n && (!best || n.mtime > best.mtime)) best = n;
  }
  return best;
};

const DONE_REASONS = new Set(['end_turn', 'stop_sequence', 'max_tokens', 'refusal']);

const isRealPrompt = rec => {
  if (rec.isMeta || rec.toolUseResult) return false;
  const c = rec.message && rec.message.content;
  if (typeof c === 'string') return !/^<(command-|local-command)/.test(c.trimStart());
  if (!Array.isArray(c)) return false;
  return c.some(b => b.type === 'text') && !c.some(b => b.type === 'tool_result');
};

const newState = () => ({
  pos: 0,
  mtime: 0,
  msgs: new Map(),
  firstTs: null,
  lastTs: null,
  promptTs: null,
  assistantTs: null,
  kind: null,
  ctx: null,
  cost: null,
});

class Tracker {
  constructor() {
    this.files = new Map();
    this.sessionFile = null;
  }

  _readNew(file, main) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      return;
    }
    let s = this.files.get(file);
    if (!s || st.size < s.pos) {
      s = newState();
      this.files.set(file, s);
    }
    s.mtime = st.mtimeMs;
    if (st.size === s.pos) return;

    const buf = Buffer.alloc(st.size - s.pos);
    const fd = fs.openSync(file, 'r');
    try {
      fs.readSync(fd, buf, 0, buf.length, s.pos);
    } finally {
      fs.closeSync(fd);
    }
    const end = buf.lastIndexOf(0x0a);
    if (end < 0) return;
    s.pos += end + 1;
    s.cost = null;
    for (const line of buf.subarray(0, end + 1).toString('utf8').split('\n')) {
      if (!line) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      this._ingest(s, rec, main);
    }
  }

  _ingest(s, rec, main) {
    const t = rec.timestamp ? Date.parse(rec.timestamp) : NaN;
    if (!Number.isNaN(t)) {
      if (s.firstTs === null) s.firstTs = t;
      s.lastTs = t;
    }
    const m = rec.message;
    if (rec.type === 'assistant' && m && m.usage) {
      if (m.model === '<synthetic>') return;
      s.msgs.set(m.id || rec.uuid, { model: m.model, usage: m.usage });
      if (main && !rec.isSidechain) {
        const u = m.usage;
        s.ctx = {
          model: m.model,
          tokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0),
        };
        if (!Number.isNaN(t)) s.assistantTs = t;
        s.kind = DONE_REASONS.has(m.stop_reason) ? 'done' : 'busy';
      }
    } else if (main && rec.type === 'user' && !rec.isSidechain && !rec.isMeta) {
      if (isRealPrompt(rec) && !Number.isNaN(t)) s.promptTs = t;
      s.kind = 'busy';
    }
  }

  // Lê (incrementalmente) o transcript da sessão e os dos subagentes; devolve o retrato atual.
  update(sessionFile, now) {
    if (sessionFile !== this.sessionFile) {
      this.files.clear();
      this.sessionFile = sessionFile;
    }
    this._readNew(sessionFile, true);
    const subDir = path.join(sessionFile.replace(/\.jsonl$/, ''), 'subagents');
    let subs = [];
    try {
      subs = fs.readdirSync(subDir).filter(n => n.endsWith('.jsonl'));
    } catch {
      /* sem subagentes */
    }
    for (const n of subs) this._readNew(path.join(subDir, n), false);

    const main = this.files.get(sessionFile);
    let costUsd = 0;
    let unpriced = false;
    const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const s of this.files.values()) {
      if (s.cost === null) {
        s.cost = { usd: 0, unpriced: false, ...{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
        for (const { model, usage: u } of s.msgs.values()) {
          const c = messageCost(model, u);
          if (c === null) s.cost.unpriced = true;
          else s.cost.usd += c;
          s.cost.input += u.input_tokens || 0;
          s.cost.output += u.output_tokens || 0;
          s.cost.cacheRead += u.cache_read_input_tokens || 0;
          s.cost.cacheWrite += u.cache_creation_input_tokens || 0;
        }
      }
      costUsd += s.cost.usd;
      unpriced = unpriced || s.cost.unpriced;
      totals.input += s.cost.input;
      totals.output += s.cost.output;
      totals.cacheRead += s.cost.cacheRead;
      totals.cacheWrite += s.cost.cacheWrite;
    }

    const running = main.kind === 'busy' && now - main.mtime < 120_000;
    let turnMs = null;
    if (main.promptTs !== null) {
      const end = running ? now : main.assistantTs;
      if (end !== null && end >= main.promptTs) turnMs = end - main.promptTs;
    }
    return {
      file: sessionFile,
      startedAt: main.firstTs,
      model: main.ctx ? main.ctx.model : null,
      ctxTokens: main.ctx ? main.ctx.tokens : null,
      costUsd,
      unpriced,
      totals,
      running,
      turnMs,
    };
  }
}

const contextWindow = (model, configured) => {
  if (configured > 0) return configured;
  if (model && /haiku-4|haiku-3|claude-3|opus-4-[01](?!\d)|opus-4-2025|sonnet-4-2025|sonnet-4-5/.test(model)) return 200_000;
  return 1_000_000;
};

const formatTokens = n =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;

const formatElapsed = ms => {
  const min = Math.floor(ms / 60_000);
  if (min >= 1440) return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
  return min > 60 ? `${Math.floor(min / 60)}h${`${min % 60}`.padStart(2, '0')}` : `${min}m`;
};

const formatTurn = ms => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`;
};

// Limites de 5h/7d: lidos do snapshot compartilhado da extensão claude-usage-meter
// (sem rede e sem tocar em credenciais). Qualquer divergência de formato => sem limites.
const limitsSnapshotPath = override => override || path.join(os.homedir(), '.claude-usage-meter', 'usage-snapshot.json');

const readLimits = (now, { snapshotPath, staleMinutes }) => {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(limitsSnapshotPath(snapshotPath), 'utf8'));
  } catch {
    return null;
  }
  if (!raw || raw.v !== 1 || !raw.report) return null;
  const pick = w =>
    w && typeof w.utilization === 'number'
      ? { percent: Math.round(w.utilization), resetsAt: typeof w.resetsAt === 'number' ? w.resetsAt : null }
      : null;
  const receivedAt = typeof raw.report.receivedAt === 'number' ? raw.report.receivedAt : null;
  return {
    session: pick(raw.report.session),
    weekly: pick(raw.report.weekly),
    receivedAt,
    ageMs: receivedAt === null ? null : now - receivedAt,
    stale: receivedAt === null || now - receivedAt > staleMinutes * 60_000,
  };
};

const formatRemaining = ms => {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min >= 1440) return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
  if (min >= 60) return `${Math.floor(min / 60)}h${`${min % 60}`.padStart(2, '0')}`;
  return `${min}m`;
};

const clock = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// Janela utilizável: leitura recente e ainda não reiniciada.
const liveWindow = (w, limits, now) => {
  if (!w || !limits || limits.stale) return null;
  if (w.resetsAt !== null && w.resetsAt <= now) return null;
  return w;
};

const resetSuffix = (w, now) => (w.resetsAt === null ? '' : ` ↻${formatRemaining(w.resetsAt - now)}`);

// Leitura que já não é recente (a meter atualiza a cada ~5 min) vem com a idade ao lado.
const AGED_MS = 10 * 60_000;
const ageSuffix = limits => (limits && limits.ageMs !== null && limits.ageMs >= AGED_MS ? ` (há ${formatRemaining(limits.ageMs)})` : '');

const render = (snap, now, opts, limits) => {
  const main = [];
  const tail = [];
  const lines = ['**Claude Code — sessão atual**', '', '| | |', '|---|---|'];
  let warnMain = false;
  let warnFive = false;
  let warnWeek = false;
  let fiveText = null;
  let weekText = null;

  if (snap) {
    const window = contextWindow(snap.model, opts.contextWindow);
    if (opts.showSessionTime && snap.startedAt !== null) main.push(`$(clock) ${formatElapsed(now - snap.startedAt)}`);
    if (snap.ctxTokens !== null) {
      const pct = Math.round((snap.ctxTokens / window) * 100);
      main.push(`${formatTokens(snap.ctxTokens)}/${formatTokens(window)} (${pct}%)`);
      warnMain = pct >= 80;
    } else {
      main.push(`–/${formatTokens(window)}`);
    }
  }

  const five = liveWindow(limits && limits.session, limits, now);
  const week = liveWindow(limits && limits.weekly, limits, now);
  if (opts.showLimits) {
    if (five) {
      fiveText = `5h ${five.percent}%${resetSuffix(five, now)}${ageSuffix(limits)}`;
      warnFive = five.percent >= 90;
    }
    if (week) {
      weekText = `7d ${week.percent}%${resetSuffix(week, now)}${ageSuffix(limits)}`;
      warnWeek = week.percent >= 90;
    }
  }

  if (snap) {
    if (opts.showCost) tail.push(`US$ ${snap.costUsd.toFixed(2)}`);
    if (opts.showTurn && snap.turnMs !== null) tail.push(`turno ${formatTurn(snap.turnMs)}${snap.running ? ' ▶' : ''}`);
    const window = contextWindow(snap.model, opts.contextWindow);
    const t = snap.totals;
    lines.push(
      `| Modelo | ${snap.model ?? '–'} |`,
      `| Contexto | ${snap.ctxTokens === null ? '–' : snap.ctxTokens.toLocaleString('pt-BR')} / ${window.toLocaleString('pt-BR')} tokens |`,
      `| Custo estimado | US$ ${snap.costUsd.toFixed(4)}${snap.unpriced ? ' (há modelo sem preço conhecido)' : ''} |`,
      `| Tokens (soma) | in ${formatTokens(t.input)} · out ${formatTokens(t.output)} · cache lido ${formatTokens(t.cacheRead)} · cache escrito ${formatTokens(t.cacheWrite)} |`,
    );
  }
  const remaining = w => (w.resetsAt === null ? '' : ` — reseta em ${formatRemaining(w.resetsAt - now)}`);
  if (five) lines.push(`| Limite 5h | ${five.percent}%${remaining(five)} |`);
  if (week) lines.push(`| Limite 7d | ${week.percent}%${remaining(week)} |`);
  lines.push('');
  if (snap) lines.push('Custo calculado pela tabela de preços da API a partir do transcript (inclui subagentes); não é o valor de cobrança.');
  if (limits && limits.receivedAt !== null) {
    lines.push(`Limites lidos da claude-usage-meter às ${clock(limits.receivedAt)}${limits.stale ? ' (desatualizados, não exibidos)' : ''}.`);
  }
  const segments = {
    main: main.length ? main.join(' · ') : null,
    five: fiveText,
    week: weekText,
    tail: tail.length ? tail.join(' · ') : null,
  };
  const all = [segments.main, segments.five, segments.week, segments.tail].filter(Boolean);
  return {
    text: all.length ? all.join(' · ') : '$(clock) Claude: sem dados',
    segments,
    warn: { main: warnMain, five: warnFive, week: warnWeek },
    tooltip: lines.join('\n'),
  };
};

// Aceita "#rgb"/"#rrggbb" ou id de cor do tema ("charts.blue"); qualquer outra coisa é ignorada.
const normalizeColor = v => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) || /^[a-zA-Z][a-zA-Z0-9.]*$/.test(s) ? s : null;
};

const cssColor = c => (c.startsWith('#') ? c : `var(--vscode-${c.replace(/\./g, '-')})`);

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const barClass = p => (p >= 80 ? 'hi' : p >= 50 ? 'mid' : 'ok');

// Com `color`, título, percentual e barra usam a cor de identidade até 80%; acima disso vale a cor de alerta.
const barRow = (title, percent, note, color) => {
  const own = color ? cssColor(color) : null;
  const alert = percent >= 80;
  const fill = own && !alert ? `background:${own};` : '';
  const ink = own ? ` style="color:${own}"` : '';
  return (
    `<div class="row"><div class="top"><span${ink}>${esc(title)}</span><span${ink}>${percent}%</span></div>` +
    `<div class="track"><div class="fill ${fill ? '' : barClass(percent)}" style="${fill}width:${Math.min(100, Math.max(0, percent))}%"></div></div>` +
    `<div class="sub">${esc(note)}</div></div>`
  );
};

// HTML do painel lateral (barras de uso). Sem scripts; atualizado trocando o HTML.
const renderPanel = (snap, now, opts, limits) => {
  const five = liveWindow(limits && limits.session, limits, now);
  const week = liveWindow(limits && limits.weekly, limits, now);
  const resets = w => [w.resetsAt !== null ? `Reseta em ${formatRemaining(w.resetsAt - now)}` : '', ageSuffix(limits).trim().replace(/^\((.*)\)$/, 'leitura $1')].filter(Boolean).join(' · ');
  const body = ['<h2>Uso da assinatura</h2>'];

  if (five || week) {
    if (five) body.push(barRow('Sessão (5h)', five.percent, resets(five), normalizeColor(opts.colorFive)));
    if (week) body.push(barRow('Semanal (7 dias)', week.percent, resets(week), normalizeColor(opts.colorWeek)));
  } else {
    const why =
      limits && limits.stale
        ? `Leitura dos limites desatualizada (última às ${clock(limits.receivedAt)}).`
        : 'Limites 5h/7d indisponíveis: instale e mantenha ativa a extensão <b>claude-usage-meter</b>.';
    body.push(`<div class="sub">${why}</div>`);
  }

  body.push('<h2>Sessão atual</h2>');
  if (snap) {
    const window = contextWindow(snap.model, opts.contextWindow);
    if (snap.ctxTokens !== null) {
      const pct = Math.round((snap.ctxTokens / window) * 100);
      body.push(barRow('Contexto', pct, `${snap.ctxTokens.toLocaleString('pt-BR')} / ${window.toLocaleString('pt-BR')} tokens`));
    }
    const kv = [['Modelo', snap.model ?? '–']];
    if (snap.startedAt !== null) kv.push(['Tempo', formatElapsed(now - snap.startedAt)]);
    if (opts.showCost) kv.push(['Custo estimado', `US$ ${snap.costUsd.toFixed(2)}`]);
    if (snap.turnMs !== null) kv.push(['Último turno', `${formatTurn(snap.turnMs)}${snap.running ? ' ▶' : ''}`]);
    body.push(`<table>${kv.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`);
  } else {
    body.push('<div class="sub">Nenhum transcript do Claude Code encontrado para esta pasta.</div>');
  }

  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);padding:4px 14px 14px}
h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;margin:14px 0 10px;color:var(--vscode-descriptionForeground)}
.row{margin-bottom:14px}
.top{display:flex;justify-content:space-between;font-weight:600;margin-bottom:5px}
.track{height:6px;border-radius:3px;background:rgba(128,128,128,.3);overflow:hidden}
.fill{height:100%;border-radius:3px}
.ok{background:var(--vscode-charts-green,#89d185)}.mid{background:var(--vscode-charts-yellow,#cca700)}.hi{background:var(--vscode-charts-red,#f14c4c)}
.sub{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:5px;line-height:1.4}
table{border-collapse:collapse;width:100%}td{padding:2px 0}td:first-child{color:var(--vscode-descriptionForeground);padding-right:12px;white-space:nowrap}td:last-child{text-align:right;word-break:break-all}
</style></head><body>${body.join('')}</body></html>`;
};

// Pede à claude-usage-meter uma leitura nova quando a atual envelheceu, no máximo uma vez por intervalo.
const NUDGE_AFTER_MS = 6 * 60_000;
const NUDGE_EVERY_MS = 5 * 60_000;
const shouldNudge = (limits, now, lastNudge) => {
  const age = limits && limits.ageMs !== null ? limits.ageMs : Infinity;
  return age >= NUDGE_AFTER_MS && now - lastNudge >= NUDGE_EVERY_MS;
};

module.exports = {
  shouldNudge,
  Tracker,
  findSession,
  render,
  renderPanel,
  readLimits,
  messageCost,
  contextWindow,
  formatTokens,
  formatElapsed,
  formatTurn,
  formatRemaining,
  normalizeColor,
};
