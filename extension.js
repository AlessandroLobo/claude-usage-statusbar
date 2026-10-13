'use strict';

const vscode = require('vscode');
const core = require('./core');

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
      colorFive: c.get('colorSession5h', 'charts.blue'),
      colorWeek: c.get('colorWeekly7d', 'charts.yellow'),
    };
  };

  const hideAll = () => Object.values(items).forEach(i => i.hide());

  const update = () => {
    try {
      const opts = options();
      const now = Date.now();
      const paths = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
      const session = core.findSession(paths);
      const snap = session ? tracker.update(session.file, now) : null;
      const limits = core.readLimits(now, { snapshotPath: opts.limitsSnapshotPath, staleMinutes: opts.limitsStaleMinutes });

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
