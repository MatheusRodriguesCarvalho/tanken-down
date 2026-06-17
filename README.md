# 🎮 Tanken Down — Multiplayer

Jogo de artilharia 1v1 por turnos, jogado online entre dois jogadores em navegadores diferentes.

Inspirado em clássicos como Scorched Earth e Worms, cada jogador controla um tanque e deve eliminar o oponente ajustando o ângulo e a força do disparo. O terreno é destrutível — explosões abrem buracos e mudam o campo de batalha a cada rodada.

## Funcionalidades

- Multiplayer online em tempo real via Socket.IO
- Terreno destrutível com física de queda
- Sistema de turnos com HP e combustível por tanque
- Vento opcional com direção aleatória a cada turno
- 4 tamanhos de mapa (P, M, G, XX)
- Nomes personalizáveis para cada jogador

## Tecnologias

- **Phaser 3** — engine do jogo no navegador
- **Node.js + Express** — servidor web
- **Socket.IO** — comunicação em tempo real

## Como rodar localmente

**Pré-requisito:** ter o [Node.js](https://nodejs.org) instalado.

```bash
# 1. Clone ou baixe o repositório
git clone https://github.com/MatheusRodriguesCarvalho/tanken-down.git
cd tanken-down

# 2. Instale as dependências
npm install

# 3. Inicie o servidor
node server.js
```

Abra **http://localhost:8081** em dois navegadores ou abas diferentes. O primeiro a conectar será o Jogador 1 (quem configura e inicia a partida); o segundo será o Jogador 2.

## Controles

| Ação | Jogador 1 | Jogador 2 |
|---|---|---|
| Mover | `A` / `D` | `←` / `→` |
| Ajustar ângulo | `W` / `S` | `↑` / `↓` |
| Carregar e atirar | `SPACE` (segurar) | `ENTER` (segurar) |

## Integrantes

- Gabriel Izidio
- Maria Eduarda Vieira
- Matheus Carvalho
- Jennifer C. Graciano
