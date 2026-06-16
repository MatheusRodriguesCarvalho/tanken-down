// ============================================================
// TANKEN DOWN — Servidor Autoritativo (Node.js + Express + Socket.IO)
// ============================================================

var express = require('express');
var app     = express();
var server  = require('http').Server(app);
var io      = require('socket.io')(server);

app.use(express.static(__dirname + '/public'));
app.get('/', function(req, res) {
    res.sendFile(__dirname + '/public/index.html');
});

// ─── Constantes ────────────────────────────────────────────
var CHUNK_SIZE = 11;
var TERRENO_Y  = 200;   // Y onde o terreno começa (pixels)
var TANK_MEIO  = 20;    // meia-altura do sprite do tanque em jogo
var TANK_MEIA_LARGURA = 25; // metade da largura para checar múltiplas colunas
var GRAVIDADE  = 0.5;
var TICK_MS    = 16;

// ─── Estado Global ─────────────────────────────────────────
var gameState = {
    fase: 'aguardando',
    turno: 1,
    vento: false,
    forcaVento: 0,
    tamanhoMapa: 'M',
    nomeP1: 'JOGADOR 1',
    nomeP2: 'JOGADOR 2'
};

var slotP1 = null, slotP2 = null;
var players = {};
var worldWidth = 1200;

var tanques = {
    1: { hp: 100, fuel: 100, x: 150,  y: 160, vy: 0 },
    2: { hp: 100, fuel: 100, x: 1050, y: 160, vy: 0 }
};

// Set de chunks destruídos — chave "cx_cy" para busca O(1)
var chunksDestruidosSet = new Set();
var chunksDestruidosArr = []; // array para enviar ao cliente

var projetil      = null;
var projetilTimer = null;
var tankTimer     = null;

// ─── Helpers ───────────────────────────────────────────────

function getWorldWidth() {
    var m = gameState.tamanhoMapa;
    if (m === 'P')  return 800;
    if (m === 'M')  return 1200;
    if (m === 'G')  return 1600;
    if (m === 'XX') return 2400;
    return 1200;
}

function obterSlot(id) {
    if (slotP1 === id) return 1;
    if (slotP2 === id) return 2;
    return null;
}

function gerarVento() {
    if (!gameState.vento) { gameState.forcaVento = 0; return; }
    gameState.forcaVento = parseFloat(((Math.random() - 0.5) * 0.002).toFixed(6));
}

function chunkKey(cx, cy) { return cx + '_' + cy; }

function isDestruido(cx, cy) {
    return chunksDestruidosSet.has(chunkKey(cx, cy));
}

function destruirChunk(cx, cy) {
    var k = chunkKey(cx, cy);
    if (!chunksDestruidosSet.has(k)) {
        chunksDestruidosSet.add(k);
        chunksDestruidosArr.push({ cx: cx, cy: cy });
    }
}

// ─── Funções de terreno ────────────────────────────────────

// IMPORTANTE: chunks do jogo existem apenas em Y = TERRENO_Y + N*CHUNK_SIZE
// (200, 211, 222, 233...). Toda busca deve usar esses valores exatos.

// Converte um Y qualquer para o índice de chunk correspondente (alinhado ao grid).
function chunkGyEm(y) {
    // Chunk que contém o Y: arredonda para baixo no grid do terreno
    return TERRENO_Y + Math.floor((y - TERRENO_Y) / CHUNK_SIZE) * CHUNK_SIZE;
}

// Retorna o Y do topo do primeiro chunk sólido na coluna colX,
// começando no chunk que contém startY e indo para baixo.
// Garante que só verifica posições de chunk válidas (múltiplos alinhados a TERRENO_Y).
function topoSuperficieEm(colX, startY) {
    var cx = Math.floor(Math.max(0, Math.min(worldWidth - 1, colX)) / CHUNK_SIZE) * CHUNK_SIZE;
    // Começa no chunk alinhado que contém startY, nunca antes de TERRENO_Y
    var gyInicio = startY < TERRENO_Y ? TERRENO_Y : chunkGyEm(startY);
    for (var gy = gyInicio; gy < 600; gy += CHUNK_SIZE) {
        if (!isDestruido(cx, gy)) return gy;
    }
    return 600;
}

