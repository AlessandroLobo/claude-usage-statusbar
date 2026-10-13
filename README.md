<p align="center">
  <img src="docs/banner-0.6.png" alt="Claude Usage Status Bar" width="100%">
</p>

<p align="center">
  <img alt="versão" src="https://img.shields.io/badge/vers%C3%A3o-0.7.0-e69875">
  <img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-1.82%2B-7fbbb3">
  <img alt="Antigravity" src="https://img.shields.io/badge/Antigravity-suportado-a7c080">
  <img alt="licença" src="https://img.shields.io/badge/licen%C3%A7a-MIT-dbbc7f">
  <img alt="telemetria" src="https://img.shields.io/badge/telemetria-nenhuma-83c092">
</p>

**Claude Usage Status Bar** é uma extensão para **VS Code** e **Antigravity** que mostra, na barra de status, o uso da sessão atual do **Claude Code**: tempo decorrido, tokens de contexto, **limites de 5h e 7d da assinatura**, custo estimado e duração do turno. Um clique abre um painel lateral com barras de progresso. As cores seguem o **tema do editor**.

> 🇬🇧 **English:** Extension for **VS Code 1.82+** and **Antigravity** that shows the current Claude Code session in the status bar — elapsed time, context tokens, 5-hour / 7-day subscription limits, estimated cost and last-turn duration — plus a sidebar panel with progress bars. Colors follow your editor theme. It reads local transcripts in `~/.claude/projects`. The 5h/7d limits come from Anthropic's (undocumented) usage endpoint, queried only after you allow it on first run: the extension then reads Claude Code's OAuth token (credentials file, or the Keychain on macOS) and polls about once a minute while Claude is in use (every 5 minutes when idle), once per machine, shared across windows and editors. No telemetry. Download the `.vsix` from [Releases](https://github.com/AlessandroLobo/claude-usage-statusbar/releases). Cost is an estimate based on public API prices, not your actual bill. Unofficial project, not affiliated with Anthropic.

## Compatibilidade

| Editor | Situação |
| --- | --- |
| **VS Code 1.82 ou mais novo** | ✅ Suportado |
| **Antigravity** | ✅ Suportado (onde a extensão é usada no dia a dia) |
| Cursor, Windsurf, VSCodium | Devem funcionar (mesma base do VS Code), sem teste |
| VS Code anterior ao 1.82 | ❌ O editor recusa a instalação |

| Sistema | Situação |
| --- | --- |
| Windows | ✅ Testado |
| Linux | Deve funcionar (mesmos caminhos do Windows), sem teste |
| macOS | Deve funcionar; o token é lido do **Keychain**, onde o Claude Code o guarda no Mac. Sem teste |

**Requisito:** o **Claude Code** instalado e com login feito (CLI ou extensão). A extensão lê o que ele grava em `~/.claude`.

## Como fica

<p align="center">
  <img src="docs/cores-0.4.png" alt="Barra de status: limites de 5h e 7d em cores diferentes e estados de alerta" width="760">
</p>

A barra tem quatro itens, sempre juntos: **tempo e contexto**, **5h**, **7d** e **custo e turno**. Os limites de 5h e 7d têm cor própria para você achar um e outro de relance, e as cores mudam quando algo se aproxima do limite (veja [Cores](#cores)).

Passe o mouse para ver os detalhes (modelo, contexto exato, custo, totais de tokens e limites):

<p align="center">
  <img src="docs/tooltip-0.4.png" alt="Tooltip com detalhes da sessão" width="760">
</p>

O clique abre o painel **Claude Usage** no Explorer, com barras para a sessão de 5h, a semana e o contexto:

<p align="center">
  <img src="docs/panel-0.4.png" alt="Painel lateral com barras de uso" width="340">
</p>

Captura real no Antigravity (versão anterior às cores próprias de 5h/7d):

<p align="center">
  <img src="docs/statusbar-real.png" alt="Captura real da barra de status no Antigravity" width="520">
</p>

> As três primeiras imagens são ilustrações no tema Everforest; no seu editor, as cores vêm do tema que você usa.

## O que cada campo significa

| Campo | Significado |
| --- | --- |
| 🕒 `23m` | Tempo desde o início da sessão |
| `239k/1M (24%)` | Tokens de contexto da última resposta / janela do modelo |
| `5h 14% ↻4h09` | Uso do limite de 5 horas e tempo até reiniciar |
| `7d 50% ↻2h19` | Uso do limite semanal e tempo até reiniciar |
| `(há 16m)` | Aparece quando a leitura dos limites tem mais de 10 minutos |
| `US$ 3.94` | Custo **estimado** da sessão, somando subagentes |
| `turno 0:09` | Duração do último turno; `▶` enquanto o turno está em andamento |

## Cores

As cores padrão vêm das cores `charts.*` do **tema ativo**: a barra e o painel se ajustam sozinhos quando você troca de tema, no VS Code ou no Antigravity.

| Item | Quando | Cor do tema | VS Code (tema padrão 2026 Dark) | Everforest escuro |
| --- | --- | --- | --- | --- |
| Limite **5h** | normal | `charts.blue` | `#57a3f8` | `#7fbbb3` |
| Limite **7d** | normal | `charts.yellow` | `#e0b97f` | `#dbbc7f` |
| Contexto | a partir de **80%** | `charts.orange` | `#cd861a` | `#e69875` |
| Limite 5h ou 7d | a partir de **90%** | `charts.red` | `#ef8773` | `#e67e80` |
| Barra de contexto no painel | abaixo de 50% | `charts.green` | `#86cf86` | `#a7c080` |

Em alerta, o item também recebe o fundo de aviso do tema (`statusBarItem.warningBackground`), quando o tema define um diferente da barra.

Para trocar as cores de 5h e 7d, use `claudeUsageBar.colorSession5h` e `claudeUsageBar.colorWeekly7d` com um id de cor do tema (`charts.green`, `charts.purple`, …) ou um hexadecimal (`#7fbbb3`). Deixe vazio para usar a cor padrão da barra.

## Instalação

### 1. Instalar a extensão

**Pelo editor (VS Code ou Antigravity):**

1. Baixe o `.vsix` mais recente em [Releases](https://github.com/AlessandroLobo/claude-usage-statusbar/releases).
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX…** → escolha o arquivo.
3. `Ctrl+Shift+P` → **Developer: Reload Window**.

**Por linha de comando** — o mesmo comando instala e atualiza, e sempre baixa a versão mais recente:

| Editor | Windows (PowerShell) |
| --- | --- |
| **VS Code** | `iwr https://github.com/AlessandroLobo/claude-usage-statusbar/releases/latest/download/claude-usage-statusbar.vsix -OutFile $env:TEMP\cub.vsix; code --install-extension $env:TEMP\cub.vsix --force` |
| **Antigravity** | `iwr https://github.com/AlessandroLobo/claude-usage-statusbar/releases/latest/download/claude-usage-statusbar.vsix -OutFile $env:TEMP\cub.vsix; antigravity-ide --install-extension $env:TEMP\cub.vsix --force` |

Linux/macOS (Bash):

```bash
curl -fL -o /tmp/cub.vsix https://github.com/AlessandroLobo/claude-usage-statusbar/releases/latest/download/claude-usage-statusbar.vsix \
  && code --install-extension /tmp/cub.vsix --force        # no Antigravity: antigravity-ide (ou antigravity)
```

Com o `.vsix` já baixado, no Windows, o script instala em **todos** os editores que encontrar (VS Code e Antigravity):

```powershell
powershell -ExecutionPolicy Bypass -File .\Instalar.ps1
```

Depois de instalar por linha de comando, use **Developer: Reload Window** no editor.

### 2. Ativar os limites de 5h/7d

Na primeira execução aparece o aviso abaixo. Clique em **Ativar**:

> *Claude Usage: mostrar os limites de 5h e 7d da sua assinatura? Para isso a extensão lê o token do Claude Code neste computador e consulta a API de uso da Anthropic (a cada minuto enquanto você usa o Claude). Nada é enviado a outro lugar.* — **Ativar** · **Agora não**

Se escolher *Agora não*, ative depois pelo comando **Claude Usage: Ativar limites 5h/7d** ou pelo link no painel. Sem essa autorização a extensão funciona (tempo, contexto, custo e turno), só não mostra os limites.

> A extensão oficial do Claude Code para o editor não desenha barras de plugin (`AbovePrompt`/`ui_render`); por isso esta extensão lê os dados da sessão diretamente em vez de depender de um plugin.

## De onde vêm os limites de 5h/7d

Depois da autorização, a própria extensão consulta a API de uso da Anthropic (`https://api.anthropic.com/api/oauth/usage`):

| | |
| --- | --- |
| **Token** | Lido de `~/.claude/.credentials.json` (Windows/Linux) ou do **Keychain** (macOS). Somente leitura: nunca é gravado, registrado nem enviado a outro destino que não a API da Anthropic. Token prestes a vencer não é usado — o Claude Code o renova sozinho. |
| **Frequência** | **Enquanto você usa o Claude**, a cada **1 min** (`claudeUsageBar.activeRefreshSeconds`, mínimo 30 s): a cada nova resposta do Claude depois da última leitura, os limites são consultados de novo, respeitando esse espaçamento. **Com o Claude parado**, a cada **5 min** (`claudeUsageBar.directRefreshMinutes`, mínimo 3). Sempre **uma consulta por computador**: as janelas abertas — inclusive VS Code e Antigravity ao mesmo tempo — dividem o resultado em `~/.claude-usage-statusbar/usage.json`, e uma trava garante que só uma delas consulte. Ao voltar para a janela, os números são conferidos na hora. |
| **Limitação da API** | Em HTTP 429 a extensão espera o `Retry-After` (ou recua sozinha, até 60 min) e continua mostrando a última leitura, com a idade. |
| **Idade** | Leituras com mais de 10 min aparecem com a idade (`5h 14% ↻4h09 (há 16m)`); com mais de 30 min (`limitsStaleMinutes`) ou janela já reiniciada, não são exibidas. |
| **Erros** | O painel mostra o último erro (token recusado, falha de rede, 429…). |

O endpoint **não é documentado** pela Anthropic: pode mudar sem aviso. Os limites podem ficar até cerca de 1 minuto atrás do painel de conta da extensão do Claude Code, que recebe os valores a cada resposta. Consultas mais frequentes não são recomendadas: o endpoint limita o número de chamadas, e um HTTP 429 deixaria os limites parados por até 60 min.

**Opcional:** se a extensão [Claude Usage Meter](https://open-vsx.org/extension/shivakrishnakokkula/claude-usage-meter) estiver instalada, a leitura dela também é aproveitada (vale a mais recente). Ela **não é necessária**.

## Atualização

| Como você instalou | Como atualizar |
| --- | --- |
| `.vsix` (Releases) | **Manual:** rode de novo o [comando de instalação](#1-instalar-a-extensão) do seu editor e use *Developer: Reload Window*. O editor não avisa que há versão nova — acompanhe a página de [Releases](https://github.com/AlessandroLobo/claude-usage-statusbar/releases) (*Watch → Custom → Releases* avisa por e-mail). |
| Open VSX / Marketplace (quando publicada lá) | **Automática:** o editor atualiza sozinho ou em *Extensões → Atualizar*. |

As configurações `claudeUsageBar.*` e a autorização dos limites são mantidas na atualização.

## Como funciona

A cada 5 segundos, a extensão localiza o transcript mais recente do Claude Code para a pasta aberta (`~/.claude/projects/<pasta>/*.jsonl`, respeitando `CLAUDE_CONFIG_DIR`) e lê **apenas o trecho acrescentado** desde a última leitura. Contexto, tempo e turno vêm dos registros da sessão; o custo é calculado pelos `usage` de cada resposta e a [tabela de preços](#preços-usados-no-custo-us-por-1m-de-tokens), incluindo os transcripts de subagentes. Mensagens repetidas no arquivo (mesmo `id`) são contadas uma vez. Os limites 5h/7d vêm da consulta descrita [acima](#de-onde-vêm-os-limites-de-5h7d).

Sem dependências e sem telemetria. Rede: só a consulta de uso à API da Anthropic, e só depois de autorizada.

## Comandos

| Comando | Ação |
| --- | --- |
| `Claude Usage: Abrir painel de uso` | Foca o painel lateral (também ao clicar em qualquer item da barra) |
| `Claude Usage: Ativar limites 5h/7d (consulta à API de uso)` | Autoriza a consulta dos limites (mesmo efeito do **Ativar** do aviso) |
| `Claude Usage: Atualizar agora` | Força a atualização |
| `Claude Usage: Mostrar/ocultar barra` | Alterna a visibilidade |

## Configurações

| Chave | Padrão | Descrição |
| --- | --- | --- |
| `claudeUsageBar.contextWindow` | `0` | Janela de contexto em tokens. `0` = automático pelo modelo |
| `claudeUsageBar.refreshSeconds` | `5` | Intervalo de atualização da barra |
| `claudeUsageBar.showCost` | `true` | Mostra o custo estimado |
| `claudeUsageBar.showTurn` | `true` | Mostra a duração do turno |
| `claudeUsageBar.showSessionTime` | `true` | Mostra o tempo da sessão |
| `claudeUsageBar.showLimits` | `true` | Mostra os limites 5h/7d na barra |
| `claudeUsageBar.colorSession5h` | `charts.blue` | Cor do limite de 5h (veja [Cores](#cores)) |
| `claudeUsageBar.colorWeekly7d` | `charts.yellow` | Cor do limite de 7d (veja [Cores](#cores)) |
| `claudeUsageBar.fetchLimitsDirectly` | `false` | Consulta dos limites à API de uso; ligada pelo **Ativar** do aviso |
| `claudeUsageBar.activeRefreshSeconds` | `60` | Espaçamento das consultas enquanto o Claude está em uso (mínimo 30) |
| `claudeUsageBar.directRefreshMinutes` | `5` | Intervalo das consultas com o Claude parado (mínimo 3) |
| `claudeUsageBar.limitsStaleMinutes` | `30` | Idade máxima da leitura dos limites; acima de 10 min ela aparece com a idade |
| `claudeUsageBar.refreshLimits` | `true` | Com a `claude-usage-meter` (opcional) ativa e a consulta direta desligada, pede a ela uma leitura nova após 6 min |
| `claudeUsageBar.limitsSnapshotPath` | `""` | Snapshot da `claude-usage-meter` opcional (vazio = `~/.claude-usage-meter/usage-snapshot.json`) |

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
node test.js                       # testes da lógica (sem VS Code)
npx --yes @vscode/vsce package     # gera o .vsix
```

`core.js` tem a lógica pura (leitura incremental, custo, formatação, painel); `direct.js`, a consulta compartilhada dos limites (trava, cache, credenciais); `extension.js` só cria os itens da barra, o painel e o aviso.

### Publicar uma versão nova

1. Aumente `version` no `package.json` (sem aumentar, o editor não reconhece como atualização) e **não mude** `publisher`/`name`, que formam o ID da extensão.
2. `git add -A && git commit -m "feat: ..." && git push`
3. `git tag vX.Y.Z && git push origin vX.Y.Z` — o workflow `release.yml` roda o teste, gera o `.vsix` e cria o Release com `claude-usage-statusbar-X.Y.Z.vsix` e `claude-usage-statusbar.vsix` (nome fixo usado pelo comando de instalação).
4. Avise quem instalou por `.vsix` para repetir o comando de atualização.

## Privacidade e aviso

A extensão lê arquivos locais (`~/.claude` e, se existir, o snapshot da `claude-usage-meter`). Depois que você autoriza, também lê o token do Claude Code e consulta a API de uso da Anthropic — nenhum outro destino, nenhuma telemetria. Sem a autorização, não usa a rede. Projeto não oficial, sem vínculo com a Anthropic. Licença [MIT](LICENSE).
