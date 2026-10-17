# tools/

Utilitário único usado para preparar a arte dos personagens: `remove_bg.mjs` remove o fundo
quase-branco/cinza das ilustrações (que vinham 100% opacas, sem transparência real). Não faz
parte do jogo em si.

Como decide o que remover (por pixel, via raycasting em 4 direções, sobre uma versão borrada
só para classificar — a cor final não muda): um pixel "claro e dessaturado" é removido de
verdade (fica transparente) se tiver alguma direção livre até sair da imagem; se estiver
cercado por personagem nas 4 direções (ex.: vão entre as pernas numa pose aberta), vira uma
sombra escura semi-opaca em vez de transparência pura — do contrário mostraria o cenário do
jogo através de um buraco no meio do personagem. Bolsões cercados muito pequenos (brilho no
rosto, reflexo no cabelo) são ignorados e ficam como estavam.

Uso:
```powershell
npm install
node remove_bg.mjs "<pasta com subpastas de personagens>"
```
Sobrescreve os PNGs no lugar. Rode sempre sobre uma cópia/originais (os originais ficam em
`Downloads/personagens_cabo_de_guerra_individuais`), nunca sobre o único exemplar que existir.
