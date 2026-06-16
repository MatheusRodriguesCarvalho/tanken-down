// ============================================================
// TANKEN DOWN — Cliente Phaser 3 (Multiplayer via Socket.IO)
// O cliente APENAS renderiza e envia inputs.
// ============================================================

// ─── Cena: Aguardando ────────────────────────────────────
class WaitingScene extends Phaser.Scene {
    constructor() { super('WaitingScene'); }

    create() {
        this.cameras.main.setBackgroundColor('#111');

        this.add.text(400, 200, 'TANKEN DOWN', {
            fontSize: '52px', fill: '#ffcc00', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5);

        this.statusText = this.add.text(400, 320, 'Conectando ao servidor...', {
            fontSize: '22px', fill: '#aaa'
        }).setOrigin(0.5);

        this.slotText = this.add.text(400, 375, '', {
            fontSize: '20px', fill: '#00ff88', fontStyle: 'bold'
        }).setOrigin(0.5);

        if (!window._socket) window._socket = io();
        var s = window._socket;

        s.off('benvindo'); s.off('salaCheia'); s.off('jogadorConectado');
        s.off('iniciarJogo'); s.off('jogadorSaiu');

        s.on('benvindo', (d) => {
            window._meuSlot   = d.slot;
            window._gameState = d.gameState;
            window._tanques   = d.tanques;
            this.slotText.setText(`Você é o JOGADOR ${d.slot}`);
            this.statusText.setText(d.slot === 1
                ? 'Aguardando o Jogador 2 conectar...'
                : 'Conectado! Aguardando P1 iniciar...');
        });

        s.on('salaCheia', () => this.statusText.setText('Sala cheia!'));

        s.on('jogadorConectado', (d) => {
            if (window._meuSlot === 1 && d.slot === 2) {
                this.statusText.setText('Jogador 2 entrou! Abrindo menu...');
                setTimeout(() => this.scene.start('MainMenu'), 700);
            } else if (window._meuSlot === 2) {
                this.scene.start('MainMenu');
            }
        });

        s.on('iniciarJogo', (d) => {
            window._gameState = d.gameState;
            window._tanques   = d.tanques;
            window._worldWidth = d.worldWidth;
            this.scene.start('GameScene');
        });

        s.on('jogadorSaiu', () => this.scene.start('WaitingScene'));
    }
}

// ─── Cena: Menu ──────────────────────────────────────────
class MainMenu extends Phaser.Scene {
    constructor() { super('MainMenu'); }

    preload() {
        this.load.image('bg_fundo', 'assets/sky.png');
        this.load.image('bg_pedra', 'assets/soil.png');
        this.load.image('bg_grama', 'assets/grass.png');
    }

