# PROMPT MESTRE — CABO DE GUERRA PRESIDENCIAL PARA TIKTOK LIVE

Você é um engenheiro de software sênior, game designer e especialista em aplicações de streaming. Implemente um projeto completo, executável no Windows, chamado **Cabo de Guerra Presidencial**. A prioridade absoluta é colocar uma versão jogável e transmissível em funcionamento HOJE. Não entregue apenas um plano, wireframe, pseudocódigo ou documentação: crie os arquivos, instale dependências quando possível, execute testes e deixe comandos claros para iniciar.

## Objetivo
Jogo 2D vertical 1080x1920 (9:16), para captura pelo TikTok LIVE Studio ou OBS, com duas equipes de figuras públicas brasileiras em disputa humorística fictícia de cabo de guerra. Azul: Flávio Bolsonaro, Nikolas Ferreira e a michele bolsonaro (não inventar quem é). Vermelho: Lula, Fernando Haddad e Janja. A identidade deve ser explicitamente **paródia / entretenimento**, nunca uma enquete, eleição oficial ou previsão de resultado eleitoral. Não exibir percentuais como intenção de voto. Evitar logos oficiais de campanhas, acusações inventadas ou falas atribuídas a essas pessoas. Se não houver imagens legalmente utilizáveis, usar avatares originais estilizados, com nomes visíveis e retratos substituíveis. Não travar o MVP por falta de assets.

## Entrega hoje: ordem de execução obrigatória
1. Primeiro implementar jogo LOCAL completo com controles de simulação e arte vetorial ou sprites originais. Deve rodar sem conta TikTok.
2. Depois criar ponte de eventos TikTok, como serviço separado e opcional. Se integração real não estiver disponível, manter modo demo funcional e informar precisamente o bloqueio.
3. Finalmente preparar captura pelo OBS/LIVE Studio, configuração 1080x1920 e instruções de operação no Windows.
4. Nunca alegar que uma LIVE real está ativa sem teste de transmissão bem-sucedido e acesso autorizado da conta.

## Stack e estrutura
Preferir Vite + TypeScript + Phaser 3 para jogo; Node.js + TypeScript para serviço de eventos; WebSocket local para transportar eventos ao jogo; armazenamento local persistente em JSON ou SQLite para resultados, configuração e logs. Manter componentes separados (game, physics, rounds, teams, powers, event-bridge, admin, persistence). Se a stack escolhida causar impedimento, adotar a alternativa mais rápida e estável e explicar no README. Não exigir serviços pagos ou chaves externas para rodar em demo.

## Visual
- Interface vertical legível em celulares: título compacto, ROUND N, cronômetro MM:SS, placar acumulado de vitórias, identificação dos times e instrução de comentários.
- Cena central ocupa a maior área: 3 personagens por equipe puxando a mesma corda, marca central e limites de vitória bem claros. Personagens animam esforço, inclinação, escorregão, queda e comemoração. Personagens da esquerda em azul e direita em vermelho; não criar propaganda política.
- Indicador de deslocamento e barra de força; mostrar claramente a vantagem de cada lado, mas sem confundir força no jogo com dados eleitorais.
- Overlay discreto de eventos: `@usuario ajudou AZUL +10`, `@usuario ativou SUPERFORÇA`, com fila e duração curta.
- Efeitos visuais de impacto e som com opção de mute, sem luzes estroboscópicas intensas.
- Animações suaves, layout responsivo em 9:16, sem cortar textos na captura. Preparar fallback visual sem imagens externas.
- Tela de vitória de 10 a 15 segundos e reinício automático.

## Regras do jogo
- Round de 300 segundos por padrão, configurável por painel local; intervalo padrão 15 segundos.
- Posição normalizada da corda em [-100, +100]; -100 é vitória azul e +100 é vitória vermelha. O centro é zero.
- `13` apoia vermelho e `22` apoia azul. São **comandos de jogo**, não votos eleitorais. Identificar comandos exatos, não substrings (ex.: `113` não conta como `13`). Normalizar espaços e caixa.
- Cada comentário válido produz +10 de impulso a favor do time, sujeito a cooldown por usuário de 2 segundos e teto por janela para prevenir spam. Os números devem ser configuráveis.
- Aplicar física por impulso e velocidade amortecida, interpolação suave, limite de velocidade e resistência. O deslocamento não pode teletransportar a corda.
- Ao chegar a um limite, terminar imediatamente com vitória e animação. Ao fim dos 300 segundos, vence o time cujo lado possui vantagem; empate técnico dentro de tolerância configurável resulta em empate e reinício.
- Reiniciar posição, efeitos temporários e cronômetro sem apagar histórico de vitórias. Salvar estado de cada round e placar acumulado.
- Sem público: o jogo continua com animação ambiente, mas não inventar interações ou usuários; não gerar vencedores falsos. Se não houver movimento, terminar em empate.
- Eventos duplicados não podem contar duas vezes; usar IDs de evento quando fornecidos e proteção por janela temporal.

