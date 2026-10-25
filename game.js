// Agar.io Clone - Mobile-first implementation
// Based on sam46/Agar.io-Clone NoServerDemo approach: simple pan camera, no zoom

// ============ CONFIG ============
const CONFIG = {
    WORLD_SIZE: 6000,
    FOOD_COUNT: 2000,
    INITIAL_PLAYER_RADIUS: 25,
    FOOD_RADIUS: 8,
    BOT_COUNT: 8,
    BOT_MIN_RADIUS: 15,
    BOT_MAX_RADIUS: 80,
    PLAYER_SPEED_BASE: 8,
    BOT_SPEED_BASE: 5,
    CAMERA_LERP: 0.15,
};

// ============ STATE ============
let canvas, ctx;
let canvasWidth = 0, canvasHeight = 0;
let dpr = window.devicePixelRatio || 1;

let worldWidth = CONFIG.WORLD_SIZE;
let worldHeight = CONFIG.WORLD_SIZE;

let player = null;
let cells = [];
let food = [];
let bots = [];

let cameraX = 0, cameraY = 0;
let targetX = 0, targetY = 0;

let gameState = 'start-screen';
let playerName = 'Guest';
let score = 0;

let audioCtx = null;
let ambientOsc = null;
let ambientGain = null;
let isAudioPlaying = false;

let lastTime = 0;
let animationId = null;

const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const deathScreen = document.getElementById('death-screen');
const playerNameInput = document.getElementById('player-name');
const playBtn = document.getElementById('play-btn');
const playAgainBtn = document.getElementById('play-again-btn');
const finalScoreEl = document.getElementById('final-mass');
const scoreEl = document.getElementById('mass-value');
const leaderboardEl = document.getElementById('leaderboard-list');
const deathLeaderboardEl = document.getElementById('leaderboard-list'); // reuse same list

const BOT_NAMES = ['Bot-1', 'Bot-2', 'Bot-3', 'Bot-4', 'Bot-5', 'Bot-6', 'Bot-7', 'Bot-8'];
const COLORS = ['#4ecdc4', '#ff6b6b', '#ffe66d', '#95e1d3', '#f38181', '#aa96da', '#fcbad3', '#a8d8ea', '#ffd3b6', '#caffbf'];

// ============ UTILITIES ============
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function distSq(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}

function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// ============ CLASSES ============
class Cell {
    constructor(x, y, radius, color, isPlayer = false, name = '') {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.isPlayer = isPlayer;
        this.name = name;
        this.vx = 0;
        this.vy = 0;
        this.targetX = x;
        this.targetY = y;
        this.maxSpeed = isPlayer ? CONFIG.PLAYER_SPEED_BASE : CONFIG.BOT_SPEED_BASE;
    }

    get mass() {
        return this.radius * this.radius;
    }

    update(dt) {
        if (this.isPlayer) {
            // Player moves toward target (set by touch/mouse)
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1) {
                const speed = this.maxSpeed * Math.min(1, dist / 100);
                this.vx = (dx / dist) * speed;
                this.vy = (dy / dist) * speed;
            } else {
                this.vx = 0;
                this.vy = 0;
            }
        } else {
            // Bot AI: simple seek food, flee larger cells
            this.updateBotAI(dt);
        }

        // Apply velocity
        this.x += this.vx * dt * 60;
        this.y += this.vy * dt * 60;

        // Clamp to world bounds with margin
        const margin = this.radius;
        this.x = clamp(this.x, margin, worldWidth - margin);
        this.y = clamp(this.y, margin, worldHeight - margin);