    create() {
        this.add.image(400, 300, 'bg_fundo').setDisplaySize(800, 600);
        this.pedra = this.add.tileSprite(400, 400, 800, 400, 'bg_pedra').setAlpha(0.8).setTint(0x9999ff);
        this.grama = this.add.tileSprite(400, 550, 800, 150, 'bg_grama');

        this.add.text(400, 110, 'TANKEN DOWN', {
            fontSize: '58px', fill: '#ffcc00', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5);

        var eP1 = window._meuSlot === 1;
        var gs  = window._gameState || {};

        this.add.text(400, 178, `Você é o JOGADOR ${window._meuSlot}`, {
            fontSize: '17px', fill: eP1 ? '#00ff88' : '#00ccff', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(200, 236, 'Nome P1:', { fontSize: '16px', fill: '#ccc' }).setOrigin(0.5);
        this.add.text(600, 236, 'Nome P2:', { fontSize: '16px', fill: '#ccc' }).setOrigin(0.5);
        this.nomeP1Input = this.criarInput(200, 262, gs.nomeP1 || 'JOGADOR 1', eP1);
        this.nomeP2Input = this.criarInput(600, 262, gs.nomeP2 || 'JOGADOR 2', eP1);

        var tamanhos = ['P', 'M', 'G', 'XX'];
        this.tamanhoAtual = gs.tamanhoMapa || 'M';
        this.add.text(400, 332, 'Tamanho do Mapa:', { fontSize: '16px', fill: '#ccc' }).setOrigin(0.5);
        this.mapaText = this.add.text(400, 358, `[ ${this.tamanhoAtual} ]`, {
            fontSize: '26px', fill: eP1 ? '#ffff00' : '#555', fontStyle: 'bold'
        }).setOrigin(0.5);
        if (eP1) {
            this.mapaText.setInteractive({ useHandCursor: true });
            this.mapaText.on('pointerdown', () => {
                this.tamanhoAtual = tamanhos[(tamanhos.indexOf(this.tamanhoAtual) + 1) % tamanhos.length];
                this.mapaText.setText(`[ ${this.tamanhoAtual} ]`);
                this.enviarConfig();
            });
        }

        this.ventoAtivo = gs.vento || false;
        this.ventoText = this.add.text(400, 406, `Vento: ${this.ventoAtivo ? 'LIGADO' : 'DESLIGADO'}`, {
            fontSize: '20px', fill: eP1 ? (this.ventoAtivo ? '#00ff00' : '#ff4444') : '#555'
        }).setOrigin(0.5);
        if (eP1) {
            this.ventoText.setInteractive({ useHandCursor: true });
            this.ventoText.on('pointerdown', () => {
                this.ventoAtivo = !this.ventoAtivo;
                this.ventoText.setText(`Vento: ${this.ventoAtivo ? 'LIGADO' : 'DESLIGADO'}`);
                this.ventoText.setFill(this.ventoAtivo ? '#00ff00' : '#ff4444');
                this.enviarConfig();
            });
        }

        if (eP1) {
            var btn = this.add.text(400, 482, '▶  INICIAR PARTIDA  ◀', {
                fontSize: '28px', fill: '#00ff00', fontStyle: 'bold',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            btn.on('pointerover', () => btn.setFill('#88ffaa'));
            btn.on('pointerout',  () => btn.setFill('#00ff00'));
            btn.on('pointerdown', () => { this.enviarConfig(); window._socket.emit('iniciarJogo'); });
        } else {
            this.add.text(400, 482, 'Aguardando o Jogador 1 iniciar...', {
                fontSize: '19px', fill: '#aaa'
            }).setOrigin(0.5);
        }

        var s = window._socket;
        s.off('estadoAtualizado'); s.off('iniciarJogo'); s.off('jogadorSaiu'); s.off('erroIniciar');

        s.on('estadoAtualizado', (d) => {
            window._gameState = d.gameState;
            this.tamanhoAtual = d.gameState.tamanhoMapa;
            this.ventoAtivo   = d.gameState.vento;
            this.mapaText.setText(`[ ${this.tamanhoAtual} ]`);
            this.ventoText.setText(`Vento: ${this.ventoAtivo ? 'LIGADO' : 'DESLIGADO'}`);
            if (!eP1) {
                this.nomeP1Input.setText(d.gameState.nomeP1);
                this.nomeP2Input.setText(d.gameState.nomeP2);
            }
        });

        s.on('iniciarJogo', (d) => {
            window._gameState  = d.gameState;
            window._tanques    = d.tanques;
            window._worldWidth = d.worldWidth;
            this.scene.start('GameScene');
        });

        s.on('jogadorSaiu', () => this.scene.start('WaitingScene'));
        s.on('erroIniciar', (msg) => {
            this.add.text(400, 548, msg, { fontSize: '15px', fill: '#ff4444' }).setOrigin(0.5);
        });
    }

    criarInput(x, y, valor, editavel) {
        if (editavel) {
            var el = document.createElement('input');
            el.type = 'text'; el.value = valor; el.maxLength = 14;
            var r  = this.sys.game.canvas.getBoundingClientRect();
            var sx = r.width / 800, sy = r.height / 600;
            el.style.cssText =
                `position:absolute;width:${130*sx}px;height:${28*sy}px;` +
                `font-size:${13*sy}px;text-align:center;font-weight:bold;` +
                `background:#1a1a1a;color:#fff;border:2px solid #555;border-radius:4px;` +
                `outline:none;z-index:10;` +
                `left:${r.left + x*sx - 65*sx}px;top:${r.top + y*sy - 14*sy}px;`;
            document.body.appendChild(el);
            this._domInputs = this._domInputs || [];
            this._domInputs.push(el);
            el.addEventListener('input', () => this.enviarConfig());
            return { getValue: () => el.value, setText: (v) => { el.value = v; } };
        } else {
            var t = this.add.text(x, y, valor, {
                fontSize: '13px', fill: '#777', fontStyle: 'bold'
            }).setOrigin(0.5);
            return { getValue: () => t.text, setText: (v) => t.setText(v) };
        }
    }

    enviarConfig() {
        if (window._meuSlot !== 1) return;
        window._socket.emit('configurarJogo', {
            nomeP1:      this.nomeP1Input.getValue(),
            nomeP2:      this.nomeP2Input.getValue(),
            tamanhoMapa: this.tamanhoAtual,
            vento:       this.ventoAtivo
        });
    }

    shutdown() {
        (this._domInputs || []).forEach(el => el.parentNode && el.parentNode.removeChild(el));
        this._domInputs = [];
        var s = window._socket;
        if (s) { s.off('estadoAtualizado'); s.off('iniciarJogo'); s.off('jogadorSaiu'); s.off('erroIniciar'); }
    }

    update() { this.pedra.tilePositionX += 0.2; this.grama.tilePositionX += 0.5; }
}

// ─── Cena: Jogo ──────────────────────────────────────────
class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    preload() {
        this.load.image('groundTexture', 'assets/soil.png');
        this.load.image('tank1Sprite',   'assets/tank1.png');
        this.load.image('tank2Sprite',   'assets/tank2.png');
        this.load.image('bg_sky',        'assets/sky.png');
    }

    create() {
        var gs  = window._gameState || {};
        var ww  = window._worldWidth || 1200;
        this.worldWidth  = ww;
        this.meuSlot     = window._meuSlot;
        this.turnoAtual  = gs.turno || 1;
        // Cópia local dos tanques — atualizada pelos eventos do servidor
        this.tanques     = JSON.parse(JSON.stringify(
            window._tanques || { 1:{hp:100,fuel:100,x:150,y:180}, 2:{hp:100,fuel:100,x:ww-150,y:180} }
        ));
        this.isCharging  = false;
        this.chargePower = 0;
        this.MAX_POWER   = 25;
        // P1 atira para direita (ângulo inicial -45°), P2 para esquerda (-135°)
        this.angle       = this.meuSlot === 1 ? -45 : -135;
        this.projetilSprite = null;

        // ── Nomes vindos do servidor (fonte única de verdade) ──
        this.nomeP1 = gs.nomeP1 || 'JOGADOR 1';
        this.nomeP2 = gs.nomeP2 || 'JOGADOR 2';

        // Câmera e fundo
        this.cameras.main.setBounds(0, 0, ww, 600);
        this.cameras.main.setBackgroundColor('#6688aa');
        this.add.image(ww / 2, 300, 'bg_sky').setDisplaySize(ww, 600).setDepth(0);

        // Terreno visual
        this.terrain = this.add.renderTexture(0, 200, ww, 400).setOrigin(0, 0).setDepth(1);
        this.terrain.fill(0x663300);
        for (var i = 0; i < ww; i += 400) this.terrain.draw('groundTexture', i, 0);

        // Sprites dos tanques
        this.sprite1 = this.add.image(this.tanques[1].x, this.tanques[1].y, 'tank1Sprite').setScale(0.2).setDepth(3);
        this.sprite2 = this.add.image(this.tanques[2].x, this.tanques[2].y, 'tank2Sprite').setScale(0.2).setDepth(3);

        // Gráficos
        this.aimGraphics = this.add.graphics().setDepth(6);
        this.uiGraphics  = this.add.graphics().setDepth(5);

        // Nomes flutuantes (seguem os sprites, scrollFactor padrão = 1)
        this.nomeT1 = this.add.text(0, 0, this.nomeP1, {
            fontSize: '13px', fill: '#00ff88', fontStyle: 'bold', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(7);
        this.nomeT2 = this.add.text(0, 0, this.nomeP2, {
            fontSize: '13px', fill: '#00ccff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(7);

        // HUD fixo — scrollFactor(0) gruda na tela
        var nomeAtual = this.turnoAtual === 1 ? this.nomeP1 : this.nomeP2;
        this.uiTurno = this.add.text(400, 28, `TURNO: ${nomeAtual}`, {
            fontSize: '22px', fill: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10);

        this.uiVento = this.add.text(400, 56, '', {
            fontSize: '14px', fill: '#aad4ff'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10);

        this.add.text(8, 8, `Você: P${this.meuSlot}`, {
            fontSize: '12px', fill: 'rgba(255,255,255,0.55)'
        }).setScrollFactor(0).setDepth(10);

        this.atualizarVento(gs.vento, gs.forcaVento);

        // Controles
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys    = this.input.keyboard.addKeys('W,S,A,D,SPACE,ENTER');

        // Câmera segue MEU sprite imediatamente
        this.seguirMeuTanque();

        // ─── Eventos Socket ───────────────────────────────
        var s = window._socket;
        ['tanksBatch','projetilIniciado','projetilUpdate',
         'explosao','novoTurno','fimDeJogo','jogadorSaiu'].forEach(ev => s.off(ev));

        // Loop de física dos tanques vindo do servidor
        s.on('tanksBatch', (d) => {
            for (var n = 1; n <= 2; n++) {
                if (d[n]) {
                    this.tanques[n].x    = d[n].x;
                    this.tanques[n].y    = d[n].y;
                    this.tanques[n].fuel = d[n].fuel;
                    this.tanques[n].hp   = d[n].hp;
                }
            }
        });

        s.on('projetilIniciado', (d) => {
            if (this.projetilSprite) this.projetilSprite.destroy();
            this.projetilSprite = this.add.circle(d.x, d.y, 5, 0xff3300).setDepth(8);
            this.cameras.main.stopFollow();
            this.cameras.main.startFollow(this.projetilSprite, true, 0.08, 0.08);
        });

        s.on('projetilUpdate', (d) => {
            if (this.projetilSprite) {
                this.projetilSprite.x = d.x;
                this.projetilSprite.y = d.y;
            }
        });

        s.on('explosao', (d) => {
            this.explosaoVisual(d.x, d.y);
            // Recebe estado completo dos tanques pós-explosão
            this.tanques[1] = Object.assign(this.tanques[1], d.tanques[1]);
            this.tanques[2] = Object.assign(this.tanques[2], d.tanques[2]);
            // Reaplica todo o terreno destruído acumulado
            if (d.chunksDestruidos) this.reaplicarTerreno(d.chunksDestruidos);
            if (this.projetilSprite) { this.projetilSprite.destroy(); this.projetilSprite = null; }
            this.seguirMeuTanque();
        });

        s.on('novoTurno', (d) => {
            this.turnoAtual  = d.turno;
            this.isCharging  = false;
            this.chargePower = 0;
            // Atualiza nomes a partir do servidor (fonte de verdade)
            this.nomeP1 = d.nomeP1 || this.nomeP1;
            this.nomeP2 = d.nomeP2 || this.nomeP2;
            window._gameState = window._gameState || {};
            window._gameState.nomeP1 = this.nomeP1;
            window._gameState.nomeP2 = this.nomeP2;
            // Atualiza HUD com nome correto do turno atual
            var nome = d.turno === 1 ? this.nomeP1 : this.nomeP2;
            this.uiTurno.setText(`TURNO: ${nome}`);
            this.nomeT1.setText(this.nomeP1);
            this.nomeT2.setText(this.nomeP2);
            this.atualizarVento(d.vento, d.forcaVento);
            this.seguirMeuTanque();
        });

        s.on('fimDeJogo', (d) => {
            if (this.projetilSprite) { this.projetilSprite.destroy(); this.projetilSprite = null; }
            this.cameras.main.stopFollow();
            this.uiTurno.setText(`VITÓRIA: ${d.vencedor}!`);
            this.time.delayedCall(2500, () => this.scene.start('GameOver', { vencedor: d.vencedor }));
        });

        s.on('jogadorSaiu', () => {
            this.cameras.main.stopFollow();
            this.add.text(400, 300, 'Oponente desconectou!', {
                fontSize: '26px', fill: '#ff4444', stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
            this.time.delayedCall(3000, () => this.scene.start('WaitingScene'));
        });
    }

    // Câmera segue o sprite físico do MEU tanque
    seguirMeuTanque() {
        var sp = this.meuSlot === 1 ? this.sprite1 : this.sprite2;
        if (!sp) return;
        this.cameras.main.stopFollow();
        this.cameras.main.startFollow(sp, true, 0.1, 0.1);
    }

    atualizarVento(ativo, forca) {
        if (!ativo || !forca) { this.uiVento.setText(''); return; }
        var dir = forca > 0 ? '>> DIREITA >>' : '<< ESQUERDA <<';
        this.uiVento.setText(`VENTO: ${dir}  (Força: ${Math.abs(Math.round(forca * 10000))})`);
    }

    // Reaplica lista completa de chunks destruídos ao terreno visual
    reaplicarTerreno(chunks) {
        // Limpa e redesenha do zero para evitar artefatos acumulados
        this.terrain.clear();
        this.terrain.fill(0x663300);
        for (var i = 0; i < this.worldWidth; i += 400) this.terrain.draw('groundTexture', i, 0);

        // Apaga cada chunk destruído
        chunks.forEach((c) => {
            var localY = c.cy - 200; // converte para coord local do RenderTexture
            var rect = this.add.rectangle(0, 0, 11, 11, 0x000000).setVisible(false);
            this.terrain.erase(rect, c.cx + 5.5, localY + 5.5);
            rect.destroy();
        });
    }

    explosaoVisual(x, y) {
        // Efeito visual — o terreno será redesenhado via reaplicarTerreno()
        var raio = 45;
        var f1 = this.add.circle(x, y, raio,       0xff5500, 0.85).setDepth(9);
        var f2 = this.add.circle(x, y, raio * 0.5, 0xffee00, 0.9 ).setDepth(10);
        this.tweens.add({
            targets: [f1, f2], alpha: 0, scale: 1.6, duration: 380,
            onComplete: () => { f1.destroy(); f2.destroy(); }
        });
    }

    update() {
        if (!this.aimGraphics) return;
        this.aimGraphics.clear();
        this.uiGraphics.clear();

        var t1 = this.tanques[1];
        var t2 = this.tanques[2];

        // Sincroniza sprites com posições vindas do servidor
        if (t1 && this.sprite1) {
            this.sprite1.setPosition(t1.x, t1.y);
            this.nomeT1.setPosition(t1.x, t1.y - 46);
        }
        if (t2 && this.sprite2) {
            this.sprite2.setPosition(t2.x, t2.y);
            this.nomeT2.setPosition(t2.x, t2.y - 46);
        }

        if (t1 && t1.hp > 0) this.desenharUI(t1);
        if (t2 && t2.hp > 0) this.desenharUI(t2);

        // Input só no meu turno e sem projétil ativo
        if (this.turnoAtual !== this.meuSlot || this.projetilSprite) return;
        var meuTank = this.tanques[this.meuSlot];
        if (!meuTank || meuTank.hp <= 0) return;

        var isP1     = this.meuSlot === 1;
        var keyLeft  = isP1 ? this.keys.A.isDown    : this.cursors.left.isDown;
        var keyRight = isP1 ? this.keys.D.isDown    : this.cursors.right.isDown;
        var keyUp    = isP1 ? this.keys.W.isDown    : this.cursors.up.isDown;
        var keyDown  = isP1 ? this.keys.S.isDown    : this.cursors.down.isDown;
        var keyFire  = isP1 ? this.keys.SPACE       : this.keys.ENTER;

        if (!this.isCharging) {
            if (keyUp)   this.angle -= 2;
            if (keyDown) this.angle += 2;
        }

        if (!this.isCharging && meuTank.fuel > 0) {
            if (keyLeft)  window._socket.emit('moverTanque', { direcao: -1 });
            if (keyRight) window._socket.emit('moverTanque', { direcao:  1 });
        }

        this.desenharMira(meuTank.x, meuTank.y, this.angle);

        if (keyFire.isDown) {
            this.isCharging  = true;
            this.chargePower = Math.min(this.chargePower + 0.4, this.MAX_POWER);
            this.desenharBarraForca(meuTank, this.chargePower);
        } else if (Phaser.Input.Keyboard.JustUp(keyFire) && this.isCharging) {
            window._socket.emit('atirar', { angle: this.angle, power: this.chargePower });
            this.isCharging  = false;
            this.chargePower = 0;
        }
    }

    desenharUI(tank) {
        var tx = tank.x, ty = tank.y;
        this.uiGraphics.fillStyle(0xff2222, 1);
        this.uiGraphics.fillRect(tx - 20, ty - 34, 40, 5);
        this.uiGraphics.fillStyle(0x00ee44, 1);
        this.uiGraphics.fillRect(tx - 20, ty - 34, Math.max(0, 40 * tank.hp / 100), 5);
        if (tank.fuel < 100) {
            this.uiGraphics.fillStyle(0x000000, 0.5);
            this.uiGraphics.fillRect(tx - 20, ty + 26, 40, 4);
            this.uiGraphics.fillStyle(0xffee00, 1);
            this.uiGraphics.fillRect(tx - 20, ty + 26, Math.max(0, 40 * tank.fuel / 100), 4);
        }
    }

    desenharBarraForca(tank, power) {
        var tx = tank.x, ty = tank.y;
        this.uiGraphics.fillStyle(0x000000, 0.8);
        this.uiGraphics.fillRect(tx - 25, ty + 36, 50, 7);
        this.uiGraphics.fillStyle(0xff8800, 1);
        this.uiGraphics.fillRect(tx - 25, ty + 36, 50 * power / this.MAX_POWER, 7);
    }

    desenharMira(x, y, angle) {
        var r  = Phaser.Math.DegToRad(angle);
        var ex = x + Math.cos(r) * 55, ey = y + Math.sin(r) * 55;
        this.aimGraphics.lineStyle(2, 0x00ff88, 0.75);
        this.aimGraphics.lineBetween(x, y, ex, ey);
        this.aimGraphics.fillStyle(0x00ff88, 1);
        this.aimGraphics.fillCircle(ex, ey, 3);
    }

    shutdown() {
        var s = window._socket;
        if (!s) return;
        ['tanksBatch','projetilIniciado','projetilUpdate',
         'explosao','novoTurno','fimDeJogo','jogadorSaiu'].forEach(ev => s.off(ev));
    }
}

// ─── Cena: Game Over ─────────────────────────────────────
class GameOver extends Phaser.Scene {
    constructor() { super('GameOver'); }
    init(d) { this.vencedor = d.vencedor || 'EMPATE'; }

    create() {
        this.cameras.main.setBackgroundColor('#000');

        this.add.text(400, 90, 'CONFRONTO FINALIZADO', {
            fontSize: '38px', fill: '#ff3333', fontStyle: 'bold', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);

        this.add.text(400, 162,
            'Após uma batalha intensa e estratégica,\napenas um tanque permaneceu de pé.',
            { fontSize: '17px', fill: '#ccc', align: 'center' }
        ).setOrigin(0.5);

        this.add.text(400, 244, 'VENCEDOR:', { fontSize: '22px', fill: '#fff' }).setOrigin(0.5);
        this.add.text(400, 300, this.vencedor, {
            fontSize: '52px', fill: '#ffff00', fontStyle: 'bold', stroke: '#ffaa00', strokeThickness: 5
        }).setOrigin(0.5);

        if (window._meuSlot === 1) {
            var btn = this.add.text(400, 400, '▶  JOGAR NOVAMENTE  ◀', {
                fontSize: '26px', fill: '#00ff00', stroke: '#000', strokeThickness: 3
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            btn.on('pointerover', () => btn.setFill('#88ffaa'));
            btn.on('pointerout',  () => btn.setFill('#00ff00'));
            btn.on('pointerdown', () => window._socket.emit('reiniciar'));
        } else {
            this.add.text(400, 400, 'Aguardando o Jogador 1 reiniciar...', {
                fontSize: '18px', fill: '#aaa'
            }).setOrigin(0.5);
        }

        var btnC = this.add.text(400, 460, 'CRÉDITOS', {
            fontSize: '18px', fill: '#777'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        btnC.on('pointerdown', () => this.mostrarCreditos());

        var s = window._socket;
        s.off('iniciarJogo'); s.off('jogadorSaiu');
        s.on('iniciarJogo', (d) => {
            window._gameState  = d.gameState;
            window._tanques    = d.tanques;
            window._worldWidth = d.worldWidth;
            this.scene.start('GameScene');
        });
        s.on('jogadorSaiu', () => this.scene.start('WaitingScene'));
    }

    mostrarCreditos() {
        var bg  = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.92);
        var txt = this.add.text(400, 290,
            'Gabriel Izidio\nMaria Eduarda Vieira\nMatheus Carvalho\nJennifer C. Graciano',
            { fontSize: '22px', fill: '#fff', align: 'center', lineSpacing: 14 }
        ).setOrigin(0.5);
        var fc = this.add.text(400, 520, '[ FECHAR ]', {
            fontSize: '18px', fill: '#ff4444'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        fc.on('pointerdown', () => { bg.destroy(); txt.destroy(); fc.destroy(); });
    }

    shutdown() {
        var s = window._socket;
        if (s) { s.off('iniciarJogo'); s.off('jogadorSaiu'); }
    }
}

// ─── Config Phaser ────────────────────────────────────────
var config = {
    type: Phaser.AUTO,
    width: 800, height: 600,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 800, height: 600 },
    physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
    scene: [WaitingScene, MainMenu, GameScene, GameOver]
};

new Phaser.Game(config);
