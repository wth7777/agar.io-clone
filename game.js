// Agar.io Clone - Mobile-first implementation
// Touch-follow controls, food pellets, AI bots, HUD, audio

(() => {
    // ============ CONFIGURATION ============
    const CONFIG = {
        // Canvas & World
        WORLD_SIZE: 3000,
        FOOD_COUNT: 200,
        BOT_COUNT: 8,
        INITIAL_PLAYER_RADIUS: 10,
        INITIAL_BOT_RADIUS: 12,
        FOOD_RADIUS: 3,
        FOOD_SPAWN_MARGIN: 50,
        
        // Physics
        PLAYER_SPEED_BASE: 8,
        SPEED_DECAY_FACTOR: 0.4,
        MIN_SPEED: 2,
        CAMERA_LERP: 0.12,
        
        // Growth
        FOOD_MASS: 1,
        CELL_MASS_MULTIPLIER: 1.1,
        EAT_THRESHOLD: 1.15,
        
        // Visual
        MIN_CELL_RADIUS: 5,
        MAX_CELL_RADIUS: 200,
        FOOD_COLORS: [
            '#4ecdc4', '#45b7aa', '#ff6b6b', '#ffe66d',
            '#a8e6cf', '#ff8b94', '#95e1d3', '#ffaaa5'
        ],
        BOT_COLORS: [
            '#4ecdc4', '#45b7aa', '#ff6b6b', '#ffe66d',
            '#a8e6cf', '#ff8b94', '#95e1d3', '#ffaaa5'
        ],
        
        // Camera
        CAMERA_DEADZONE: 0.3,
        
        // UI
        LEADERBOARD_MAX: 8,
        MASS_TO_RADIUS: 0.5,
    };

    // ============ STATE ============
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    let canvasWidth = 0, canvasHeight = 0;
    let dpr = window.devicePixelRatio || 1;

    let player = null;
    let cells = [];
    let food = [];
    let bots = [];
    let camera = { x: 0, y: 0 };
    let targetPos = { x: 0, y: 0 };
    let isPointerDown = false;
    let gameRunning = false;
    let animationId = null;
    let lastTime = 0;
    let score = 10;
    let playerName = 'Guest';

    // Audio
    const ambientAudio = document.getElementById('ambient-audio');
    const eatAudio = document.getElementById('eat-audio');
    let audioInitialized = false;

    // ============ UTILITY ============
    const rand = (min, max) => Math.random() * (max - min) + min;
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    // ============ AUDIO ============
    function initAudio() {
        if (audioInitialized) return;
        audioInitialized = true;
        
        // Create ambient loop using Web Audio API
        createAmbientLoop();
        createEatSound();
    }

    function createAmbientLoop() {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 4; // 4 seconds
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        // Generate a gentle ambient drone
        for (let i = 0; i < bufferSize; i++) {
            const t = i / audioCtx.sampleRate;
            // Low frequency drone with subtle modulation
            const freq1 = 55 + Math.sin(t * 0.1) * 3;
            const freq2 = 82.5 + Math.sin(t * 0.07) * 2;
            const freq3 = 110 + Math.sin(t * 0.05) * 1.5;
            
            data[i] = (
                Math.sin(2 * Math.PI * freq1 * t) * 0.015 +
                Math.sin(2 * Math.PI * freq2 * t) * 0.01 +
                Math.sin(2 * Math.PI * freq3 * t) * 0.005
            ) * 0.3;
        }

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.08;
        
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        // Store for later control
        ambientAudio._source = source;
        ambientAudio._gain = gainNode;
        ambientAudio._ctx = audioCtx;
        ambientAudio._playing = false;
        
        ambientAudio.play = () => {
            if (!ambientAudio._playing) {
                source.start(0);
                ambientAudio._playing = true;
            }
        };
        ambientAudio.pause = () => {
            if (ambientAudio._playing) {
                source.stop();
                ambientAudio._playing = false;
            }
        };
    }

    function createEatSound() {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 0.15;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            const t = i / audioCtx.sampleRate;
            const freq = 800 + Math.sin(t * 50) * 200;
            const envelope = Math.exp(-t * 30);
            data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.15;
        }

        eatAudio._ctx = audioCtx;
        eatAudio._buffer = buffer;
        
        eatAudio.play = () => {
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            const gain = audioCtx.createGain();
            gain.gain.value = 0.15;
            source.connect(gain);
            gain.connect(audioCtx.destination);
            source.start(0);
        };
    }

    function playEatSound() {
        if (eatAudio.play) eatAudio.play();
    }

    // ============ CANVAS ============
    function resizeCanvas() {
        canvasWidth = window.innerWidth;
        canvasHeight = window.innerHeight;
        canvas.width = canvasWidth * dpr;
        canvas.height = canvasHeight * dpr;
        canvas.style.width = canvasWidth + 'px';
        canvas.style.height = canvasHeight + 'px';
        ctx.scale(dpr, dpr);
    }

    // ============ ENTITIES ============
    class Cell {
        constructor(x, y, radius, color, isPlayer = false, name = '', isBot = false) {
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.mass = Math.round(radius * CONFIG.MASS_TO_RADIUS);
            this.color = color;
            this.isPlayer = isPlayer;
            this.name = name;
            this.isBot = isBot;
            this.vx = 0;
            this.vy = 0;
            this.targetX = x;
            this.targetY = y;
        }

        get radius() { return this._radius; }
        set radius(r) {
            this._radius = Math.max(CONFIG.MIN_CELL_RADIUS, Math.min(CONFIG.MAX_CELL_RADIUS, r));
            this.mass = Math.round(this._radius * CONFIG.MASS_TO_RADIUS);
        }

        update(dt) {
            if (this.isPlayer) return; // Player controlled by input
            
            // Bot AI
            if (this.isBot) {
                this.botAI();
            }
            
            // Apply velocity
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            
            // Keep in world bounds
            const margin = this.radius;
            this.x = clamp(this.x, margin, CONFIG.WORLD_SIZE - margin);
            this.y = clamp(this.y, margin, CONFIG.WORLD_SIZE - margin);
            
            // Friction
            this.vx *= 0.98;
            this.vy *= 0.98;
        }

        botAI() {
            // Find nearest food or smaller cell
            let target = null;
            let minDist = Infinity;
            
            // Target food
            for (const f of food) {
                const d = dist(this.x, this.y, f.x, f.y);
                if (d < minDist) {
                    minDist = d;
                    target = f;
                }
            }
            
            // Target smaller cells
            for (const c of cells) {
                if (c === this) continue;
                if (c.radius < this.radius / CONFIG.EAT_THRESHOLD) {
                    const d = dist(this.x, this.y, c.x, c.y);
                    if (d < minDist) {
                        minDist = d;
                        target = c;
                    }
                }
            }
            
            // Flee from larger cells
            for (const c of cells) {
                if (c === this) continue;
                if (c.radius > this.radius * CONFIG.EAT_THRESHOLD) {
                    const d = dist(this.x, this.y, c.x, c.y);
                    if (d < 200) {
                        const angle = Math.atan2(this.y - c.y, this.x - c.x);
                        const force = (200 - d) / 200 * 50;
                        this.vx += Math.cos(angle) * force;
                        this.vy += Math.sin(angle) * force;
                    }
                }
            }
            
            // Move toward target
            if (target) {
                const angle = Math.atan2(target.y - this.y, target.x - this.x);
                const speed = this.getSpeed();
                this.vx += Math.cos(angle) * speed * 0.5;
                this.vy += Math.sin(angle) * speed * 0.5;
            }
        }

        getSpeed() {
            const base = CONFIG.PLAYER_SPEED_BASE;
            const decay = Math.pow(this.radius / CONFIG.INITIAL_PLAYER_RADIUS, CONFIG.SPEED_DECAY_FACTOR);
            return Math.max(CONFIG.MIN_SPEED, base / decay);
        }

        canEat(other) {
            return this.radius > other.radius * CONFIG.EAT_THRESHOLD;
        }

        eat(other) {
            const gainedMass = other.mass;
            this.mass += gainedMass;
            this.radius = Math.sqrt(this.mass / Math.PI * 2); // Approximate
        }

        draw(ctx, camX, camY, scale) {
            const sx = (this.x - camX) * scale;
            const sy = (this.y - camY) * scale;
            const sr = this.radius * scale;
            
            if (sx + sr < 0 || sx - sr > canvasWidth || sy + sr < 0 || sy - sr > canvasHeight) {
                return; // Off screen
            }
            
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            
            // Border for player
            if (this.isPlayer) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3 / (dpr * scale);
                ctx.stroke();
            }
            
            // Name label
            if ((this.isPlayer || this.isBot) && this.name && this.radius > 15) {
                ctx.font = `${Math.max(10, 14 / scale)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3 / (dpr * scale);
                const textY = sy + sr + 16 / scale;
                ctx.strokeText(this.name, sx, textY);
                ctx.fillText(this.name, sx, textY);
            }
        }
    }

    class Food {
        constructor() {
            this.respawn();
        }
        
        respawn() {
            const margin = CONFIG.FOOD_SPAWN_MARGIN;
            this.x = rand(margin, CONFIG.WORLD_SIZE - margin);
            this.y = rand(margin, CONFIG.WORLD_SIZE - margin);
            this.radius = CONFIG.FOOD_RADIUS;
            this.color = CONFIG.FOOD_COLORS[randInt(0, CONFIG.FOOD_COLORS.length - 1)];
        }
        
        draw(ctx, camX, camY, scale) {
            const sx = (this.x - camX) * scale;
            const sy = (this.y - camY) * scale;
            const sr = this.radius * scale;
            
            if (sx + sr < 0 || sx - sr > canvasWidth || sy + sr < 0 || sy - sr > canvasHeight) return;
            
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }
    }

    // ============ INITIALIZATION ============
    function initGame() {
        // Create food
        food = [];
        for (let i = 0; i < CONFIG.FOOD_COUNT; i++) {
            food.push(new Food());
        }
        
        // Create player
        const startX = CONFIG.WORLD_SIZE / 2;
        const startY = CONFIG.WORLD_SIZE / 2;
        const playerColor = '#4ecdc4';
        
        player = new Cell(startX, startY, CONFIG.INITIAL_PLAYER_RADIUS, playerColor, true, playerName || 'Guest');
        cells = [player];
        
        // Create bots
        bots = [];
        for (let i = 0; i < CONFIG.BOT_COUNT; i++) {
            const angle = rand(0, Math.PI * 2);
            const dist = rand(300, 800);
            const bx = startX + Math.cos(angle) * dist;
            const by = startY + Math.sin(angle) * dist;
            const botRadius = rand(CONFIG.INITIAL_BOT_RADIUS, CONFIG.INITIAL_BOT_RADIUS + 5);
            const botColor = CONFIG.BOT_COLORS[i % CONFIG.BOT_COLORS.length];
            const bot = new Cell(bx, by, botRadius, botColor, false, `Bot ${i + 1}`, true);
            cells.push(bot);
            bots.push(bot);
        }
        
        // Camera starts on player
        camera.x = player.x;
        camera.y = player.y;
    }

    // ============ INPUT ============
    function setupInput() {
        // Pointer events (mouse + touch)
        canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
        canvas.addEventListener('pointermove', onPointerMove, { passive: true });
        canvas.addEventListener('pointerup', onPointerUp, { passive: true });
        canvas.addEventListener('pointerleave', onPointerUp, { passive: true });
        canvas.addEventListener('pointercancel', onPointerUp, { passive: true });
        
        // Prevent context menu
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    function onPointerDown(e) {
        isPointerDown = true;
        updateTargetFromEvent(e);
    }

    function onPointerMove(e) {
        if (isPointerDown) {
            updateTargetFromEvent(e);
        }
    }

    function onPointerUp(e) {
        isPointerDown = false;
    }

    function updateTargetFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches?.[0]?.clientX ?? 0);
        const clientY = e.clientY || (e.touches?.[0]?.clientY ?? 0);
        
        // Convert screen coords to world coords
        targetPos.x = camera.x + (clientX - rect.left) / (canvasWidth / CONFIG.WORLD_SIZE * 0.8); // rough
        targetPos.y = camera.y + (clientY - rect.top) / (canvasHeight / CONFIG.WORLD_SIZE * 0.8);
        
        // More accurate conversion
        const scale = Math.min(canvasWidth, canvasHeight) / (camera.scale || (Math.min(canvasWidth, canvasHeight) / 800));
        targetPos.x = camera.x + (clientX - rect.left - canvasWidth / 2) / scale;
        targetPos.y = camera.y + (clientY - rect.top - canvasHeight / 2) / scale;
    }

    // Better pointer handling
    function getWorldPosFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches?.[0]?.clientX ?? 0);
        const clientY = e.clientY || (e.touches?.[0]?.clientY ?? 0);
        
        // Calculate scale: world units per screen pixel
        const scaleX = canvasWidth / CONFIG.WORLD_SIZE;
        const scaleY = canvasHeight / CONFIG.WORLD_SIZE;
        
        // World position = camera + (screenPos - screenCenter) / scale
        const screenCenterX = canvasWidth / 2;
        const screenCenterY = canvasHeight / 2;
        
        return {
            x: camera.x + (clientX - rect.left - screenCenterX) / scaleX,
            y: camera.y + (clientY - rect.top - screenCenterY) / scaleY
        };
    }

    // Replace the updateTargetFromEvent with better version
    function onPointerDown(e) {
        isPointerDown = true;
        const pos = getWorldPosFromEvent(e);
        targetPos.x = pos.x;
        targetPos.y = pos.y;
    }

    function onPointerMove(e) {
        if (isPointerDown) {
            const pos = getWorldPosFromEvent(e);
            targetPos.x = pos.x;
            targetPos.y = pos.y;
        }
    }

    // ============ GAME LOOP ============
    function gameLoop(time) {
        const dt = Math.min((time - lastTime) / 1000, 1/30); // Cap dt
        lastTime = time;
        
        if (!gameRunning) return;
        
        update(dt);
        render();
        
        animationId = requestAnimationFrame(gameLoop);
    }

    function update(dt) {
        // Update player movement toward target
        if (player) {
            const dx = targetPos.x - player.x;
            const dy = targetPos.y - player.y;
            const distToTarget = Math.hypot(dx, dy);
            
            if (distToTarget > 5) {
                const speed = player.getSpeed();
                const moveX = (dx / distToTarget) * speed;
                const moveY = (dy / distToTarget) * speed;
                
                player.vx = moveX;
                player.vy = moveY;
                
                player.x += player.vx * dt;
                player.y += player.vy * dt;
            } else {
                player.vx = 0;
                player.vy = 0;
            }
            
            // World bounds
            const margin = player.radius;
            player.x = clamp(player.x, margin, CONFIG.WORLD_SIZE - margin);
            player.y = clamp(player.y, margin, CONFIG.WORLD_SIZE - margin);
        }
        
        // Update all cells
        for (const cell of cells) {
            cell.update(dt);
        }
        
        // Collision detection
        handleCollisions();
        
        // Update camera
        updateCamera(dt);
        
        // Update HUD
        updateHUD();
    }

    function handleCollisions() {
        // Player eats food
        for (let i = food.length - 1; i >= 0; i--) {
            const f = food[i];
            const d = dist(player.x, player.y, f.x, f.y);
            if (d < player.radius + f.radius) {
                player.eat(f);
                food.splice(i, 1);
                score = player.mass;
                playEatSound();
            }
        }
        
        // Cell-cell collisions
        for (let i = cells.length - 1; i >= 0; i--) {
            const a = cells[i];
            if (a === player) continue;
            
            const d = dist(player.x, player.y, a.x, a.y);
            if (d < player.radius + a.radius) {
                if (player.canEat(a)) {
                    // Player eats bot/cell
                    player.eat(a);
                    const idx = cells.indexOf(a);
                    if (idx > -1) cells.splice(idx, 1);
                    const botIdx = bots.indexOf(a);
                    if (botIdx > -1) bots.splice(botIdx, 1);
                    score = player.mass;
                    playEatSound();
                    
                    // Spawn new bot to replace
                    setTimeout(spawnBot, 2000);
                } else if (a.canEat(player)) {
                    // Player dies
                    gameOver();
                    return;
                }
            }
        }
        
        // Bot-bot and bot-food collisions (simplified)
        for (let i = bots.length - 1; i >= 0; i--) {
            const bot = bots[i];
            
            // Bot eats food
            for (let j = food.length - 1; j >= 0; j--) {
                const f = food[j];
                const d = dist(bot.x, bot.y, f.x, f.y);
                if (d < bot.radius + f.radius) {
                    bot.eat(f);
                    food.splice(j, 1);
                }
            }
            
            // Bot-bot
            for (let j = bots.length - 1; j >= 0; j--) {
                if (i === j) continue;
                const other = bots[j];
                const d = dist(bot.x, bot.y, other.x, other.y);
                if (d < bot.radius + other.radius) {
                    if (bot.canEat(other)) {
                        bot.eat(other);
                        const idx = cells.indexOf(other);
                        if (idx > -1) cells.splice(idx, 1);
                        const botIdx = bots.indexOf(other);
                        if (botIdx > -1) bots.splice(botIdx, 1);
                    } else if (other.canEat(bot)) {
                        other.eat(bot);
                        const idx = cells.indexOf(bot);
                        if (idx > -1) cells.splice(idx, 1);
                        const botIdx = bots.indexOf(bot);
                        if (botIdx > -1) bots.splice(botIdx, 1);
                    }
                }
            }
        }
        
        // Maintain food count
        while (food.length < CONFIG.FOOD_COUNT) {
            food.push(new Food());
        }
    }

    function spawnBot() {
        if (!gameRunning) return;
        const margin = 200;
        const bx = rand(margin, CONFIG.WORLD_SIZE - margin);
        const by = rand(margin, CONFIG.WORLD_SIZE - margin);
        const botRadius = rand(CONFIG.INITIAL_BOT_RADIUS, CONFIG.INITIAL_BOT_RADIUS + 10);
        const botColor = CONFIG.BOT_COLORS[randInt(0, CONFIG.BOT_COLORS.length - 1)];
        const bot = new Cell(bx, by, botRadius, botColor, false, `Bot ${bots.length + 1}`, true);
        cells.push(bot);
        bots.push(bot);
    }

    function updateCamera(dt) {
        if (!player) return;
        
        // Smooth camera follow with deadzone
        const targetX = player.x;
        const targetY = player.y;
        
        const dx = targetX - camera.x;
        const dy = targetY - camera.y;
        const distToTarget = Math.hypot(dx, dy);
        
        // Deadzone
        const deadzone = Math.max(canvasWidth, canvasHeight) * CONFIG.CAMERA_DEADZONE / 2;
        if (distToTarget > deadzone) {
            const factor = CONFIG.CAMERA_LERP * (distToTarget / deadzone);
            camera.x += dx * Math.min(factor, 1);
            camera.y += dy * Math.min(factor, 1);
        } else {
            camera.x += dx * CONFIG.CAMERA_LERP;
            camera.y += dy * CONFIG.CAMERA_LERP;
        }
        
        // Clamp camera to world
        const viewW = canvasWidth / getScale();
        const viewH = canvasHeight / getScale();
        camera.x = clamp(camera.x, viewW / 2, CONFIG.WORLD_SIZE - viewW / 2);
        camera.y = clamp(camera.y, viewH / 2, CONFIG.WORLD_SIZE - viewH / 2);
    }

    function getScale() {
        // Dynamic scale based on player size
        const baseScale = Math.min(canvasWidth, canvasHeight) / 800;
        const sizeFactor = Math.max(0.4, 30 / player.radius);
        return baseScale * sizeFactor;
    }

    // ============ RENDERING ============
    function render() {
        const scale = getScale();
        
        // Clear
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // World transform
        ctx.save();
        ctx.scale(1, 1); // Reset
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.scale(scale, scale);
        ctx.translate(-camera.x, -camera.y);
        
        // Grid background
        drawGrid();
        
        // Draw food
        for (const f of food) {
            f.draw(ctx, camera.x, camera.y, 1);
        }
        
        // Draw cells (bots first, then player on top)
        const sortedCells = [...cells].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
        for (const cell of sortedCells) {
            cell.draw(ctx, camera.x, camera.y, 1);
        }
        
        ctx.restore();
    }

    function drawGrid() {
        const gridSize = 50;
        const startX = Math.floor(camera.x / gridSize) * gridSize;
        const startY = Math.floor(camera.y / gridSize) * gridSize;
        const endX = camera.x + canvasWidth / getScale();
        const endY = camera.y + canvasHeight / getScale();
        
        ctx.strokeStyle = 'rgba(255,255,255,0.02)';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        for (let x = startX; x <= endX; x += gridSize) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        for (let y = startY; y <= endY; y += gridSize) {
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
        }
        ctx.stroke();
    }

    // ============ UI ============
    function updateHUD() {
        if (!player) return;
        
        document.getElementById('mass-value').textContent = player.mass;
        score = player.mass;
        
        // Leaderboard
        const sorted = [...cells].sort((a, b) => b.mass - a.mass);
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = '';
        
        sorted.slice(0, CONFIG.LEADERBOARD_MAX).forEach((cell, i) => {
            const li = document.createElement('li');
            if (cell.isPlayer) li.classList.add('you');
            li.innerHTML = `
                <span class="rank">#${i + 1}</span>
                <span class="name">${cell.name}</span>
                <span class="mass">${cell.mass}</span>
            `;
            list.appendChild(li);
        });
    }

    function gameOver() {
        gameRunning = false;
        
        if (ambientAudio.pause) ambientAudio.pause();
        
        // Calculate rank
        const sorted = [...cells].sort((a, b) => b.mass - a.mass);
        const rank = sorted.findIndex(c => c === player) + 1;
        
        document.getElementById('final-mass').textContent = player.mass;
        document.getElementById('final-rank').textContent = `#${rank}`;
        
        showScreen('death-screen');
    }

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    // ============ START / RESTART ============
    function startGame() {
        const nameInput = document.getElementById('player-name');
        playerName = nameInput.value.trim() || 'Guest';
        
        // Init audio on first interaction
        initAudio();
        if (ambientAudio.play) ambientAudio.play();
        
        // Reset state
        cells = [];
        food = [];
        bots = [];
        score = 10;
        gameRunning = true;
        
        initGame();
        
        showScreen('game-screen');
        lastTime = performance.now();
        animationId = requestAnimationFrame(gameLoop);
    }

    function restartGame() {
        // Clean up
        if (animationId) cancelAnimationFrame(animationId);
        
        // Reset audio
        if (ambientAudio.pause) ambientAudio.pause();
        
        // Start fresh
        startGame();
    }

    // ============ EVENT LISTENERS ============
    function setupEventListeners() {
        document.getElementById('play-btn').addEventListener('click', startGame);
        document.getElementById('play-again-btn').addEventListener('click', restartGame);
        
        // Enter key on name input
        document.getElementById('player-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') startGame();
        });
        
        // Resize
        window.addEventListener('resize', () => {
            resizeCanvas();
        });
        
        // Prevent scroll on touch
        document.body.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    }

    // ============ INIT ============
    function init() {
        resizeCanvas();
        setupInput();
        setupEventListeners();
        showScreen('start-screen');
    }

    // Start
    init();
})();