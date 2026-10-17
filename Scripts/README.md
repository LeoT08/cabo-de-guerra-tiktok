# Cabo de Guerra Presidencial — TikTok LIVE

Jogo 2D vertical (720x1600, proporção de celular ~400x900) de **paródia / entretenimento fictício**: duas equipes de figuras públicas brasileiras disputam um cabo de guerra decidido pelos comentários e presentes de uma live do TikTok (ou pelo painel admin, em modo DEMO). **Não é pesquisa eleitoral, enquete ou previsão de resultado de eleição** — não há percentuais de intenção de voto, logos oficiais de campanha ou falas atribuídas às pessoas retratadas. Os personagens são avatares ilustrados estilizados, com nome visível e retrato substituível.

Time Azul: Flávio Bolsonaro, Nikolas Ferreira, Michele Bolsonaro.
Time Vermelho: Lula, Fernando Haddad, Janja.

## Status nesta entrega (o que está FUNCIONANDO e TESTADO)

- ✅ Jogo local completo (DEMO) rodando sem conta TikTok, com física, rounds, placar, vitória, empate e reinício automático.
- ✅ Servidor Node/TypeScript como fonte única de verdade (física, regras, rounds, persistência, dedupe, rate limit) — **30/30 testes automatizados passando** (`npm test` em `server/`).
- ✅ Build de produção do servidor (`tsc`) e do cliente (`vite build`) concluem sem erro.
- ✅ Cliente Phaser 3 (720x1600) renderizando cena, personagens, indicador de deslocamento, overlay de eventos, partículas de presente, banner de superforça e tela de vitória — **validado visualmente via screenshots automatizados** (Playwright, usado apenas para QA e removido das dependências finais).
- ✅ Painel administrativo separado (`admin.html`), com controles de round, simulação de comentários/presentes/carga, configuração e log de eventos em tempo real — testado manualmente via API (start/pause/reset, simulação, config).
- ✅ Fluxo completo testado ponta a ponta via API real: iniciar round → comentários movem a corda → vitória por limite → placar incrementado → tela de vitória → intervalo → reinício automático do round 2 → placar mantido → persistência em `server/data/state.json` confirmada em disco.
- ✅ Arte dos personagens integrada (`game/public/assets/characters/`): 6 ilustrações por personagem (4 poses de "puxando" ciclando durante o round, idle, retrato, vitória, derrota) sobre um cenário panorâmico de Brasília (`game/public/assets/background/`). Arquivos `expressao_0X.png` fornecidos foram **descartados** (rosto cortado/duplicado nas bordas da prancha original) — qualquer uso de rosto usa `retrato_01.png`, que está limpo. Os recortes de `02_Elementos`/`03_Interface` (torcida, cronômetro, efeitos) não foram usados: são folhas de referência com legenda e fundo sólido, não assets isolados — o indicador de força, a corda e as partículas continuam vetoriais (já testados).
- ✅ Presente sem time definido não gera vantagem indevida (`pendingGiftCount` incrementado, sem impulso) — testado e confirmado.
- ✅ Reconexão do WebSocket local com backoff e aviso visual "SEM CONEXÃO" sem travar o jogo.

## O que está PENDENTE (depende de autorização/acesso a uma LIVE real)

- ⏳ **Conexão real com uma transmissão do TikTok**: a ponte (`server/src/tiktokBridge.ts`) usa a biblioteca não oficial `tiktok-live-connector` e só pode ser validada contra uma LIVE de verdade já no ar, com uma conta autorizada pelo operador. Isso não foi (e não poderia ser, nesta sessão) testado contra o TikTok real. **Não declare a integração real concluída até ver o status `CONNECTED` no painel e eventos reais aparecendo no log.**
- ⏳ **IDs reais de presentes**: os valores em `server/src/config.ts` (`placeholder_rosa`, `placeholder_medio`, `placeholder_especial`) são placeholders. Após conectar numa LIVE real, observe os `giftId` reais no log do painel e atualize o mapeamento na seção "Configuração".
- ⏳ **Políticas da plataforma**: presentes, conteúdo "político" e elegibilidade de monetização variam por conta/categoria no TikTok. Se presentes não forem permitidos, desative-os no painel (`Presentes ativados`) — o jogo continua funcionando só com comentários.

## Decisões técnicas registradas

