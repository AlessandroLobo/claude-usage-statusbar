# CLAUDE.md — claude-usage-statusbar

Contexto do projeto para sessões futuras do Claude Code. Responda e documente em **português (pt-BR)**.

## O que é

Extensão para **VS Code (≥ 1.82)** e **Antigravity** que mostra, na barra de status, o uso da sessão atual do Claude Code (tempo, contexto, limites 5h/7d, custo estimado, duração do turno) e um painel lateral com barras. Repositório: `AlessandroLobo/claude-usage-statusbar` (MIT). Projeto irmão para o Claude Code Desktop/terminal: `alessandrolobo-usage-band` (plugin).

**Por que existe:** a extensão oficial do Claude Code para o editor não desenha a UI de plugins (`ui_render`/`AbovePrompt`), então o plugin `usage-band` não aparece no VS Code/Antigravity. Esta extensão reproduz a barra lendo os dados por conta própria.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `core.js` | Lógica pura, sem `vscode`: localiza e lê o transcript de forma incremental, calcula custo (tabela `PRICES`), formata a barra (`render`) e o painel (`renderPanel`), lê o snapshot opcional da `claude-usage-meter`. |
| `direct.js` | Consulta dos limites 5h/7d na API de uso: credenciais, trava e cache compartilhados entre janelas, recuo. |
| `extension.js` | Só integração com o editor: 4 itens da barra, painel (webview), aviso de consentimento, comandos. |
| `test.js` | Testes da lógica (`node test.js`), sem VS Code. Inclui testes assíncronos do `direct.js` com `fetch` simulado. |
| `docs/*.png` | Imagens do README. Nomes com sufixo de versão (`-0.4`, `-0.6`) para furar o cache de imagens do GitHub ao trocar. |
| `Instalar.ps1` | Instala o `.vsix` da pasta no Antigravity e no VS Code encontrados (perfil padrão). |
| `.github/workflows/release.yml` | Na tag `v*`: roda `test.js`, gera o `.vsix` e cria o Release com `claude-usage-statusbar-metric-X.Y.Z.vsix` **e** `claude-usage-statusbar.vsix` (nome fixo usado por `releases/latest/download/...`). |

## Fontes de dados

- **Sessão** (tempo, contexto, custo, turno): `~/.claude/projects/<pasta codificada>/*.jsonl` (respeita `CLAUDE_CONFIG_DIR`). A pasta é o caminho do workspace com todo caractere não alfanumérico trocado por `-`, comparado sem diferenciar maiúsculas. Leitura incremental por byte offset até o último `\n`; mensagens repetidas (mesmo `message.id`) contam uma vez; inclui `subagents/*.jsonl`. **Só existe depois da primeira mensagem na pasta** — sem ela, a barra mostra só os limites.
- **Limites 5h/7d**: `GET https://api.anthropic.com/api/oauth/usage` (endpoint **não documentado**), headers `anthropic-beta: oauth-2025-04-20`, `anthropic-version: 2023-06-01`, `Authorization: Bearer <accessToken>`. Resposta: `five_hour`/`seven_day` com `utilization` (0–100) e `resets_at`.
  - Token: `~/.claude/.credentials.json` → `claudeAiOauth.accessToken`/`expiresAt`; no macOS, Keychain (`security find-generic-password -s "Claude Code-credentials" -w`). Token a menos de 5 min de vencer não é usado.
  - **Só com consentimento**: aviso único na primeira execução (`globalState` `claudeUsageBar.directConsentAsked`), que liga `claudeUsageBar.fetchLimitsDirectly` (padrão `false`). Sem isso, a extensão não usa rede.
  - **Uma consulta por computador**: cache `~/.claude-usage-statusbar/usage.json` + trava `poll.lock` (expira em 60 s). Vale entre janelas e entre VS Code e Antigravity.
  - **Frequência**: a cada nova resposta do Claude depois da última leitura, com espaçamento mínimo de 60 s (`activeRefreshSeconds`); parado, a cada 5 min (`directRefreshMinutes`). Em 429, respeita `Retry-After`/recua até 60 min. Leituras com > 10 min mostram a idade; > 30 min não são exibidas.
  - **Não** consultar por requisição: o terminal recebe os limites embutidos em cada resposta (sem custo extra); a extensão não tem acesso a isso e cada atualização é uma chamada — muitas chamadas geram 429.
- **Opcional**: snapshot da extensão `shivakrishnakokkula.claude-usage-meter` (`~/.claude-usage-meter/usage-snapshot.json`, `v: 1`). Vale a leitura mais recente entre ela e a consulta direta. Não é dependência.

## Barra e cores

