'use strict';

const vscode = require('vscode');
const core = require('./core');

function activate(context) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.name = 'Claude Usage';
  item.command = 'claudeUsageBar.refresh';
  const tracker = new core.Tracker();
  let hidden = false;
  let timer;

  const options = () => {
    const c = vscode.workspace.getConfiguration('claudeUsageBar');
    return {
      contextWindow: c.get('contextWindow', 0),
      showCost: c.get('showCost', true),
      showTurn: c.get('showTurn', true),
      showSessionTime: c.get('showSessionTime', true),
      refreshSeconds: Math.max(1, c.get('refreshSeconds', 5)),
    };
  };

  const update = () => {
    if (hidden) {
      item.hide();
      return;
    }
    try {
      const paths = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
      const session = core.findSession(paths);
      if (!session) {
        item.text = '$(clock) Claude: sem sessão';
        item.tooltip = 'Nenhum transcript do Claude Code encontrado para esta pasta.';
        item.backgroundColor = undefined;
        item.show();
        return;
      }
      const now = Date.now();
      const snap = tracker.update(session.file, now);
      const view = core.render(snap, now, options());
      item.text = view.text;
      item.tooltip = new vscode.MarkdownString(view.tooltip);
      item.backgroundColor =
        view.pct !== null && view.pct >= 80 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
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
    vscode.commands.registerCommand('claudeUsageBar.refresh', update),
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
