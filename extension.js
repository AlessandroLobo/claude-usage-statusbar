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

function activate(context) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.name = 'Claude Usage';
  item.command = 'claudeUsageBar.openPanel';
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
      limitsStaleMinutes: Math.max(1, c.get('limitsStaleMinutes', 15)),
    };
  };

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
        item.hide();
        return;
      }
      const view = core.render(snap, now, opts, limits);
      item.text = view.text;
      item.tooltip = new vscode.MarkdownString(view.tooltip);
      item.backgroundColor = view.warn ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
      item.show();
    } catch (e) {
      item.text = '$(warning) Claude';
      item.tooltip = `claude-usage-statusbar: ${e && e.message ? e.message : e}`;
      item.show();
    }
  };

  const schedule = () => {
    clearInterval(timer);
    timer = setInterval(update, options().refreshSeconds * 1000);
  };

  context.subscriptions.push(
    item,
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
