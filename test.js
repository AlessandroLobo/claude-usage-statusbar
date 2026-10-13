'use strict';

// Teste de fumaça da lógica pura: node test.js [pasta-do-projeto]
const assert = require('assert');
const core = require('./core');

assert.strictEqual(core.formatTokens(65_300), '65k');
assert.strictEqual(core.formatTokens(1_000_000), '1M');
assert.strictEqual(core.formatElapsed(8 * 60_000), '8m');
assert.strictEqual(core.formatElapsed(125 * 60_000), '2h05');
assert.strictEqual(core.formatTurn(10_000), '0:10');
assert.strictEqual(core.contextWindow('claude-sonnet-5-5', 0), 1_000_000);
assert.strictEqual(core.contextWindow('claude-haiku-4-5', 0), 200_000);
assert.strictEqual(core.contextWindow('claude-sonnet-5-5', 500_000), 500_000);

// 1M de input a US$ 2/M = US$ 2; 1M de output a US$ 10/M = US$ 10 (Sonnet 5.5)
const usd = core.messageCost('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 1e6 });
assert.ok(Math.abs(usd - 12) < 1e-9, `custo esperado 12, veio ${usd}`);
assert.strictEqual(core.messageCost('modelo-desconhecido', { input_tokens: 1 }), null);

const paths = process.argv.slice(2);
const session = core.findSession(paths);
if (!session) {
  console.log('Sem sessão para', paths.length ? paths : '(qualquer projeto)');
} else {
  const tracker = new core.Tracker();
  const now = Date.now();
  const snap = tracker.update(session.file, now);
  const view = core.render(snap, now, { contextWindow: 0, showCost: true, showTurn: true, showSessionTime: true });
  console.log(session.file);
  console.log(view.text);
}
// leitura incremental sobre um transcript sintético
const fs = require('fs');
const os = require('os');
const path = require('path');
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cub-')), 's.jsonl');
const rec = (type, ts, extra) => JSON.stringify({ type, timestamp: ts, ...extra }) + '\n';
fs.writeFileSync(
  file,
  rec('user', '2026-01-01T10:00:00Z', { message: { role: 'user', content: 'oi' } }) +
    rec('assistant', '2026-01-01T10:00:20Z', {
      message: { id: 'm1', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 9000 } },
    }),
);
const t = new core.Tracker();
const a = t.update(file, Date.parse('2026-01-01T10:05:00Z'));
assert.strictEqual(a.ctxTokens, 10_100);
assert.strictEqual(a.turnMs, 20_000);
assert.strictEqual(a.running, false);
fs.appendFileSync(file, rec('assistant', '2026-01-01T10:06:00Z', {
  message: { id: 'm1', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 9000 } },
}));
const b = t.update(file, Date.parse('2026-01-01T10:07:00Z'));
assert.ok(b.costUsd > a.costUsd, 'mesma mensagem reaparecendo deve substituir, não somar');
assert.ok(Math.abs(b.costUsd - (1000 * 2 + 200 * 10 + 9000 * 0.2) / 1e6) < 1e-12);
// limites 5h/7d a partir de um snapshot sintético da claude-usage-meter
assert.strictEqual(core.formatRemaining(4 * 3_600_000 + 18 * 60_000), '4h18');
assert.strictEqual(core.formatRemaining(26 * 3_600_000), '1d 2h');
assert.strictEqual(core.formatRemaining(12 * 60_000), '12m');

const snapFile = path.join(path.dirname(file), 'usage-snapshot.json');
const at = Date.parse('2026-01-01T10:07:00Z');
const writeSnap = (v, receivedAt) =>
  fs.writeFileSync(
    snapFile,
    JSON.stringify({
      v,
      report: {
        receivedAt,
        session: { utilization: 12.4, resetsAt: at + 4 * 3_600_000 + 18 * 60_000 },
        weekly: { utilization: 49, resetsAt: at + 2 * 3_600_000 + 28 * 60_000 },
      },
    }),
  );
const lim = { snapshotPath: snapFile, staleMinutes: 15 };
const allOpts = { contextWindow: 0, showCost: true, showTurn: true, showSessionTime: true, showLimits: true };

writeSnap(1, at - 60_000);
const fresh = core.readLimits(at, lim);
assert.strictEqual(fresh.session.percent, 12);
assert.strictEqual(fresh.stale, false);
const v = core.render(b, at, allOpts, fresh);
assert.ok(v.text.includes('5h 12% ↻4h18'), v.text);
assert.ok(v.text.includes('7d 49% ↻2h28'), v.text);
assert.ok(core.renderPanel(b, at, allOpts, fresh).includes('Sessão (5h)'));

writeSnap(1, at - 20 * 60_000);
const old = core.readLimits(at, lim);
assert.strictEqual(old.stale, true);
assert.ok(!core.render(b, at, allOpts, old).text.includes('5h '), 'leitura velha não deve aparecer');

writeSnap(2, at);
assert.strictEqual(core.readLimits(at, lim), null, 'versão desconhecida do snapshot é ignorada');
assert.strictEqual(core.readLimits(at, { snapshotPath: path.join(path.dirname(file), 'nao-existe.json'), staleMinutes: 15 }), null);
assert.ok(core.render(b, at, allOpts, null).text.includes('US$'), 'sem snapshot a barra segue funcionando');

// trechos separados (cada um vira um item da barra) e cores de identidade
writeSnap(1, at - 60_000);
const fresh2 = core.readLimits(at, lim);
const seg = core.render(b, at, allOpts, fresh2);
assert.ok(seg.segments.five.startsWith('5h 12%') && seg.segments.week.startsWith('7d 49%'));
assert.ok(seg.segments.main.includes('/1M') && seg.segments.tail.includes('US$'));
assert.deepStrictEqual(seg.warn, { main: false, five: false, week: false });
assert.strictEqual(core.normalizeColor('#4fc1ff'), '#4fc1ff');
assert.strictEqual(core.normalizeColor('charts.blue'), 'charts.blue');
assert.strictEqual(core.normalizeColor('red;background:url(x)'), null);
assert.strictEqual(core.normalizeColor(''), null);
const html = core.renderPanel(b, at, { ...allOpts, colorFive: '#4fc1ff', colorWeek: 'charts.purple' }, fresh2);
assert.ok(html.includes('background:#4fc1ff;') && html.includes('var(--vscode-charts-purple)'));
console.log('ok');
