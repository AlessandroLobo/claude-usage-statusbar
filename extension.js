'use strict';

const vscode = require('vscode');
const core = require('./core');

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

class PanelProvider {
  constructor() {
    this.view = null;
    this.html = '';
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: false };
    view.webview.html = this.html;
    view.onDidDispose(() => {
      if (this.view === view) this.view = null;
    });
  }

  set(html) {
    if (html === this.html) return;
    this.html = html;
    if (this.view) this.view.webview.html = html;
  }
}

const toColor = value => {
  const c = core.normalizeColor(value);
  if (!c) return undefined;
  return c.startsWith('#') ? c : new vscode.ThemeColor(c);
};

function activate(context) {
  // Itens separados (prioridade maior = mais à esquerda): só assim cada trecho pode ter cor própria.
  // A faixa de prioridade é alta e exclusiva para que itens de outras extensões não se encaixem no meio.
  const make = (name, priority) => {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);
    item.name = name;
    item.command = 'claudeUsageBar.openPanel';
    return item;
  };
  const items = {
    main: make('Claude Usage', 10003),
    five: make('Claude Usage 5h', 10002),
    week: make('Claude Usage 7d', 10001),
    tail: make('Claude Usage custo', 10000),
  };
  const tracker = new core.Tracker();
  const panel = new PanelProvider();
  let hidden = false;
  let timer;
  let lastNudge = 0;

  const options = () => {
    const c = vscode.workspace.getConfiguration('claudeUsageBar');
    return {
      contextWindow: c.get('contextWindow', 0),
      showCost: c.get('showCost', true),
      showTurn: c.get('showTurn', true),
      showSessionTime: c.get('showSessionTime', true),
      showLimits: c.get('showLimits', true),
      refreshSeconds: Math.max(1, c.get('refreshSeconds', 5)),
      limitsSnapshotPath: c.get('limitsSnapshotPath', ''),
      limitsStaleMinutes: Math.max(1, c.get('limitsStaleMinutes', 30)),
      refreshLimits: c.get('refreshLimits', true),
      fetchLimitsDirectly: c.get('fetchLimitsDirectly', false),
      directRefreshMinutes: Math.max(3, c.get('directRefreshMinutes', 5)),
      colorFive: c.get('colorSession5h', 'charts.blue'),
      colorWeek: c.get('colorWeekly7d', 'charts.yellow'),
    };
  };

  // Consulta opcional (desligada por padrão) ao mesmo endpoint usado pela claude-usage-meter.
  let own = null;
  let nextPollAt = 0;
  let failures = 0;
  let polling = false;

  const pollDirect = async opts => {
    const now = Date.now();
    if (polling || now < nextPollAt || typeof fetch !== 'function') return false;
    polling = true;
    let status = 0;
    let retryAfterMs = null;
    try {
      const cred = core.readCredentials();
      if (cred.error || (cred.expiresAt !== null && cred.expiresAt <= now)) {
        // O próprio Claude Code renova o token; só olhamos de novo em instantes.
        nextPollAt = now + 60_000;
        return false;
      }
      const ctl = new AbortController();
      const timeout = setTimeout(() => ctl.abort(), 15_000);
      try {
        const res = await fetch(USAGE_URL, {
          headers: {
            Authorization: 'Bearer ' + cred.token,
            'anthropic-beta': 'oauth-2025-04-20',
            'anthropic-version': '2023-06-01',
            Accept: 'application/json',
            'User-Agent': 'claude-usage-statusbar',
          },
          signal: ctl.signal,
        });
        status = res.status;
        const retryAfter = Number(res.headers.get('retry-after'));
        retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null;
        if (status === 200) {
          const parsed = core.parseUsageBody(await res.json(), Date.now());
          if (parsed) own = parsed;
          else status = 0;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      status = 0;
    } finally {
      polling = false;
      failures = status === 200 ? 0 : failures + 1;
      nextPollAt = Date.now() + core.nextPollDelay({ status, retryAfterMs, failures }, opts.directRefreshMinutes * 60_000);
    }
    return status === 200;
  };

  const hideAll = () => Object.values(items).forEach(i => i.hide());

  const update = () => {
    try {
      const opts = options();
      const now = Date.now();
      const paths = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
      const session = core.findSession(paths);
      const snap = session ? tracker.update(session.file, now) : null;
      const meterLimits = core.readLimits(now, { snapshotPath: opts.limitsSnapshotPath, staleMinutes: opts.limitsStaleMinutes });
      if (opts.fetchLimitsDirectly) pollDirect(opts).then(fetched => fetched && update());
      const limits = core.pickLimits(meterLimits, opts.fetchLimitsDirectly ? core.withAge(own, now, opts.limitsStaleMinutes) : null);

      if (!opts.fetchLimitsDirectly && opts.refreshLimits && core.shouldNudge(limits, now, lastNudge)) {
        lastNudge = now;
        // A meter é quem consulta a API e controla o limite de requisições; aqui só pedimos que releia.
        Promise.resolve(vscode.commands.executeCommand('claudeUsageMeter.refresh')).then(update, () => {});
      }

      panel.set(core.renderPanel(snap, now, opts, limits));

      if (hidden) {
        hideAll();
        return;
      }
      const view = core.render(snap, now, opts, limits);
      const tooltip = new vscode.MarkdownString(view.tooltip);
      const warning = new vscode.ThemeColor('statusBarItem.warningBackground');
      const colors = { five: toColor(opts.colorFive), week: toColor(opts.colorWeek) };
      const red = new vscode.ThemeColor('charts.red');
      const alertColors = { main: new vscode.ThemeColor('charts.orange'), five: red, week: red, tail: undefined };

      const text = { main: view.segments.main, five: view.segments.five, week: view.segments.week, tail: view.segments.tail };
      if (!Object.values(text).some(Boolean)) text.main = view.text;

      for (const [key, item] of Object.entries(items)) {
        if (!text[key]) {
          item.hide();
          continue;
        }
        item.text = text[key];
        item.tooltip = tooltip;
        // Em alerta, o texto assume a cor de severidade do tema (o fundo de alerta de alguns temas é igual ao da barra).
        item.color = view.warn[key] ? alertColors[key] : colors[key];
        item.backgroundColor = view.warn[key] ? warning : undefined;
        item.show();
      }
    } catch (e) {
      items.main.text = '$(warning) Claude';
      items.main.tooltip = `claude-usage-statusbar: ${e && e.message ? e.message : e}`;
      items.main.show();
    }
  };

  const schedule = () => {
    clearInterval(timer);
    timer = setInterval(update, options().refreshSeconds * 1000);
  };

  context.subscriptions.push(
    ...Object.values(items),
    { dispose: () => clearInterval(timer) },
    vscode.window.registerWebviewViewProvider('claudeUsageBar.panel', panel),
    vscode.commands.registerCommand('claudeUsageBar.refresh', update),
    vscode.commands.registerCommand('claudeUsageBar.openPanel', () => vscode.commands.executeCommand('claudeUsageBar.panel.focus')),
    vscode.commands.registerCommand('claudeUsageBar.toggle', () => {
      hidden = !hidden;
      update();
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeUsageBar')) {
        schedule();
        update();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(update),
  );

  schedule();
  update();
}

function deactivate() {}

module.exports = { activate, deactivate };