## Presentes e curtidas
- Um usuário escolhe time comentando 13 ou 22; associar userId ao time durante o round, podendo alterar mediante novo comentário válido. Se o presente chegar sem time definido, não atribuir arbitrariamente: mostrar pendência ou ignorar segundo configuração.
- Rosa: impulso +50 e efeito visual de partículas. Presente médio: +200. Presente especial: superforça de 10 segundos, com multiplicador configurável e animação própria. NÃO assumir que valores, nomes ou IDs de presentes são universais: mapear IDs reais no painel após observar eventos reais da plataforma.
- Presentes em sequência/combo: contabilizar corretamente sem multiplicação indevida.
- Curtidas: se disponíveis com identificação e associação confiável de usuário/time, adicionar impulso pequeno com rate limit; se não, desativar essa mecânica sem quebrar o jogo.
- **Nenhum pagamento é necessário para participar**. Evitar mecânicas de vantagem financeira desproporcional; tornar todos os poderes configuráveis e oferecer equivalentes gratuitos por comentários.
- Respeitar políticas do TikTok para conteúdo político, presentes, publicidade e elegibilidade. Se presentes não forem permitidos para a categoria/conta, desativá-los e operar só com interações gratuitas.

## Painel administrativo local
Criar painel separado, não capturado na transmissão, com:
- start/pause/reset round, modo DEMO/REAL, estado de conexão;
- botões de simulação: comentário 13, comentário 22, rosa azul/vermelho, presente médio, especial, 100 interações de carga;
- configurar duração, intervalo, força, cooldown, velocidade, amortecimento, efeitos, sons, nomes dos personagens e placar;
- mostrar log de eventos e erros sem dados sensíveis;
- persistir configurações e placares entre reinícios;
- opção de zerar o histórico com confirmação.

## Integração com TikTok LIVE
Criar `event-bridge` modular. Pesquisar e escolher integração atual compatível com TikTok LIVE, de preferência oficial se disponível. Caso use biblioteca não oficial, documentar risco de instabilidade e mudanças da plataforma. NÃO solicitar senha da conta nem automatizar login com credenciais em texto puro. Não usar bots para inflar seguidores, visualizações ou engajamento. Não tentar contornar restrições de LIVE.
- Detectar live conectada/desconectada, reconectar com backoff exponencial, atualizar status na interface.
- Traduzir eventos reais em formato interno normalizado `{eventId, type, userId, nickname, team, giftId, repeatCount, timestamp}`.
- Validar payload, sanitizar nickname, aplicar deduplicação, rate limit e logs.
- Ao cair conexão, manter o jogo em modo seguro; não inventar eventos. Alertar visualmente no painel.
- Incluir arquivo `.env.example` e documentação da configuração sem expor segredos.

## Operação e transmissão
- Preparar comandos `npm install`, `npm run dev`, `npm run build`, `npm run start` (ou equivalentes) e script `INICIAR_JOGO.bat` para Windows.
- Documentar como abrir a URL do jogo em janela dedicada e capturá-la em cena vertical 1080x1920 do OBS ou TikTok LIVE Studio.
- Incluir checklist de áudio, resolução, FPS, visibilidade do texto, CPU/GPU, teste de 15 minutos, reconexão e reinício.
- Suportar funcionamento prolongado com limpeza de timers/listeners, limitação de partículas e logs, persistência e tratamento de erros. Não prometer 24h sem monitoramento e sem verificar as regras da plataforma.
- Preparar um modo de teste em que os comandos simulados chegam pela mesma camada de eventos usada no modo real.

## Testes obrigatórios
1. Comentários 13 e 22 movem a corda para os lados corretos.
2. Comentário inválido e spam não geram força.
3. Física é suave e limitada.
4. Vitória por limite, por cronômetro e empate.
5. Reinício automático após 15 segundos e placar persistente.
6. Presentes sem time associado não causam vantagem indevida.
7. Desconexão do TikTok não derruba o jogo.
8. Layout 9:16 não corta cronômetro, personagens ou instruções.
9. Demo funciona integralmente sem TikTok e sem credenciais.
10. Build de produção conclui sem erro.

## Critérios de aceite e resposta final
- Entregar o repositório executável com arquivos completos, sem TODOs que bloqueiem o MVP.
- Mostrar caminhos e comandos exatos de inicialização.
- Explicar o que está FUNCIONANDO E TESTADO e o que está PENDENTE de autorização/acesso à LIVE.
- Não declarar concluída a integração real sem demonstrar que recebe eventos de uma transmissão real.
- Se houver tempo limitado, priorizar primeiro o loop jogável e a transmissão de imagem; melhorias artísticas vêm depois.
- Trabalhar de forma autônoma, tomando decisões técnicas razoáveis e registrando-as no README, sem parar por escolhas cosméticas.

**COMECE AGORA A CRIAR O PROJETO, IMPLEMENTAR O MVP E EXECUTAR OS TESTES. NÃO RESPONDA APENAS COM UM PLANO.**
