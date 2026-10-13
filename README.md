<p align="center">
  <img src="docs/banner-0.2.png" alt="Claude Usage Status Bar" width="100%">
</p>

<p align="center">
  <img alt="versão" src="https://img.shields.io/badge/vers%C3%A3o-0.3.1-d97757">
  <img alt="licença" src="https://img.shields.io/badge/licen%C3%A7a-MIT-blue">
  <img alt="editores" src="https://img.shields.io/badge/VS%20Code%20%7C%20Antigravity-1.75%2B-007acc">
  <img alt="sem rede" src="https://img.shields.io/badge/telemetria-nenhuma-success">
</p>

**Claude Usage Status Bar** mostra, na barra de status do VS Code ou do Antigravity, o uso da sessão atual do **Claude Code**: tempo decorrido, tokens de contexto, **limites de 5h e 7d da assinatura**, custo estimado e duração do turno. Ao clicar, abre um painel lateral com barras de progresso.

> 🇬🇧 **English:** VS Code / Antigravity extension that shows the current Claude Code session in the status bar — elapsed time, context tokens, 5-hour / 7-day subscription limits, estimated cost and last-turn duration, plus a sidebar panel with progress bars. The 5h/7d limits are optional and come from the shared snapshot of the `claude-usage-meter` extension. It only reads local transcripts in `~/.claude/projects`: no network access, no telemetry. Download the `.vsix` from [Releases](https://github.com/AlessandroLobo/claude-usage-statusbar/releases) and use *Extensions: Install from VSIX…*. Cost is an estimate based on public API prices, not your actual bill. Unofficial project, not affiliated with Anthropic.

## Como fica

<p align="center">
  <img src="docs/statusbar-real.png" alt="Barra de status com o uso da sessão (captura real no Antigravity)" width="520">
</p>

Passe o mouse para ver os detalhes (modelo, contexto exato, custo e totais de tokens):

<p align="center">
  <img src="docs/tooltip-0.2.png" alt="Tooltip com detalhes da sessão" width="760">
</p>

O clique no item abre o painel **Claude Usage** no Explorer, com barras para a sessão de 5h, a semana e o contexto:

<p align="center">
  <img src="docs/panel-0.3.png" alt="Painel lateral com barras de uso" width="340">
</p>

Na barra, os limites de **5h** e **7d** são itens separados, cada um com **cor própria** (azul e roxo por padrão), para você achar um e outro de relance:

<p align="center">
  <img src="docs/cores-0.3.png" alt="Limites de 5h e 7d em cores diferentes" width="760">
</p>

Quando o contexto passa de **80%** (ou algum limite passa de **90%**), o item ganha fundo de aviso, para você compactar ou abrir uma nova sessão antes de estourar a janela:

<p align="center">
  <img src="docs/warning-0.2.png" alt="Aviso de contexto acima de 80%" width="760">
</p>

> A primeira imagem é uma captura real no Antigravity; o tooltip, o painel e o aviso são ilustrações do visual. As cores seguem o tema do seu editor.

## O que cada campo significa

| Campo | Significado |
| --- | --- |
| 🕒 `8m` | Tempo desde o início da sessão |
| `65k/1M (6%)` | Tokens de contexto da última resposta / janela do modelo |
| `5h 12% ↻4h18` | Uso do limite de 5 horas e tempo até reiniciar |
| `7d 49% ↻2h28` | Uso do limite semanal e tempo até reiniciar |
| `US$ 0.19` | Custo **estimado** da sessão, somando subagentes |
| `turno 0:10` | Duração do último turno; `▶` enquanto o turno está em andamento |

### De onde vêm os limites de 5h/7d

Eles **não** são calculados pela extensão: vêm do snapshot compartilhado `~/.claude-usage-meter/usage-snapshot.json`, mantido pela extensão [Claude Usage Meter](https://marketplace.visualstudio.com/items?itemName=shivakrishnakokkula.claude-usage-meter) (que consulta a API da Anthropic). Esta extensão só **lê o arquivo** — não faz chamadas de rede e não toca em credenciais. Sem a `claude-usage-meter`, tudo continua funcionando, apenas sem os campos 5h/7d. Leituras com mais de 10 minutos aparecem com a idade (`5h 14% ↻4h09 (há 16m)`); com mais de 30 minutos (configurável) e janelas já reiniciadas não são exibidas, para nunca mostrar um número velho como se fosse atual.

## Instalação

1. Baixe o `.vsix` mais recente em [Releases](https://github.com/AlessandroLobo/claude-usage-statusbar/releases).
2. No editor: `Ctrl+Shift+P` → **Extensions: Install from VSIX…** → escolha o arquivo.
3. `Ctrl+Shift+P` → **Developer: Reload Window**.

Pela linha de comando (Windows), com o `.vsix` na pasta, o script instala no Antigravity e no VS Code que encontrar:

```powershell
powershell -ExecutionPolicy Bypass -File .\Instalar.ps1
```

### Instalar ou atualizar com um comando

Cada Release traz também o arquivo `claude-usage-statusbar.vsix` (sem número de versão), então o link abaixo sempre baixa a versão mais recente. **O mesmo comando serve para instalar e para atualizar.**

PowerShell (Windows):

```powershell
iwr https://github.com/AlessandroLobo/claude-usage-statusbar/releases/latest/download/claude-usage-statusbar.vsix -OutFile $env:TEMP\claude-usage-statusbar.vsix
antigravity-ide --install-extension $env:TEMP\claude-usage-statusbar.vsix --force
```

Bash (Linux/macOS):

```bash
curl -L -o /tmp/claude-usage-statusbar.vsix https://github.com/AlessandroLobo/claude-usage-statusbar/releases/latest/download/claude-usage-statusbar.vsix
antigravity-ide --install-extension /tmp/claude-usage-statusbar.vsix --force
```

No VS Code, troque `antigravity-ide` por `code` (no Antigravity, o comando também pode ser `antigravity`). Depois, *Developer: Reload Window*.

A extensão não se atualiza sozinha quando instalada por `.vsix`: para receber uma versão nova, repita o comando.

> A extensão oficial do Claude Code para o editor não desenha barras de plugin (`AbovePrompt`/`ui_render`); por isso esta extensão lê o transcript da sessão em vez de depender do plugin.

## Atualização

| Como você instalou | Como atualizar |
| --- | --- |
| `.vsix` (Releases) | **Manual:** rode de novo o comando de [instalar ou atualizar](#instalar-ou-atualizar-com-um-comando) e use *Developer: Reload Window*. O editor não avisa que há versão nova — acompanhe a página de [Releases](https://github.com/AlessandroLobo/claude-usage-statusbar/releases) (botão *Watch → Custom → Releases* avisa por e-mail). |
| Open VSX / Marketplace (quando publicada lá) | **Automática:** o editor atualiza sozinho ou em *Extensões → Atualizar*. |

As configurações `claudeUsageBar.*` são mantidas na atualização.

## Como funciona

A cada 5 segundos, a extensão localiza o transcript mais recente em `~/.claude/projects/<pasta-aberta>/*.jsonl` (respeita `CLAUDE_CONFIG_DIR`) e lê **apenas o trecho acrescentado** desde a última leitura. Contexto, tempo e turno vêm dos registros da sessão; os limites 5h/7d vêm do snapshot da `claude-usage-meter`; o custo é calculado pelos `usage` de cada resposta e a tabela de preços abaixo, incluindo os transcripts de subagentes. Mensagens repetidas no arquivo (mesmo `id`) são contadas uma vez.

Sem dependências, sem rede, sem telemetria.

## Comandos

| Comando | Ação |
| --- | --- |
| `Claude Usage: Abrir painel de uso` | Foca o painel lateral (também ao clicar no item da barra) |
| `Claude Usage: Atualizar agora` | Força a atualização |
| `Claude Usage: Mostrar/ocultar barra` | Alterna a visibilidade |

## Configurações

| Chave | Padrão | Descrição |
| --- | --- | --- |
| `claudeUsageBar.contextWindow` | `0` | Janela de contexto em tokens. `0` = automático pelo modelo |
| `claudeUsageBar.refreshSeconds` | `5` | Intervalo de atualização |
| `claudeUsageBar.showCost` | `true` | Mostra o custo estimado |
| `claudeUsageBar.showTurn` | `true` | Mostra a duração do turno |
| `claudeUsageBar.showSessionTime` | `true` | Mostra o tempo da sessão |
| `claudeUsageBar.showLimits` | `true` | Mostra os limites 5h/7d na barra |
| `claudeUsageBar.colorSession5h` | `#4fc1ff` | Cor do limite de 5h (hexadecimal ou id de cor do tema, ex.: `charts.blue`; vazio = cor padrão da barra) |
| `claudeUsageBar.colorWeekly7d` | `#c586c0` | Cor do limite de 7d (idem) |
| `claudeUsageBar.limitsStaleMinutes` | `30` | Idade máxima da leitura dos limites; acima de 10 min ela aparece com a idade (`há 16m`) |
| `claudeUsageBar.limitsSnapshotPath` | `""` | Caminho do snapshot (vazio = `~/.claude-usage-meter/usage-snapshot.json`) |

## Preços usados no custo (US$ por 1M de tokens)

| Modelo | Entrada | Saída |
| --- | --- | --- |
| Fable / Mythos | 10 | 50 |
| Opus 5.5 | 4 | 20 |
| Opus 5 / 4.8 / 4.7 / 4.6 | 5 | 25 |
| Sonnet 5.5 / 5 | 2 | 10 |
| Sonnet 4.6 | 3 | 15 |
| Haiku 5.5 | 0,10 (0,50 acima de 100K de prompt) | 0,50 (2,50 acima de 100K) |
| Haiku 4.5 | 1 | 5 |

Cache: leitura a 0,1× da entrada (Opus 5.5: 0,05×; Fable: 0,025×); escrita a 1,25× (5 min) e 2× (1 h). A tabela fica em `core.js` (`PRICES`) — atualize quando os preços mudarem. É uma **estimativa**: não substitui sua fatura.

## Desenvolvimento

```powershell
node test.js                                                   # testes da lógica pura
npx --yes @vscode/vsce package                                 # gera o .vsix
```

A lógica (leitura incremental, custo, formatação) está em `core.js`, sem dependência do VS Code; `extension.js` só cria o item da barra. ### Publicar uma versão nova

1. Aumente `version` no `package.json` (sem aumentar, o editor não reconhece como atualização) e **não mude** `publisher`/`name`, que formam o ID da extensão.
2. `git add -A && git commit -m "feat: ..." && git push`
3. `git tag vX.Y.Z && git push origin vX.Y.Z` — o workflow `release.yml` roda o teste, gera o `.vsix` e cria o Release com `claude-usage-statusbar-X.Y.Z.vsix` e `claude-usage-statusbar.vsix` (nome fixo usado pelo comando de instalação).
4. Avise quem instalou por `.vsix` para repetir o comando de atualização.

## Privacidade e aviso

A extensão só lê arquivos locais (`~/.claude` e o snapshot da `claude-usage-meter`); não envia nada para lugar nenhum. Projeto não oficial, sem vínculo com a Anthropic. Licença [MIT](LICENSE).