// Retorna o Y do topo do terreno sólido abaixo do tanque,
// verificando três colunas (esquerda, centro, direita).
// Busca a partir do fundo do tanque para nunca encontrar chão acima dele.
function topoTerrenoAbaixo(tankX, tankY) {
    var fundoTank = tankY + TANK_MEIO;
    var pontos = [
        tankX - TANK_MEIA_LARGURA + 2,
        tankX,
        tankX + TANK_MEIA_LARGURA - 2
    ];
    var melhorTopo = 600;
    for (var p = 0; p < pontos.length; p++) {
        var topo = topoSuperficieEm(pontos[p], fundoTank);
        if (topo < melhorTopo) melhorTopo = topo;
    }
    return melhorTopo;
}

// Retorna o Y do topo da superfície sólida na coluna colX,
// buscando sempre do topo do terreno para baixo (ignora startY).
// Uso: detectar altura de paredes para colisão horizontal.
function topoSuperficieTotal(colX) {
    var cx = Math.floor(Math.max(0, Math.min(worldWidth - 1, colX)) / CHUNK_SIZE) * CHUNK_SIZE;
    for (var gy = TERRENO_Y; gy < 600; gy += CHUNK_SIZE) {
        if (!isDestruido(cx, gy)) return gy;
    }
    return 600; // coluna completamente destruída
}

// Move o tanque horizontalmente com escalada de até MAX_ESCALA_CHUNKS.
//
// Algoritmo:
// 1. Calcula nova posição X
// 2. Verifica a altura do terreno na borda do tanque (direção do movimento)
// 3. Se o terreno nessa coluna está ACIMA do fundo do tanque (há uma parede):
//    a. Se a parede tem até MAX_ESCALA_CHUNKS de altura acima do chão atual → escala
//    b. Caso contrário → bloqueia
// 4. Se não há parede → move normalmente
//
// "Parede" = terreno cuja superfície está acima do fundo do tanque.
// "Chão"   = terreno cuja superfície está no nível do fundo do tanque ou abaixo.
var MAX_ESCALA_CHUNKS = 3;

function moverTanqueX(tank, deltaX) {
    var novoX = Math.max(30, Math.min(worldWidth - 30, tank.x + deltaX));
    if (novoX === tank.x) return { x: tank.x, y: tank.y };

    // Fundo do tanque na posição atual
    var fundoAtual = tank.y + TANK_MEIO;

    // Borda frontal do tanque na nova posição
    var bordaX = deltaX > 0
        ? novoX + TANK_MEIA_LARGURA - 1
        : novoX - TANK_MEIA_LARGURA + 1;

    // Topo do terreno na coluna da borda frontal
    var topoParede = topoSuperficieTotal(bordaX);

    // Se a superfície está acima do fundo do tanque → é uma parede ou degrau
    if (topoParede < fundoAtual) {
        // Y que o tanque precisaria ter para ficar em cima do terreno
        var yEmCima = topoParede - TANK_MEIO;

        // Quantos pixels o tanque precisaria subir
        var subida = tank.y - yEmCima;

        if (subida > 0 && subida <= MAX_ESCALA_CHUNKS * CHUNK_SIZE) {
            // Degrau escalável: sobe e move
            return { x: novoX, y: yEmCima };
        } else {
            // Parede alta demais: bloqueia
            return { x: tank.x, y: tank.y };
        }
    }

    // Sem parede: move livremente (descida tratada pela gravidade no tick)
    return { x: novoX, y: tank.y };
}

// ─── Física dos Tanques ────────────────────────────────────

function tickFisicaTanques() {
    [1, 2].forEach(function(num) {
        var t = tanques[num];
        if (t.hp <= 0) return;

        // Busca chão a partir do fundo atual do tanque
        var topo  = topoTerrenoAbaixo(t.x, t.y);
        var yAlvo = topo - TANK_MEIO;

        if (t.y >= yAlvo - 0.5) {
            // Pousado — gruda no chão e zera velocidade
            t.y  = yAlvo;
            t.vy = 0;
        } else {
            // No ar — aplica gravidade
            t.vy += GRAVIDADE;
            t.y  += t.vy;
            // Clamp: não ultrapassa o chão
            if (t.y >= yAlvo) {
                t.y  = yAlvo;
                t.vy = 0;
            }
        }
    });

    io.emit('tanksBatch', {
        1: { x: tanques[1].x, y: tanques[1].y, fuel: tanques[1].fuel, hp: tanques[1].hp },
        2: { x: tanques[2].x, y: tanques[2].y, fuel: tanques[2].fuel, hp: tanques[2].hp }
    });
}

function iniciarLoopTanques() {
    if (tankTimer) clearInterval(tankTimer);
    tankTimer = setInterval(tickFisicaTanques, TICK_MS);
}