- **Persistência em JSON** (não SQLite): evita dependência nativa (`better-sqlite3`/node-gyp) que poderia travar o setup no Windows hoje. Escrita atômica (arquivo temporário + rename) em `server/data/state.json`.
- **Servidor como fonte única de verdade**: toda física/regras rodam no Node (`GameEngine`); o cliente Phaser é um renderizador fino que recebe snapshots via WebSocket (~20Hz) e nunca decide vitória sozinho. Isso também centraliza a integração com TikTok e o painel admin no mesmo processo.
- **Admin em página separada** (`admin.html`), nunca capturada no OBS — comunica com o servidor por HTTP (polling de 1,5s), não pelo WebSocket do jogo.
- **Arte dos personagens**: ilustrações fornecidas pelo usuário (`Downloads/personagens_cabo_de_guerra_individuais` e `Downloads/cenarios_cabo_de_guerra`), copiadas para `game/public/assets/`. São recortes de pranchas em baixa resolução (personagens ~145-170px, fundo ~1125x273px) — ficam nítidos no tamanho usado hoje na cena, mas o fundo precisou de upscale (~2,2x) para cobrir a faixa atrás dos personagens, então fica um pouco mais suave que os personagens em si. Para uma versão mais nítida no futuro, gerar/exportar os mesmos elementos em resolução maior. Som continua sintetizado via WebAudio (beep), sem depender de arquivos de áudio externos.
- **`tiktok-live-connector`** é dependência opcional (`optionalDependencies`) — se falhar ao instalar ou conectar, o sistema cai graciosamente para modo DEMO e informa o motivo exato no log/painel, nunca inventa eventos.
- Vulnerabilidades reportadas por `npm audit` no servidor (6, incl. 2 "critical") vêm de **ferramentas de desenvolvimento** (`vitest`/`vite`/`esbuild`, usadas só para rodar testes localmente), não do runtime de produção (`npm run build && npm run start`). Corrigir exigiria subir `vitest` para a v5 (breaking change) — não fiz isso hoje para não arriscar quebrar a suíte de testes na entrega; considerar depois com calma.

## Estrutura

```
server/   # Node+TS: física, rounds, API admin (HTTP), WebSocket do jogo, ponte TikTok, persistência
game/     # Vite+TS+Phaser: cena do jogo (index.html) e painel admin (admin.html)
docs/     # Guia de captura OBS/TikTok LIVE Studio
```

## Como rodar

### Caminho rápido (Windows)
Dê duplo-clique em **`INICIAR_JOGO.bat`** na raiz do projeto. Ele instala dependências se necessário, sobe servidor + cliente e abre o navegador em `http://localhost:5173/index.html` (jogo) e `http://localhost:5173/admin.html` (painel).

### Manual
```powershell
# Terminal 1 — servidor (física/regras/API admin/ponte TikTok)
cd server
npm install
npm run dev          # http://localhost:8080 (API) + ws://localhost:8081 (jogo)

# Terminal 2 — cliente (jogo + painel)
cd game
npm install
npm run dev           # http://localhost:5173
```
Abra `http://localhost:5173/index.html` (cena para capturar no OBS) e `http://localhost:5173/admin.html` (painel, não capturar).

### Build de produção
```powershell
cd server && npm run build && npm run start   # serve a API/WS a partir de dist/
cd game && npm run build                      # gera game/dist (servir com qualquer static host)
```

### Testes
```powershell
cd server
npm test     # 30 testes: física, comandos, rate limit, dedupe, rounds, vitória/empate, presentes sem time
```

## Comandos de jogo (não são votos)
- Comentário **`13`** → impulso para o Time **Vermelho**.
- Comentário **`22`** → impulso para o Time **Azul**.
- Match exato (após trim/normalização de espaços); `113`, `130`, `22h` etc. não contam.

## Segurança e conformidade
- A ponte TikTok **nunca** pede ou armazena senha — ela apenas escuta eventos **públicos** de uma LIVE que o próprio operador já iniciou e autorizou.
- Nenhum bot de engajamento, nenhuma automação de login, nenhuma tentativa de contornar limites da plataforma.
- Participação é 100% gratuita via comentários; presentes são um bônus opcional e configurável, nunca obrigatório.
- Veja `docs/OBS_SETUP.md` para o checklist completo antes de transmitir.
