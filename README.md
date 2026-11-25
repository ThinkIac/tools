# @thinkiac/module-tools

Capacidade tools do Lógos migrada para LogosType (`.type`). Mantém os contratos
existentes, sem acrescentar eventos ou alterar permissões.

```sh
npm install ThinkIac/tools#main
npm test
npm run test:isolated
```

Para composição reproduzível, fixe o commit em vez de `main`.

## Estrutura

- `src/*.type`: implementação mantida em LogosType.
- `dist/*.cjs`: artefatos compilados, incluídos na distribuição.
- `index.cjs`: entrada CommonJS compatível.
- `compat/`: wrappers públicos legados preservados para o SDK runtime-compat.
- `test/reference/`: fontes anteriores usados somente nos testes comparativos.
- `scripts/`: build e instalação isolada sem compilador no consumidor.

O registro declarativo `@register module` usa o contexto capability do Lógos.
`createHost` vem de `@thinkiac/module-runtime-compat`, fixado por commit.
`createRuntimeModule` permanece como alias de biblioteca para consumidores atuais.
O compilador [LogosType](https://github.com/ThinkIac/LogosType) é dependência de
build. Carregar o pacote distribuído não exige o compilador.

## Ferramentas

`provideTools(host)` instala o módulo na fase `wire`. A API oferece
`loadMcpTools(workspace)` e `kernelTools()`. `tools-bridge.cjs` expõe
`createBridge(host)`; `legacy-tools.cjs` expõe `createRuntime(bridge)` para usos
já existentes.

A validação de pacotes exige schema JSON de objeto com `properties` e, quando
presente, `required` em array. Confere a autoridade `tools/provide` antes da
ativação. O staging verifica `runtime.stability.tools` (`all` ou nomes vitais).

```text
Descoberta ou runner isolado
  → autorização de exposição/provisão
  → wrapper MCP
  → autorização de chamada e condições
  → veto tool_before
  → middlewares no principal do pacote
  → handler
  → tool_after e resultado
```

Um veto preserva `code`, `blockedBy` e `details`; sem código específico usa
`TOOL_BLOCKED`. O evento inclui `sessionId` do contexto. Erro do handler é
propagado; como no original, não é emitido `tool_after` nessa falha.
O transporte `tool:call` converte erros em `{success:false,error}` e valida
os campos `package` e `tool`. Runners isolados têm preferência sobre scanner.

As seis ferramentas de operação preservadas são `runtime_commit`,
`runtime_activate_package`, `runtime_package_diagnostics`,
`runtime_reboot_impact`, `runtime_status` e `runtime_manifest`.

```js
const { createRuntime } = require('@thinkiac/module-tools/legacy-tools.cjs');
// bridge é fornecida pelo host autorizado, não por dados do usuário.
const api = createRuntime(bridge);
const tools = await api.loadMcpTools(container, '/workspace/clientes');
const result = await tools[0].handler({ ID: 1 }, { sessionId: 'session' });
```

## Limites e ciclo de vida

Usa `node:path` para resolver o proprietário de um arquivo, incluindo pacotes
aninhados. Acesso ao scanner, autoridade e middleware é mediado pelo host.
Listeners pertencem ao ciclo e aos scopes do host; não há servidor próprio.
Esta migração não demonstra execução em QuickJS/ESP32.

## Validação

A CI executa build, testes de comportamento e instalação isolada em Node 18,
20 e 22. Testes comparam respostas, falhas e eventos com os fontes anteriores.
Isso comprova os casos exercitados, não equivalência para toda entrada possível.