function pararLoopTanques() {
    if (tankTimer) { clearInterval(tankTimer); tankTimer = null; }
}

function resetarJogo() {
    worldWidth = getWorldWidth();
    chunksDestruidosSet.clear();
    chunksDestruidosArr = [];
    projetil = null;
    if (projetilTimer) { clearInterval(projetilTimer); projetilTimer = null; }

    tanques[1] = { hp: 100, fuel: 100, x: 150,              y: TERRENO_Y - TANK_MEIO, vy: 0 };
    tanques[2] = { hp: 100, fuel: 100, x: worldWidth - 150, y: TERRENO_Y - TANK_MEIO, vy: 0 };

    gameState.turno = 1;
    gameState.fase  = 'jogando';
    gerarVento();
    iniciarLoopTanques();
}

// ─── Projétil ──────────────────────────────────────────────

function verificarColisaoProjetil() {
    if (!projetil) return false;
    var px = projetil.x, py = projetil.y;

    if (py > 650 || px < 0 || px > worldWidth) {
        executarExplosao(px, py, false);
        return true;
    }

    if (py >= TERRENO_Y) {
        var cx = Math.floor(px / CHUNK_SIZE) * CHUNK_SIZE;
        var cy = Math.floor((py - TERRENO_Y) / CHUNK_SIZE) * CHUNK_SIZE + TERRENO_Y;
        if (!isDestruido(cx, cy)) {
            executarExplosao(px, py, true);
            return true;
        }
    }

    for (var n = 1; n <= 2; n++) {
        if (tanques[n].hp > 0) {
            var dx = px - tanques[n].x, dy = py - tanques[n].y;
            if (Math.sqrt(dx*dx + dy*dy) < 30) {
                executarExplosao(px, py, true);
                return true;
            }
        }
    }
    return false;
}

function executarExplosao(x, y, causaDano) {
    var raio = 45;

    // Destrói chunks no raio
    for (var gy = TERRENO_Y; gy < 600; gy += CHUNK_SIZE) {
        for (var gx = 0; gx < worldWidth; gx += CHUNK_SIZE) {
            var dist = Math.sqrt(
                Math.pow(x - (gx + CHUNK_SIZE / 2), 2) +
                Math.pow(y - (gy + CHUNK_SIZE / 2), 2)
            );
            if (dist < raio) destruirChunk(gx, gy);
        }
    }

    // Dano nos tanques
    var morreu = null;
    if (causaDano) {
        [1, 2].forEach(function(num) {
            if (tanques[num].hp > 0) {
                var d = Math.sqrt(
                    Math.pow(x - tanques[num].x, 2) +
                    Math.pow(y - tanques[num].y, 2)
                );
                if (d < raio + 20) {
                    var dano = Math.floor(Math.max(10, 30 - d / 2));
                    tanques[num].hp = Math.max(0, tanques[num].hp - dano);
                    if (tanques[num].hp <= 0) morreu = num;
                }
            }
        });
    }

    projetil = null;
    if (projetilTimer) { clearInterval(projetilTimer); projetilTimer = null; }

    io.emit('explosao', {
        x: x, y: y,
        tanques: { 1: tanques[1], 2: tanques[2] },
        chunksDestruidos: chunksDestruidosArr
    });

    if (morreu !== null) {
        var vencedor = morreu === 1 ? gameState.nomeP2 : gameState.nomeP1;
        gameState.fase = 'fim';
        pararLoopTanques();
        setTimeout(function() { io.emit('fimDeJogo', { vencedor: vencedor }); }, 1500);
        return;
    }

    setTimeout(finalizarTurno, 900);
}

function finalizarTurno() {
    gameState.turno = gameState.turno === 1 ? 2 : 1;
    tanques[gameState.turno].fuel = 100;
    gerarVento();
    io.emit('novoTurno', {
        turno:      gameState.turno,
        nomeP1:     gameState.nomeP1,
        nomeP2:     gameState.nomeP2,
        tanques:    { 1: tanques[1], 2: tanques[2] },
        forcaVento: gameState.forcaVento,
        vento:      gameState.vento
    });
}

