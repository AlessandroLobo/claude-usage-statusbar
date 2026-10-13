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

const render = (snap, now, opts) => {
  const window = contextWindow(snap.model, opts.contextWindow);
  const parts = [];
  if (opts.showSessionTime && snap.startedAt !== null) parts.push(`$(clock) ${formatElapsed(now - snap.startedAt)}`);
  let pct = null;
  if (snap.ctxTokens !== null) {
    pct = Math.round((snap.ctxTokens / window) * 100);
    parts.push(`${formatTokens(snap.ctxTokens)}/${formatTokens(window)} (${pct}%)`);
  } else {
    parts.push(`–/${formatTokens(window)}`);
  }
  if (opts.showCost) parts.push(`US$ ${snap.costUsd.toFixed(2)}`);
  if (opts.showTurn && snap.turnMs !== null) parts.push(`turno ${formatTurn(snap.turnMs)}${snap.running ? ' ▶' : ''}`);

  const t = snap.totals;
  const lines = [
    `**Claude Code — sessão atual**`,
    ``,
    `| | |`,
    `|---|---|`,
    `| Modelo | ${snap.model ?? '–'} |`,
    `| Contexto | ${snap.ctxTokens === null ? '–' : snap.ctxTokens.toLocaleString('pt-BR')} / ${window.toLocaleString('pt-BR')} tokens |`,
    `| Custo estimado | US$ ${snap.costUsd.toFixed(4)}${snap.unpriced ? ' (há modelo sem preço conhecido)' : ''} |`,
    `| Tokens (soma) | in ${formatTokens(t.input)} · out ${formatTokens(t.output)} · cache lido ${formatTokens(t.cacheRead)} · cache escrito ${formatTokens(t.cacheWrite)} |`,
    ``,
    `Custo calculado pela tabela de preços da API a partir do transcript (inclui subagentes); não é o valor de cobrança.`,
  ];
  return { text: parts.join(' · '), tooltip: lines.join('\n'), pct };
};

module.exports = { Tracker, findSession, render, messageCost, contextWindow, formatTokens, formatElapsed, formatTurn };