- 4 itens separados (`main`, `five`, `week`, `tail`) para cada trecho ter cor própria; prioridades **10003–10000**, faixa exclusiva para outras extensões não se encaixarem no meio.
- Cores padrão são ids do tema (`charts.blue` p/ 5h, `charts.yellow` p/ 7d), acompanhando o tema ativo. Alerta: contexto ≥ 80% → `charts.orange`; limite ≥ 90% → `charts.red` (+ `statusBarItem.warningBackground`). O usuário usa o tema **Everforest** (5h `#7fbbb3`, 7d `#dbbc7f`); o plugin do Desktop usa esses mesmos hex.
- Clique em qualquer item abre o painel (`claudeUsageBar.panel`, webview em contêiner próprio da barra de atividades, ícone `media/icon.svg`, sem scripts, `enableCommandUris` para o link "ativar").

## Onde mostrar

`claudeUsageBar.showStatusBar` (padrão `true`) esconde os 4 itens da barra de status; o painel e o ícone seguem. O plugin `usage-band` tem o equivalente `showAbovePrompt` (`userConfig`, v0.3.0+). Os dois READMEs documentam a tabela de combinações.

## ID e nome na loja

O Marketplace da Microsoft exige `displayName` único: "Claude Usage Status Bar" já era de outra extensão (`barahana10.claude-code-usage-statusbar`) e a publicação foi recusada com "already exists". Mesmo assim o Marketplace recusou o `name` `claude-usage-statusbar` ("already exists", sem nenhuma extensão pública com esse nome), então o ID passou a ser **`alessandrolobo.claude-usage-statusbar-metric`** (v0.9.2), nas duas lojas. A versão 0.9.0/0.9.1 com o ID antigo ficou só na Open VSX e no GitHub. O `displayName` é "Claude Usage: Limits, Context & Cost". Repositório, pasta de cache (`~/.claude-usage-statusbar`), nome fixo do asset do Release (`claude-usage-statusbar.vsix`) e as chaves `claudeUsageBar.*` não mudaram.

## Lojas

- **Marketplace** (VS Code Microsoft): `npx --yes @vscode/vsce publish --no-dependencies` com `VSCE_PAT` (token do Azure DevOps, escopo Marketplace → Manage, "All accessible organizations"; vence conforme configurado). Publisher `alessandrolobo`.
- **Open VSX** (Antigravity e forks): `npx --yes ovsx publish <arquivo>.vsix -p $env:OVSX_PAT`. Namespace `alessandrolobo`. Um token só é mostrado na criação.
- Publicadas: 0.9.2 nas duas. A 0.9.0 do ID antigo (`...-statusbar`) ficou só na Open VSX.
- Pendente: reivindicar o namespace na Open VSX (Claim Ownership) e, se quiser, publicar via Trusted Publishers (OIDC, sem token guardado) a partir do `release.yml`.

## Publicar e atualizar

1. Aumentar `version` no `package.json`; **nunca** mudar `publisher`/`name` (ID da extensão).
2. `node test.js` → commit → push → `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Quem instalou por `.vsix` atualiza rodando de novo o comando do README (`iwr .../latest/download/claude-usage-statusbar.vsix` + `code|antigravity-ide --install-extension ... --force`). Não há atualização automática fora de loja.
4. **Perfis do VS Code**: a CLI instala no perfil padrão; para outro perfil, `--profile "Nome"`. No PC do autor, `C:\WorkStation\EficazERP` abre no perfil **"Claude Code"**.
5. Gerar `.vsix` local: `npx --yes @vscode/vsce package` (o `.vsix` fica fora do git).

## Convenções

- Código e docs em pt-BR. Comentários de 1 linha, descrevendo o comportamento atual (sem narrar correções, sem citar planos).
- Lógica nova vai em `core.js`/`direct.js` com teste em `test.js`; `extension.js` fica fino.
- Ao trocar imagem do README, use nome novo (sufixo de versão) por causa do cache do GitHub.
- README é a documentação pública: manter seções Compatibilidade, Cores, Instalação (1. instalar, 2. ativar, 3. primeira mensagem), Limites, Atualização, Configurações, Privacidade.

## Pendências / ideias

- Publicar na **Open VSX** (loja do Antigravity) para atualização automática — precisa de conta e token (`OVSX_TOKEN`).
- Mostrar "Claude: sem sessão nesta pasta" quando ainda não há transcript.
- Trocar ilustrações do README por capturas reais (a `statusbar-real.png` é anterior às cores).
- macOS (Keychain) e Linux sem teste real.
- O repositório está dentro do OneDrive; considerar clonar em `C:\WorkStation` para evitar conflito de sincronização do `.git`.