function iniciarSimulacaoProjetil(dados) {
    projetil = { x: dados.startX, y: dados.startY, vx: dados.vx, vy: dados.vy };
    if (projetilTimer) clearInterval(projetilTimer);
    projetilTimer = setInterval(function() {
        if (!projetil) { clearInterval(projetilTimer); projetilTimer = null; return; }
        projetil.vy += GRAVIDADE;
        if (gameState.vento) projetil.vx += gameState.forcaVento * 1000;
        projetil.x += projetil.vx;
        projetil.y += projetil.vy;
        io.emit('projetilUpdate', { x: projetil.x, y: projetil.y });
        verificarColisaoProjetil();
    }, TICK_MS);
}

// ─── Socket.IO ─────────────────────────────────────────────

io.on('connection', function(socket) {
    console.log('Conectado: ' + socket.id);

    var meuSlot = null;
    if      (!slotP1) { slotP1 = socket.id; meuSlot = 1; }
    else if (!slotP2) { slotP2 = socket.id; meuSlot = 2; }
    else { socket.emit('salaCheia'); return; }

    players[socket.id] = { slot: meuSlot };

    socket.emit('benvindo', {
        slot:             meuSlot,
        gameState:        gameState,
        tanques:          tanques,
        chunksDestruidos: chunksDestruidosArr
    });
    socket.broadcast.emit('jogadorConectado', { slot: meuSlot });

    // ── Configurar ──
    socket.on('configurarJogo', function(d) {
        if (obterSlot(socket.id) !== 1) return;
        if (d.nomeP1)                        gameState.nomeP1      = d.nomeP1.toUpperCase();
        if (d.nomeP2)                        gameState.nomeP2      = d.nomeP2.toUpperCase();
        if (d.tamanhoMapa)                   gameState.tamanhoMapa = d.tamanhoMapa;
        if (typeof d.vento !== 'undefined')  gameState.vento       = d.vento;
        io.emit('estadoAtualizado', { gameState: gameState });
    });

    // ── Iniciar ──
    socket.on('iniciarJogo', function() {
        if (obterSlot(socket.id) !== 1) return;
        if (!slotP1 || !slotP2) { socket.emit('erroIniciar', 'Aguardando o segundo jogador...'); return; }
        resetarJogo();
        io.emit('iniciarJogo', {
            gameState:  gameState,
            tanques:    tanques,
            worldWidth: worldWidth,
            nomeP1:     gameState.nomeP1,
            nomeP2:     gameState.nomeP2
        });
    });

    // ── Mover ──
    socket.on('moverTanque', function(d) {
        var slot = obterSlot(socket.id);
        if (!slot || slot !== gameState.turno || gameState.fase !== 'jogando' || projetil) return;
        var t = tanques[slot];
        if (t.hp <= 0 || t.fuel <= 0) return;
        // Usa moverTanqueX para checar colisão e escalada de terreno
        var resultado = moverTanqueX(t, d.direcao * 2);
        if (resultado.x !== t.x || resultado.y !== t.y) {
            t.x    = resultado.x;
            t.y    = resultado.y;
            t.fuel = Math.max(0, t.fuel - 0.5);
        }
    });

    // ── Atirar ──
    socket.on('atirar', function(d) {
        var slot = obterSlot(socket.id);
        if (!slot || slot !== gameState.turno || gameState.fase !== 'jogando' || projetil) return;
        var r = d.angle * Math.PI / 180;
        var t = tanques[slot];
        iniciarSimulacaoProjetil({
            startX: t.x + Math.cos(r) * 40,
            startY: t.y + Math.sin(r) * 40,
            vx: Math.cos(r) * d.power,
            vy: Math.sin(r) * d.power
        });
        io.emit('projetilIniciado', { x: t.x + Math.cos(r) * 40, y: t.y + Math.sin(r) * 40 });
    });

    // ── Reiniciar ──
    socket.on('reiniciar', function() {
        if (obterSlot(socket.id) !== 1) return;
        resetarJogo();
        io.emit('iniciarJogo', { gameState: gameState, tanques: tanques, worldWidth: worldWidth });
    });

    // ── Desconexão ──
    socket.on('disconnect', function() {
        console.log('Desconectado: ' + socket.id);
        var slot = obterSlot(socket.id);
        delete players[socket.id];
        if (socket.id === slotP1) slotP1 = null;
        if (socket.id === slotP2) slotP2 = null;
        if (projetilTimer) { clearInterval(projetilTimer); projetilTimer = null; projetil = null; }
        pararLoopTanques();
        if (slot) { gameState.fase = 'aguardando'; io.emit('jogadorSaiu', { slot: slot }); }
    });
});

var PORT = process.env.PORT || 8081;
server.listen(PORT, function() {
    console.log('Tanken Down rodando na porta ' + PORT);
});
