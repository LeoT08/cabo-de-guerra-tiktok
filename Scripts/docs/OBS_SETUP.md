# Captura no OBS Studio / TikTok LIVE Studio (Windows)

## 1. Suba o jogo
Rode `INICIAR_JOGO.bat` na raiz do projeto (ou siga os comandos manuais no README). Confirme que:
- O servidor abriu em `http://localhost:8080` (API admin) e `ws://localhost:8081` (WebSocket do jogo).
- O cliente abriu em `http://localhost:5173/index.html` (cena do jogo) e `http://localhost:5173/admin.html` (painel admin).

## 2. Configure a fonte de captura (Janela do navegador — recomendado)
1. Abra `http://localhost:5173/index.html` em uma janela de navegador dedicada (Chrome/Edge).
2. Redimensione a janela para proporção 9:16 (ex.: 540x960 ou 608x1080) — o jogo escala automaticamente (modo FIT), sem cortar textos.
3. No OBS: **Fontes → + → Captura de Janela** → selecione a janela do navegador com a cena do jogo.
4. Alternativa: **Captura de Navegador (Browser Source)** apontando para `http://localhost:5173/index.html`, largura 720 x altura 1600 (proporção do jogo, ~400x900 de celular) — evita bordas do navegador. Num canvas 1080x1920 (9:16) o jogo encaixa com faixas laterais finas; esticar a fonte para 1080x1920 distorce.

## 3. Configure a Cena (Canvas) 1080x1920
1. **Configurações → Vídeo**: Resolução base e de saída = `1080x1920`. FPS: 30 ou 60.
2. Ajuste a fonte do jogo para preencher toda a cena (Transformar → Ajustar à tela / Stretch to screen, ou redimensione manualmente mantendo proporção).
3. **NUNCA adicione o painel admin (`admin.html`) como fonte** — ele é só para o operador.

## 4. TikTok LIVE Studio
1. Abra a cena numa janela própria do Chrome, sem barras e com som liberado (sem isso o Chrome bloqueia a música de vitória até alguém clicar na página):
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173/index.html --window-size=450,1000 --autoplay-policy=no-user-gesture-required --user-data-dir=%TEMP%\cabo-cena
   ```
   (`--user-data-dir` separado faz a flag valer mesmo com outro Chrome aberto.) Alternativa: clique uma vez dentro da cena depois de abrir.
2. Crie uma fonte "Captura de Janela" com essa janela (ou "Link/Navegador" para `http://localhost:5173/index.html`, se a sua versão tiver).
3. Configure a resolução do projeto para vertical 1080x1920 e deixe o áudio do sistema/desktop ativo para o som do jogo entrar na LIVE.
4. Teste a prévia antes de ir ao ar.

**Música de vitória:** quando AZUL ou VERMELHO vence, toca uma das duas músicas do time (sorteada) de `game/public/assets/sounds/` (originais em `../Sons/`); ela some em fade quando o próximo round começa. Empate toca só o bipe. Para trocar uma música, substitua o `.mp3` com o mesmo nome.

## 5. Checklist antes de transmitir
- [ ] Áudio: teste o botão de mute (🔊/🔇) no canto superior esquerdo da cena.
- [ ] Resolução exibida sem cortes: título, ROUND, cronômetro, nomes dos times e instrução "Mande presente: …" visíveis.
- [ ] FPS estável (verifique no OBS: Estatísticas).
- [ ] CPU/GPU: feche abas/apps desnecessários antes de ir ao vivo.
- [ ] Rode um teste de 15 minutos em modo DEMO (painel admin → botões de simulação) observando:
  - Timer contando corretamente.
  - Eventos de overlay aparecendo e expirando.
  - Nenhum vazamento visual de memória (texto acumulando, partículas travando).
- [ ] Reconexão: feche e reabra o servidor com o jogo aberto — a cena deve mostrar "SEM CONEXÃO" e voltar sozinha ao reconectar, sem travar.
- [ ] Reinício automático: deixe um round terminar e confirme que o próximo começa sozinho após o intervalo configurado.

## 6. Modo REAL (TikTok LIVE de verdade)
1. No painel admin, aba "TikTok LIVE", informe o `@usuario` da conta que já está AO VIVO.
2. Clique em Conectar. O status "TikTok" no topo do painel deve mudar para `CONNECTED`.
3. **Não declare a LIVE real como ativa até ver `CONNECTED` e eventos reais chegando no log.**
4. Se cair, o sistema tenta reconectar sozinho (backoff exponencial) e o jogo permanece pausado/seguro — nenhum evento é inventado.
5. A Rosa já vem mapeada para AZUL. Para o VERMELHO, mande o presente escolhido uma vez: ele aparece em "Presentes → time / Recebidos e NÃO mapeados" no painel; clique em **→ VERMELHO**.

## 7. Operação prolongada
- O servidor salva placar/config em `server/data/state.json` a cada 10s e ao fim de cada round — pode reiniciar o processo sem perder histórico.
- Logs ficam em `server/data/events.log` (rotação manual: apague o arquivo se crescer demais).
- Não há garantia de operação 24h sem monitoramento: acompanhe o painel periodicamente e respeite os termos de uso da plataforma.