        // Slow down larger cells
        this.maxSpeed = this.isPlayer 
            ? CONFIG.PLAYER_SPEED_BASE * Math.max(0.3, 1 - this.radius / 300)
            : CONFIG.BOT_SPEED_BASE * Math.max(0.3, 1 - this.radius / 300);
    }

    updateBotAI(dt) {
        // Find nearest food
        let nearestFood = null;
        let nearestFoodDist = Infinity;
        for (const f of food) {
            const d = distSq(this.x, this.y, f.x, f.y);
            if (d < nearestFoodDist) {
                nearestFoodDist = d;
                nearestFood = f;
            }
        }

        // Find nearest threat (larger cell)
        let nearestThreat = null;
        let nearestThreatDist = Infinity;
        for (const c of cells) {
            if (c === this) continue;
            if (c.radius > this.radius * 1.1) {
                const d = distSq(this.x, this.y, c.x, c.y);
                if (d < nearestThreatDist) {
                    nearestThreatDist = d;
                    nearestThreat = c;
                }
            }
        }

        // Decide behavior
        if (nearestThreat && nearestThreatDist < 300 * 300) {
            // Flee from threat
            const dx = this.x - nearestThreat.x;
            const dy = this.y - nearestThreat.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                this.vx = (dx / dist) * this.maxSpeed;
                this.vy = (dy / dist) * this.maxSpeed;
            }
        } else if (nearestFood) {
            // Seek food
            const dx = nearestFood.x - this.x;
            const dy = nearestFood.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                this.vx = (dx / dist) * this.maxSpeed * 0.8;
                this.vy = (dy / dist) * this.maxSpeed * 0.8;
            }
        } else {
            // Wander
            this.vx *= 0.95;
            this.vy *= 0.95;
        }
    }

    draw(ctx, camX, camY) {
        const sx = this.x - camX;
        const sy = this.y - camY;
        const sr = this.radius;

        // Off-screen check in screen coordinates
        if (sx + sr < 0 || sx - sr > canvasWidth || sy + sr < 0 || sy - sr > canvasHeight) {
            return;
        }

        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        // Border for player
        if (this.isPlayer) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3 / dpr;
            ctx.stroke();
        }

        // Name label
        if ((this.isPlayer || !this.isPlayer) && this.name && this.radius > 15) {
            ctx.font = `${Math.max(10, 12)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3 / dpr;
            const textY = sy + sr + 14;
            ctx.strokeText(this.name, sx, textY);
            ctx.fillText(this.name, sx, textY);
        }
    }
}

class Food {
    constructor() {
        this.x = Math.random() * worldWidth;
        this.y = Math.random() * worldHeight;
        this.radius = CONFIG.FOOD_RADIUS;
        this.color = randomColor();
    }

    draw(ctx, camX, camY) {
        const sx = this.x - camX;
        const sy = this.y - camY;
        const sr = this.radius;

        if (sx + sr < 0 || sx - sr > canvasWidth || sy + sr < 0 || sy - sr > canvasHeight) {
            return;
        }

        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

// ============ INITIALIZATION ============
function resizeCanvas() {
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initGame() {
    // Resize canvas first
    resizeCanvas();

    // Create food
    food = [];
    for (let i = 0; i < CONFIG.FOOD_COUNT; i++) {
        food.push(new Food());
    }

    // Create player at world center
    const startX = worldWidth / 2;
    const startY = worldHeight / 2;
    const playerColor = '#4ecdc4';

    player = new Cell(startX, startY, CONFIG.INITIAL_PLAYER_RADIUS, playerColor, true, playerName || 'Guest');
    cells = [player];

    // Create bots
    bots = [];
    for (let i = 0; i < CONFIG.BOT_COUNT; i++) {
        const x = Math.random() * worldWidth;
        const y = Math.random() * worldHeight;
        const radius = CONFIG.BOT_MIN_RADIUS + Math.random() * (CONFIG.BOT_MAX_RADIUS - CONFIG.BOT_MIN_RADIUS);
        const bot = new Cell(x, y, radius, randomColor(), false, BOT_NAMES[i]);
        cells.push(bot);
        bots.push(bot);
    }

    // Initialize camera at player position
    cameraX = player.x - canvasWidth / 2;
    cameraY = player.y - canvasHeight / 2;
    targetX = cameraX;
    targetY = cameraY;

    // Clamp camera to world
    clampCamera();

    score = 0;
    updateScore();
    updateLeaderboard();

    // Start audio
    initAudio();
    startAmbient();
}

function clampCamera() {
    cameraX = clamp(cameraX, 0, worldWidth - canvasWidth);
    cameraY = clamp(cameraY, 0, worldHeight - canvasHeight);
}

// ============ CAMERA ============
function updateCamera(dt) {
    if (!player) return;

    // Target camera to center on player
    targetX = player.x - canvasWidth / 2;
    targetY = player.y - canvasHeight / 2;

    // Smooth follow
    cameraX += (targetX - cameraX) * CONFIG.CAMERA_LERP;
    cameraY += (targetY - cameraY) * CONFIG.CAMERA_LERP;

    clampCamera();
}

// ============ COLLISION ============
function checkCollisions() {
    if (!player) return;

    // Player eats food
    for (let i = food.length - 1; i >= 0; i--) {
        const f = food[i];
        const dx = player.x - f.x;
        const dy = player.y - f.y;
        const distSq = dx * dx + dy * dy;
        const radiusSum = player.radius + f.radius;

        if (distSq < radiusSum * radiusSum) {
            // Eat food
            player.radius += 0.5;
            food.splice(i, 1);
            playEatSound();
        }
    }

    // Player eats bots / bots eat each other
    for (let i = cells.length - 1; i >= 0; i--) {
        const c = cells[i];
        if (c === player) continue;

        const dx = player.x - c.x;
        const dy = player.y - c.y;
        const distSq = dx * dx + dy * dy;
        const radiusSum = player.radius + c.radius;

        if (distSq < radiusSum * radiusSum) {
            if (player.radius > c.radius * 1.1) {
                // Player eats bot
                player.radius += c.radius * 0.3;
                const idx = cells.indexOf(c);
                if (idx > -1) cells.splice(idx, 1);
                const botIdx = bots.indexOf(c);
                if (botIdx > -1) bots.splice(botIdx, 1);
                playEatSound();
            } else if (c.radius > player.radius * 1.1) {
                // Bot eats player - GAME OVER
                gameOver();
                return;
            }
        }
    }

    // Bot eats food
    for (const bot of bots) {
        for (let i = food.length - 1; i >= 0; i--) {
            const f = food[i];
            const dx = bot.x - f.x;
            const dy = bot.y - f.y;
            const distSq = dx * dx + dy * dy;
            const radiusSum = bot.radius + f.radius;

            if (distSq < radiusSum * radiusSum) {
                bot.radius += 0.3;
                food.splice(i, 1);
            }
        }
    }

    // Bot eats bot
    for (let i = bots.length - 1; i >= 0; i--) {
        const bot = bots[i];
        for (let j = bots.length - 1; j >= 0; j--) {
            if (i === j) continue;
            const other = bots[j];
            const dx = bot.x - other.x;
            const dy = bot.y - other.y;
            const distSq = dx * dx + dy * dy;
            const radiusSum = bot.radius + other.radius;

            if (distSq < radiusSum * radiusSum) {
                if (bot.radius > other.radius * 1.15) {
                    bot.radius += other.radius * 0.3;
                    const idx = cells.indexOf(other);
                    if (idx > -1) cells.splice(idx, 1);
                    bots.splice(j, 1);
                }
            }
        }
    }

    // Respawn food
    while (food.length < CONFIG.FOOD_COUNT) {
        food.push(new Food());
    }

    // Respawn bots
    while (bots.length < CONFIG.BOT_COUNT) {
        const x = Math.random() * worldWidth;
        const y = Math.random() * worldHeight;
        const radius = CONFIG.BOT_MIN_RADIUS + Math.random() * (CONFIG.BOT_MAX_RADIUS - CONFIG.BOT_MIN_RADIUS);
        const bot = new Cell(x, y, radius, randomColor(), false, BOT_NAMES[bots.length % BOT_NAMES.length]);
        cells.push(bot);
        bots.push(bot);
    }

    updateScore();
    updateLeaderboard();
}

function updateScore() {
    if (player) {
        score = Math.floor(player.mass);
        scoreEl.textContent = `Mass: ${score}`;
    }
}

function updateLeaderboard() {
    const allCells = [...cells].sort((a, b) => b.mass - a.mass);
    const top5 = allCells.slice(0, 5);
    
    leaderboardEl.innerHTML = '';
    
    top5.forEach((cell, i) => {
        const li = document.createElement('li');
        const isPlayer = cell.isPlayer ? ' (You)' : '';
        li.innerHTML = `<span>${i + 1}. ${cell.name}${isPlayer}</span><span>${Math.floor(cell.mass)}</span>`;
        if (cell.isPlayer) li.style.color = '#4ecdc4';
        leaderboardEl.appendChild(li);
    });
}

// ============ RENDERING ============
function drawGrid() {
    const gridSize = 100;
    const startX = Math.floor(cameraX / gridSize) * gridSize;
    const startY = Math.floor(cameraY / gridSize) * gridSize;
    const endX = startX + canvasWidth + gridSize;
    const endY = startY + canvasHeight + gridSize;

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1 / dpr;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
        const sx = x - cameraX;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, canvasHeight);
    }
    for (let y = startY; y <= endY; y += gridSize) {
        const sy = y - cameraY;
        ctx.moveTo(0, sy);
        ctx.lineTo(canvasWidth, sy);
    }
    ctx.stroke();
}

function render() {
    // Clear
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw grid
    drawGrid();

    // Draw food
    for (const f of food) {
        f.draw(ctx, cameraX, cameraY);
    }

    // Draw cells (bots first, then player on top)
    const sortedCells = [...cells].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const cell of sortedCells) {
        cell.draw(ctx, cameraX, cameraY);
    }
}

// ============ GAME LOOP ============
function gameLoop(timestamp) {
    if (gameState !== 'game-screen') return;

    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Cap dt
    const cappedDt = Math.min(dt, 1/30);

    // Update
    for (const cell of cells) {
        cell.update(cappedDt);
    }

    checkCollisions();
    updateCamera(cappedDt);

    // Render
    render();

    animationId = requestAnimationFrame(gameLoop);
}

// ============ AUDIO ============
function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.warn('AudioContext not supported');
    }
}

function startAmbient() {
    if (!audioCtx || isAudioPlaying) return;
    
    // Resume audio context if suspended
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Simple ambient drone
    ambientOsc = audioCtx.createOscillator();
    ambientGain = audioCtx.createGain();
    
    ambientOsc.type = 'sine';
    ambientOsc.frequency.value = 65; // Low C
    ambientGain.gain.value = 0.02;
    
    ambientOsc.connect(ambientGain);
    ambientGain.connect(audioCtx.destination);
    ambientOsc.start();
    isAudioPlaying = true;
}

function stopAmbient() {
    if (ambientOsc) {
        ambientOsc.stop();
        ambientOsc.disconnect();
        ambientOsc = null;
    }
    if (ambientGain) {
        ambientGain.disconnect();
        ambientGain = null;
    }
    isAudioPlaying = false;
}

function playEatSound() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 800;
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);
    
    gain.gain.value = 0.05;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
}

// ============ SCREEN MANAGEMENT ============
function showScreen(screenName) {
    startScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    deathScreen.classList.remove('active');
    
    document.getElementById(screenName).classList.add('active');
    gameState = screenName;
}

function startGame() {
    playerName = playerNameInput.value.trim() || 'Guest';
    showScreen('game-screen');
    initGame();
    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
}

function gameOver() {
    stopAmbient();
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    finalScoreEl.textContent = score;
    showScreen('death-screen');
}

function restartGame() {
    showScreen('start-screen');
    playerNameInput.value = '';
    playerNameInput.focus();
}

// ============ INPUT ============
function getWorldPosFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    // Convert screen position to world position
    return {
        x: cameraX + canvasX,
        y: cameraY + canvasY
    };
}

function onPointerDown(e) {
    if (gameState !== 'game-screen') return;
    e.preventDefault();
    const pos = getWorldPosFromEvent(e);
    if (player) {
        player.targetX = pos.x;
        player.targetY = pos.y;
    }
}

function onPointerMove(e) {
    if (gameState !== 'game-screen') return;
    e.preventDefault();
    const pos = getWorldPosFromEvent(e);
    if (player) {
        player.targetX = pos.x;
        player.targetY = pos.y;
    }
}

function onPointerUp(e) {
    if (gameState !== 'game-screen') return;
    // Keep target at last position (player continues moving toward it)
}

function setupInput() {
    // Touch events
    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    canvas.addEventListener('touchmove', onPointerMove, { passive: false });
    canvas.addEventListener('touchend', onPointerUp, { passive: false });
    
    // Mouse events
    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('mouseleave', onPointerUp);
    
    // Prevent context menu
    canvas.addEventListener('contextmenu', e => e.preventDefault());
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
    // Play button
    playBtn.addEventListener('click', startGame);
    
    // Enter key in name input
    playerNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') startGame();
    });
    
    // Play again button
    playAgainBtn.addEventListener('click', restartGame);
    
    // Window resize
    window.addEventListener('resize', resizeCanvas);
    
    // Input
    setupInput();
    
    // Focus name input on start screen
    playerNameInput.focus();
}

// ============ INIT ============
function init() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    
    setupEventListeners();
    showScreen('start-screen');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}