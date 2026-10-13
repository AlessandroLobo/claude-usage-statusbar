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
console.log('ok');
