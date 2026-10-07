// POL-PONG — module chargé par game.js.
// Les boutons du markup appellent window.PongApp (attributs onclick).
/**
 * AUDIO ENGINE (Web Audio API)
 */
const SoundEngine = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },
  playHit() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  },
  playScore() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, this.ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  },
  playPowerup() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(800, this.ctx.currentTime + 0.15);
    osc.frequency.linearRampToValueAtTime(400, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
};

/**
 * CACHE DES IMAGES AVATARS
 */
const ImageCache = {
  cache: new Map(),
  get(src) {
    if (!src) return null;
    if (this.cache.has(src)) return this.cache.get(src);
    const img = new Image();
    img.src = src;
    this.cache.set(src, img);
    return img;
  }
};

/**
 * GESTIONNAIRE DE TIMERS CENTRALISÉ
 */
const TimerManager = {
  timeouts: new Set(),
  intervals: new Set(),
  setTimeout(fn, delay) {
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, delay);
    this.timeouts.add(id);
    return id;
  },
  setInterval(fn, delay) {
    const id = setInterval(fn, delay);
    this.intervals.add(id);
    return id;
  },
  clearAll() {
    this.timeouts.forEach(id => clearTimeout(id));
    this.intervals.forEach(id => clearInterval(id));
    this.timeouts.clear();
    this.intervals.clear();
  }
};

/**
 * ÉTAT GLOBAL DU JEU
 */
class GameState {
  constructor() {
    this.running = false;
    this.countdownActive = false;
    this.countdownValue = 0;
    this.powerupTimeLeft = 20;
    this.mode = 'quick';
    this.difficulty = 'easy';
    this.selectedCamp = 'ps';
    this.currentMatchMode = 'quick';
    this.playerScore = 0;
    this.opponentScore = 0;
    this.pointPending = false;
    this.campaign = null;

    this.playerCandidate = null;
    this.opponentCandidate = null;

    this.activeEffects = {
      paddleMultiplier: 1,
      ballSpeedMultiplier: 1,
      playerShotBoost: 1,
      opponentShotBoost: 1
    };
  }

  resetEffects() {
    this.activeEffects = {
      paddleMultiplier: 1,
      ballSpeedMultiplier: 1,
      playerShotBoost: 1,
      opponentShotBoost: 1
    };
  }
}

/**
 * APPLICATION PRINCIPALE
 */
const App = (function() {
  const CAMPS = [
    { id: "ps", label: "Primaire socialiste" },
    { id: "gauche", label: "Reste de la gauche" },
    { id: "macron", label: "Macroniste" },
    { id: "rn", label: "Extrême-droite" }
  ];

  const DEFAULT_CANDIDATES = [
    { name: "Raphaël Glucksmann", camp: "ps", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRfF-qAE917M_HjvNF5MmJ5iJTrYbHmzO2hRmfSKbVJg2ZDTLKCEyukNrk&s=10" },
    { name: "Olivier Faure", camp: "ps", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQO1wGsMu95qbAxu0q-SGB3zcvfOWAzdJuGnaeSrrZ_rmZPAlFkrHV-LaJ9&s=10" },
    { name: "Ségolène Royal", camp: "ps", image: "https://photos.tf1.fr/1280/720/en-toute-franchise-segolene-royal-096359-0@3x.webp" },
    { name: "Jean-Luc Mélenchon", camp: "gauche", image: "https://images.rtl.fr/~c/2000v2000/rtl/www/1836240-jean-luc-melenchon-avant-le-20h-de-tf1-ou-il-a-annonce-sa-candidature-a-l-election-presidentielle-francaise-de-2027-le-3-mai-2026.jpg" },
    { name: "François Hollande", camp: "gauche", image: "https://s.yimg.com/lo/mysterio/api/887d3a6fca7a54a7c53e340cea065a18b126b7dc7aa0cb95f1f54a2b49baa973/lightyear_networkapi/resizefit_w960%3Bquality_80%3Bformat_webp/https%3A%2F%2Fmedia.zenfs.com%2Ffr%2Fcapital_268%2Fdc5d595bb483a12e9057b90045032874.jpg" },
    { name: "Marine Tondelier", camp: "gauche", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ25o3Mj4aW9_KYxWjNvgsPiEWFgpJ-P3gJHbE3RZul-0kVQo1MmIL_qUs&s=10" },
    { name: "Fabien Roussel", camp: "gauche", image: "https://io-fsly-bfmtv.cdn.nextradiotv.com/2eCVfJZTD0gEi7lgEwpFoYAh5wc=/420x0:1500x1080/1920x0/images/Fabien-Roussel-secretaire-national-du-PCF-invite-de-BFMTV-RMC-le-16-septembre-2026-2348831.jpg" },
    { name: "Édouard Philippe", camp: "macron", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ79nAgMWuM7WvULv1LjHvk3zdcRbB5bMP6tM8apLAhmXYeKTpDGYRc-8Q&s=10" },
    { name: "Gabriel Attal", camp: "macron", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQm5LheOs4GmJQQxB9NuF0HbMol4YOjiVIg4yy4g7x21TWVDJIXlSFVfMZe&s=10" },
    { name: "Bruno Retailleau", camp: "macron", image: "https://images.rtl.fr/~c/770v513/rtl/www/1743632-bruno-retailleau-a-epinal-le-samedi-22-mars-2025.jpg" },
    { name: "Marine Le Pen", camp: "rn", image: "https://lcp.fr/sites/lcp.fr/files/styles/entete_contenu_1030x570/public/2025-03/Le%20Pen%20TF1.webp?h=33f7e92d&itok=-RfDvkch%201x" },
    { name: "Jordan Bardella", camp: "rn", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTlfPuD9_jg89LNzwMKC-DyAkdS_7Rxigoy0CaB1rD0-ZRsdkYnZR-J1bq_&s=10" },
    { name: "Éric Zemmour", camp: "rn", image: "https://media1.ledevoir.com/images_galerie/originale_1056087_860745/image.jpg?crop=3%3A2%2Csmart&width=1440" }
  ].map((c, i) => ({ id: "default-" + i, ...c }));

  const CAMP_COLORS = { ps: "#E4356B", gauche: "#D8232A", macron: "#F2C230", rn: "#1B3A6B" };
  const PADDLE_CONFIG = { width: 70, height: 14, border: 1.5 };
  const WINNING_SCORE = 5;
  const FONT_DISPLAY = "'Sora', sans-serif";

  const MESSAGES = [
    "Menteur.", "C'est pas ce que vous disiez.", "Vous êtes sûr ?",
    "Belle pirouette.", "On en reparle en 2027.", "C'était dans votre programme ?",
    "Ça commence mal.", "Et un point de plus.", "Les Français apprécieront.", "Merci pour le point."
  ];

  const POWER_UPS = [
    {
      category: "MEDIA", type: "bonus",
      phrase: "Quelle interview ! Le charisme et la verve des plus grands",
      rule: "La raquette s'allonge pendant 5 secondes",
      apply: (state) => state.activeEffects.paddleMultiplier = 1.5,
      reset: (state) => state.activeEffects.paddleMultiplier = 1,
      duration: 5000
    },
    {
      category: "MEDIA", type: "malus",
      phrase: "Oula c'est un naufrage en direct",
      rule: "La raquette est raccourcie pendant 5 secondes",
      apply: (state) => state.activeEffects.paddleMultiplier = 0.6,
      reset: (state) => state.activeEffects.paddleMultiplier = 1,
      duration: 5000
    },
    {
      category: "CAMPAGNE", type: "bonus",
      phrase: "Votre meeting est un carton, vous progressez dans les sondages",
      rule: "La balle ralentit pendant 5 secondes",
      apply: (state) => state.activeEffects.ballSpeedMultiplier = 0.6,
      reset: (state) => state.activeEffects.ballSpeedMultiplier = 1,
      duration: 5000
    },
    {
      category: "CAMPAGNE", type: "malus",
      phrase: "Même votre voisin n'a pas entendu parlé de votre meeting...",
      rule: "La balle accélère pendant 5 secondes",
      apply: (state) => state.activeEffects.ballSpeedMultiplier = 1.5,
      reset: (state) => state.activeEffects.ballSpeedMultiplier = 1,
      duration: 5000
    },
    {
      category: "DÉPLACEMENT", type: "bonus",
      phrase: "Cette séquence au marché de Châteauroux a fait le tour des réseaux...",
      rule: "Pendant 10 secondes, vos tirs accélèrent",
      apply: (state) => state.activeEffects.playerShotBoost = 1.4,
      reset: (state) => state.activeEffects.playerShotBoost = 1,
      duration: 10000
    },
    {
      category: "DÉPLACEMENT", type: "malus",
      phrase: "Personne n'a vu votre déplacement et en plus il pleuvait là-bas",
      rule: "Pendant 10 secondes, les tirs reçus accélèrent",
      apply: (state) => state.activeEffects.opponentShotBoost = 1.4,
      reset: (state) => state.activeEffects.opponentShotBoost = 1,
      duration: 10000
    }
  ];

  const DIFFICULTY_SETTINGS = {
    easy: { speed: 3.0, reaction: 0.72 },
    normal: { speed: 4.2, reaction: 0.88 },
    hard: { speed: 5.6, reaction: 0.98 }
  };

  let state = new GameState();
  let canvas, ctx;
  let animationId = null;
  let lastTime = 0;
  let aiTarget = null;
  let pendingCampaignContinue = null;

  const AI_LINE = 0.28, PLAYER_LINE = 0.72, GOAL_MARGIN = 70, AVATAR_RADIUS = 25;
  const ball = { x: 0, y: 0, vx: 0, vy: 0, radius: 5, speed: 340 };
  const playerPaddle = { x: 0, y: 0, width: PADDLE_CONFIG.width, height: PADDLE_CONFIG.height, color: "#fff" };
  const aiPaddle = { x: 0, y: 0, width: PADDLE_CONFIG.width, height: PADDLE_CONFIG.height, color: "#fff" };

  function init() {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");

    // Préchargement des images d'avatars
    DEFAULT_CANDIDATES.forEach(c => ImageCache.get(c.image));

    window.addEventListener("resize", () => {
      if (state.running || state.countdownActive) resizeCanvas();
    });

    setupControls();
    showSelection();
  }

  function setupControls() {
    let leftPressed = false, rightPressed = false;

    const movePlayerFromPointer = (e) => {
      if (!state.running || state.countdownActive) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      playerPaddle.x = Math.max(0, Math.min(canvas.clientWidth - playerPaddle.width, x - playerPaddle.width / 2));
    };

    canvas.addEventListener("pointermove", movePlayerFromPointer);
    canvas.addEventListener("pointerdown", (e) => {
      SoundEngine.init();
      movePlayerFromPointer(e);
    });

    document.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") leftPressed = true;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") rightPressed = true;
    });

    document.addEventListener("keyup", e => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") leftPressed = false;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") rightPressed = false;
    });

    setInterval(() => {
      if (!state.running || state.countdownActive) return;
      if (leftPressed) playerPaddle.x -= 15;
      if (rightPressed) playerPaddle.x += 15;
      playerPaddle.x = Math.max(0, Math.min(canvas.clientWidth - playerPaddle.width, playerPaddle.x));
    }, 16);
  }

  function hideAllScreens() {
    document.querySelectorAll("#pong section").forEach(s => s.classList.add("hidden"));
  }

  function showSelection() {
    stopGame();
    state.campaign = null;
    hideAllScreens();
    document.getElementById("selectionScreen").classList.remove("hidden");

    populateCampSelect();
    const campSelectEl = document.getElementById("campSelect");
    if (!CAMPS.some(c => c.id === state.selectedCamp)) state.selectedCamp = CAMPS[0].id;
    campSelectEl.value = state.selectedCamp;

    populateCandidateSelect();
    setMode(state.mode);
  }

  function populateCampSelect() {
    const el = document.getElementById("campSelect");
    el.innerHTML = "";
    CAMPS.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.label;
      el.appendChild(opt);
    });
  }

  function setCamp(campId) {
    state.selectedCamp = campId;
    populateCandidateSelect();
  }

  function populateCandidateSelect() {
    const list = DEFAULT_CANDIDATES.filter(c => c.camp === state.selectedCamp);
    const el = document.getElementById("playerSelect");
    el.innerHTML = "";

    list.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      el.appendChild(opt);
    });

    if (list.length > 0) el.value = list[0].id;
    updateCandidatePreview();
  }

  function updateCandidatePreview() {
    const el = document.getElementById("candidatePreviewRow");
    el.innerHTML = "";

    const candidate = DEFAULT_CANDIDATES.find(c => c.id === document.getElementById("playerSelect").value);
    if (!candidate) return;

    el.appendChild(buildAvatarElement(candidate, 52));

    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "candidate-preview-name";
    name.textContent = candidate.name;

    const camp = document.createElement("div");
    camp.className = "candidate-preview-camp";
    camp.textContent = CAMPS.find(c => c.id === candidate.camp)?.label || candidate.camp;

    info.appendChild(name);
    info.appendChild(camp);
    el.appendChild(info);
  }

  function buildAvatarElement(candidate, size) {
    const wrap = document.createElement("div");
    wrap.className = "avatar-circle";
    wrap.style.width = size + "px";
    wrap.style.height = size + "px";

    const color = candidate ? (CAMP_COLORS[candidate.camp] || "#111") : "#ccc";
    wrap.style.borderColor = color;

    if (candidate && candidate.image) {
      const img = document.createElement("img");
      img.src = candidate.image;
      wrap.appendChild(img);
    } else {
      wrap.style.background = color;
      const label = document.createElement("div");
      label.className = "avatar-initials";
      label.style.fontSize = Math.round(size * 0.25) + "px";
      label.textContent = candidate ? initials(candidate.name) : "?";
      wrap.appendChild(label);
    }
    return wrap;
  }

  function initials(name) {
    return name ? name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase() : "?";
  }

  function setMode(newMode) {
    state.mode = newMode;
    document.getElementById("quickModeButton").classList.toggle("active", newMode === "quick");
    document.getElementById("campaignModeButton").classList.toggle("active", newMode === "campaign");
    document.getElementById("difficultyBlock").classList.toggle("hidden", newMode === "campaign");
    document.getElementById("campaignInfo").classList.toggle("hidden", newMode !== "campaign");
    document.getElementById("startButton").textContent = newMode === "campaign" ? "LANCER LA CAMPAGNE" : "JOUER";
  }

  function setDifficulty(level) {
    state.difficulty = level;
    document.querySelectorAll(".difficulty button").forEach(b => b.classList.remove("active"));
    document.getElementById(level + "Button").classList.add("active");
  }

  function startGame() {
    SoundEngine.init();
    stopGame();

    const playerCandidate = DEFAULT_CANDIDATES.find(c => c.id === document.getElementById("playerSelect").value);
    if (!playerCandidate) return;

    if (state.mode === "campaign") {
      startCampaign(playerCandidate);
    } else {
      const pool = DEFAULT_CANDIDATES.filter(c => c.camp !== playerCandidate.camp);
      const opponentCandidate = pool[Math.floor(Math.random() * pool.length)];
      beginMatch(playerCandidate, opponentCandidate, "quick");
    }
  }

  function beginMatch(playerCandidate, opponentCandidate, matchMode) {
    state.currentMatchMode = matchMode;
    state.playerCandidate = playerCandidate;
    state.opponentCandidate = opponentCandidate;
    state.playerScore = 0;
    state.opponentScore = 0;
    state.resetEffects();

    playerPaddle.width = PADDLE_CONFIG.width;
    playerPaddle.color = CAMP_COLORS[playerCandidate.camp] || "#fff";
    aiPaddle.width = PADDLE_CONFIG.width;
    aiPaddle.color = CAMP_COLORS[opponentCandidate.camp] || "#fff";

    hideAllScreens();
    document.getElementById("gameScreen").classList.remove("hidden");
    resizeCanvas();

    document.getElementById("scoreOpponent").textContent = "0";
    document.getElementById("scorePlayer").textContent = "0";

    updatePercentages();
    setupGameDimensions();
    resetBall(Math.random() > 0.5 ? 1 : -1);

    startCountdown(3, () => {
      state.running = true;
      lastTime = performance.now();
      animationId = requestAnimationFrame(gameLoop);
      startPowerupGauge();
    });
  }

  function startPowerupGauge() {
    state.powerupTimeLeft = 20;
    updateGaugeUI();

    TimerManager.setInterval(() => {
      if (!state.running || state.countdownActive) return;

      state.powerupTimeLeft -= 0.1;
      if (state.powerupTimeLeft <= 0) {
        triggerRandomPowerUp();
        state.powerupTimeLeft = 20;
      }
      updateGaugeUI();
    }, 100);
  }

  function updateGaugeUI() {
    const fill = document.getElementById("powerupGauge");
    if (fill) {
      const pct = ((20 - state.powerupTimeLeft) / 20) * 100;
      fill.style.width = Math.min(100, Math.max(0, pct)) + "%";
    }
  }

  function triggerRandomPowerUp() {
    if (!state.running) return;
    const powerUp = POWER_UPS[Math.floor(Math.random() * POWER_UPS.length)];
    const color = CAMP_COLORS[state.playerCandidate.camp] || "#111";

    SoundEngine.playPowerup();
    showStructuredMessage(powerUp, color);

    powerUp.apply(state);
    TimerManager.setTimeout(() => {
      powerUp.reset(state);
    }, powerUp.duration);
  }

  function showStructuredMessage(powerUp, color) {
    const el = document.getElementById("gameMessage");
    if (!el) return;

    el.innerHTML = `
      <div class="msg-category" style="color: ${color}">${powerUp.category} (${powerUp.type.toUpperCase()})</div>
      <div class="msg-phrase">« ${powerUp.phrase} »</div>
      <div class="msg-rule">${powerUp.rule}</div>
    `;

    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");

    TimerManager.setTimeout(() => el.classList.remove("show"), 4000);
  }

  function startCountdown(seconds, onComplete) {
    state.countdownActive = true;
    state.countdownValue = seconds;
    draw();

    const intervalId = TimerManager.setInterval(() => {
      state.countdownValue--;
      if (state.countdownValue <= 0) {
        clearInterval(intervalId);
        state.countdownActive = false;
        if (onComplete) onComplete();
      } else {
        draw();
      }
    }, 1000);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setupGameDimensions();
  }

  function setupGameDimensions() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    aiPaddle.y = height * AI_LINE;
    playerPaddle.y = height * PLAYER_LINE;
    playerPaddle.x = (width - playerPaddle.width) / 2;
    aiPaddle.x = (width - aiPaddle.width) / 2;
  }

  function resetBall(direction) {
    state.pointPending = false;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ball.x = width / 2;
    ball.y = height / 2;
    ball.speed = 340;
    const angle = Math.random() * 0.8 - 0.4;
    ball.vx = Math.sin(angle) * ball.speed;
    ball.vy = Math.cos(angle) * ball.speed * direction;
  }

  function gameLoop(timestamp) {
    if (!state.running) return;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    dt = Math.min(dt, 0.025);

    update(dt);
    draw();
    animationId = requestAnimationFrame(gameLoop);
  }

  function update(dt) {
    playerPaddle.width = PADDLE_CONFIG.width * state.activeEffects.paddleMultiplier;

    updateAI(dt);
    ball.x += ball.vx * dt * state.activeEffects.ballSpeedMultiplier;
    ball.y += ball.vy * dt * state.activeEffects.ballSpeedMultiplier;

    const width = canvas.clientWidth;

    if (ball.x - ball.radius <= 0 && ball.vx < 0) {
      ball.x = ball.radius;
      ball.vx *= -1;
      SoundEngine.playHit();
    }
    if (ball.x + ball.radius >= width && ball.vx > 0) {
      ball.x = width - ball.radius;
      ball.vx *= -1;
      SoundEngine.playHit();
    }

    if (ball.vy < 0 && ball.y - ball.radius <= aiPaddle.y + aiPaddle.height / 2) {
      if (ball.x >= aiPaddle.x && ball.x <= aiPaddle.x + aiPaddle.width) hitPaddle(aiPaddle, false);
    }

    if (ball.vy > 0 && ball.y + ball.radius >= playerPaddle.y - playerPaddle.height / 2) {
      if (ball.x >= playerPaddle.x && ball.x <= playerPaddle.x + playerPaddle.width) hitPaddle(playerPaddle, true);
    }

    if (ball.y > playerPaddle.y + GOAL_MARGIN) scorePoint("ai");
    if (ball.y < aiPaddle.y - GOAL_MARGIN) scorePoint("player");
  }

  function updateAI(dt) {
    const settings = DIFFICULTY_SETTINGS[state.difficulty];
    let target = ball.vy < 0 ? ball.x : canvas.clientWidth / 2;

    if (aiTarget === null) aiTarget = target;
    aiTarget += (target - aiTarget) * settings.reaction * dt * 5;

    const desired = aiTarget - aiPaddle.width / 2;
    let difference = desired - aiPaddle.x;
    const maxMove = settings.speed * 100 * dt;
    difference = Math.max(-maxMove, Math.min(maxMove, difference));

    aiPaddle.x += difference;
    aiPaddle.x = Math.max(0, Math.min(canvas.clientWidth - aiPaddle.width, aiPaddle.x));
  }

  function hitPaddle(paddle, isPlayer) {
    const boost = isPlayer ? state.activeEffects.playerShotBoost : state.activeEffects.opponentShotBoost;
    SoundEngine.playHit();

    if (isPlayer) {
      ball.y = paddle.y - paddle.height / 2 - ball.radius;
      ball.vy = -Math.abs(ball.vy) * boost;
    } else {
      ball.y = paddle.y + paddle.height / 2 + ball.radius;
      ball.vy = Math.abs(ball.vy) * boost;
    }

    const paddleCenter = paddle.x + paddle.width / 2;
    const impact = (ball.x - paddleCenter) / (paddle.width / 2);
    ball.vx = impact * 300 * boost;
    ball.speed *= 1.035;

    const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (currentSpeed > 700) {
      const factor = 700 / currentSpeed;
      ball.vx *= factor;
      ball.vy *= factor;
    }
  }

  function scorePoint(who) {
    if (!state.running || state.pointPending) return;
    state.pointPending = true;
    ball.vx = 0;
    ball.vy = 0;

    SoundEngine.playScore();

    if (who === "player") {
      state.playerScore++;
      showSimpleMessage(MESSAGES[Math.floor(Math.random() * MESSAGES.length)], CAMP_COLORS[state.playerCandidate.camp] || "#111");
    } else {
      state.opponentScore++;
      showSimpleMessage(MESSAGES[Math.floor(Math.random() * MESSAGES.length)], CAMP_COLORS[state.opponentCandidate.camp] || "#111");
    }

    updatePercentages();
    document.getElementById("scoreOpponent").textContent = state.opponentScore;
    document.getElementById("scorePlayer").textContent = state.playerScore;

    if (state.playerScore >= WINNING_SCORE || state.opponentScore >= WINNING_SCORE) {
      endGame();
      return;
    }

    TimerManager.setTimeout(() => {
      if (state.running) resetBall(who === "player" ? -1 : 1);
    }, 350);
  }

  function showSimpleMessage(text, color) {
    const el = document.getElementById("gameMessage");
    if (!el) return;

    el.innerHTML = `<div class="msg-phrase" style="color: ${color}">« ${text} »</div>`;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");

    TimerManager.setTimeout(() => el.classList.remove("show"), 1800);
  }

  function updatePercentages() {
    const total = state.playerScore + state.opponentScore;
    const pEl = document.getElementById("playerPercentage");
    const oEl = document.getElementById("opponentPercentage");

    if (total === 0) {
      pEl.textContent = "—";
      oEl.textContent = "—";
      return;
    }

    pEl.textContent = (state.playerScore / total * 100).toFixed(1).replace(".", ",") + " %";
    oEl.textContent = (state.opponentScore / total * 100).toFixed(1).replace(".", ",") + " %";
  }

  function draw() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    ctx.beginPath();
    ctx.setLineDash([4, 7]);
    ctx.moveTo(22, height / 2);
    ctx.lineTo(width - 22, height / 2);
    ctx.strokeStyle = "#e5e5e5";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    drawPaddle(aiPaddle);
    drawPaddle(playerPaddle);

    // Avatars
    const aiAvatarX = aiPaddle.x + aiPaddle.width / 2;
    const aiAvatarY = aiPaddle.y - aiPaddle.height / 2 - 12 - AVATAR_RADIUS;
    drawCanvasAvatar(ImageCache.get(state.opponentCandidate?.image), state.opponentCandidate, aiAvatarX, aiAvatarY, AVATAR_RADIUS);

    const playerAvatarX = playerPaddle.x + playerPaddle.width / 2;
    const playerAvatarY = playerPaddle.y + playerPaddle.height / 2 + 12 + AVATAR_RADIUS;
    drawCanvasAvatar(ImageCache.get(state.playerCandidate?.image), state.playerCandidate, playerAvatarX, playerAvatarY, AVATAR_RADIUS);

    // Balle
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();

    // Décompte
    if (state.countdownActive && state.countdownValue > 0) {
      ctx.font = "900 52px " + FONT_DISPLAY;
      ctx.fillStyle = "#111";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(state.countdownValue, width / 2, height / 2);
    }
  }

  function drawCanvasAvatar(img, candidate, x, y, radius) {
    const ringColor = candidate ? (CAMP_COLORS[candidate.camp] || "#111") : "#111";
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.clip();
      const size = radius * 2;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      let renderW = size, renderH = size;
      if (imgRatio > 1) renderW = size * imgRatio;
      else renderH = size / imgRatio;

      ctx.drawImage(img, x - renderW / 2, y - renderH / 2, renderW, renderH);
    } else {
      ctx.fillStyle = ringColor;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "800 " + Math.round(radius * 0.85) + "px " + FONT_DISPLAY;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials(candidate?.name), x, y + 1);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  function drawPaddle(paddle) {
    ctx.beginPath();
    ctx.moveTo(paddle.x + 7, paddle.y - paddle.height / 2);
    ctx.arcTo(paddle.x + paddle.width, paddle.y - paddle.height / 2, paddle.x + paddle.width, paddle.y + paddle.height / 2, 7);
    ctx.arcTo(paddle.x + paddle.width, paddle.y + paddle.height / 2, paddle.x, paddle.y + paddle.height / 2, 7);
    ctx.arcTo(paddle.x, paddle.y + paddle.height / 2, paddle.x, paddle.y - paddle.height / 2, 7);
    ctx.arcTo(paddle.x, paddle.y - paddle.height / 2, paddle.x + paddle.width, paddle.y - paddle.height / 2, 7);
    ctx.closePath();
    ctx.fillStyle = paddle.color || "#fff";
    ctx.fill();
    ctx.strokeStyle = "#111";
    ctx.lineWidth = PADDLE_CONFIG.border;
    ctx.stroke();
  }

  function endGame() {
    state.running = false;
    TimerManager.clearAll();
    if (animationId) cancelAnimationFrame(animationId);

    const playerWon = state.playerScore > state.opponentScore;
    saveGameStats(playerWon);

    const total = state.playerScore + state.opponentScore;
    document.getElementById("winnerName").textContent = playerWon ? state.playerCandidate.name : state.opponentCandidate.name;
    document.getElementById("pongFinalScore").textContent = `${state.playerScore} — ${state.opponentScore}`;
    document.getElementById("resultPlayerName").textContent = state.playerCandidate.name;
    document.getElementById("resultOpponentName").textContent = state.opponentCandidate.name;
    document.getElementById("resultPlayerPercent").textContent = (state.playerScore / total * 100).toFixed(1).replace(".", ",") + " %";
    document.getElementById("resultOpponentPercent").textContent = (state.opponentScore / total * 100).toFixed(1).replace(".", ",") + " %";

    TimerManager.setTimeout(() => {
      hideAllScreens();
      document.getElementById("resultScreen").classList.remove("hidden");
      renderResultActions(playerWon);
    }, 500);
  }

  function renderResultActions(playerWon) {
    const buttonsEl = document.getElementById("resultButtons");
    buttonsEl.innerHTML = "";

    const addButton = (label, cls, fn) => {
      const b = document.createElement("button");
      b.className = cls;
      b.textContent = label;
      b.onclick = fn;
      buttonsEl.appendChild(b);
    };

    if (state.currentMatchMode !== "campaign" || !state.campaign) {
      document.getElementById("resultStageTitle").textContent = "Partie terminée";
      addButton("REJOUER UNE PARTIE", "btn", showSelection);
      addButton("MENU", "btn", showSelection);
      return;
    }

    const stage = state.campaign.stage;
    if (!playerWon) {
      document.getElementById("resultStageTitle").textContent = stage === "primaire" ? "Primaire perdue" : (stage === "premier" ? "Premier tour perdu" : "Second tour perdu");
      addButton(stage === "primaire" ? "REJOUER LA PRIMAIRE" : "RECOMMENCER LA CAMPAGNE", "btn-again", restartCampaign);
      addButton("MENU", "level-btn", showSelection);
      return;
    }

    if (stage === "primaire") {
      document.getElementById("resultStageTitle").textContent = "Primaire remportée";
      addButton("VOIR LES RÉSULTATS", "btn", afterPrimaireWin);
    } else if (stage === "premier") {
      document.getElementById("resultStageTitle").textContent = "Premier tour remporté";
      addButton("VOIR LES RÉSULTATS", "btn", afterPremierTourWin);
    } else if (stage === "second") {
      document.getElementById("resultStageTitle").textContent = "Élu(e) Président(e) de la République";
      document.getElementById("winnerName").textContent = state.playerCandidate.name + " 🇫🇷";
      addButton("NOUVELLE CAMPAGNE", "btn", () => { state.campaign = null; showSelection(); });
    }
    addButton("MENU", "level-btn", showSelection);
  }

  function startCampaign(playerCandidate) {
    const campPool = DEFAULT_CANDIDATES.filter(c => c.camp === playerCandidate.camp && c.id !== playerCandidate.id);
    if (!campPool.length) return;

    state.campaign = {
      campId: playerCandidate.camp,
      playerId: playerCandidate.id,
      stage: "primaire",
      campWinners: {}
    };

    state.difficulty = "easy";
    beginMatch(playerCandidate, campPool[Math.floor(Math.random() * campPool.length)], "campaign");
  }

  function restartCampaign() {
    if (!state.campaign) { showSelection(); return; }
    const player = DEFAULT_CANDIDATES.find(c => c.id === state.campaign.playerId);
    if (player) startCampaign(player);
  }

  function afterPrimaireWin() {
    const winners = {};
    winners[state.campaign.campId] = state.campaign.playerId;

    CAMPS.filter(c => c.id !== state.campaign.campId).forEach(c => {
      const pool = DEFAULT_CANDIDATES.filter(cand => cand.camp === c.id);
      if (pool.length) winners[c.id] = pool[Math.floor(Math.random() * pool.length)].id;
    });

    state.campaign.campWinners = winners;
    showCampaignTransition({
      title: "Résultats des primaires",
      intro: "Voici les candidats qui représenteront chaque camp au premier tour.",
      entries: CAMPS.filter(c => winners[c.id]).map(c => ({
        candidate: DEFAULT_CANDIDATES.find(cand => cand.id === winners[c.id]),
        label: c.label,
        highlight: c.id === state.campaign.campId
      })),
      buttonLabel: "PASSER AU PREMIER TOUR",
      onContinue: beginPremierTourMatch
    });
  }

  function beginPremierTourMatch() {
    const otherCampIds = Object.keys(state.campaign.campWinners).filter(id => id !== state.campaign.campId);
    const opponentCampId = otherCampIds[Math.floor(Math.random() * otherCampIds.length)];

    state.campaign.opponentCampId = opponentCampId;
    state.campaign.remainingCampIds = otherCampIds.filter(id => id !== opponentCampId);
    state.campaign.stage = "premier";
    state.difficulty = "normal";

    const player = DEFAULT_CANDIDATES.find(c => c.id === state.campaign.playerId);
    const opponent = DEFAULT_CANDIDATES.find(c => c.id === state.campaign.campWinners[opponentCampId]);
    beginMatch(player, opponent, "campaign");
  }

  function afterPremierTourWin() {
    const remaining = state.campaign.remainingCampIds;
    const secondTourWinnerId = state.campaign.campWinners[remaining[Math.floor(Math.random() * remaining.length)]];
    state.campaign.secondTourOpponentId = secondTourWinnerId;

    showCampaignTransition({
      title: "Résultats du premier tour",
      intro: "Votre adversaire du second tour est désigné.",
      entries: [
        { candidate: DEFAULT_CANDIDATES.find(c => c.id === state.campaign.playerId), label: "Vous — qualifié(e)", highlight: true },
        { candidate: DEFAULT_CANDIDATES.find(c => c.id === secondTourWinnerId), label: "Votre adversaire", highlight: false }
      ],
      buttonLabel: "PASSER AU SECOND TOUR",
      onContinue: () => {
        state.campaign.stage = "second";
        state.difficulty = "hard";
        beginMatch(
          DEFAULT_CANDIDATES.find(c => c.id === state.campaign.playerId),
          DEFAULT_CANDIDATES.find(c => c.id === secondTourWinnerId),
          "campaign"
        );
      }
    });
  }

  function showCampaignTransition(options) {
    hideAllScreens();
    document.getElementById("campaignTransitionTitle").textContent = options.title;
    document.getElementById("campaignTransitionIntro").textContent = options.intro;

    const list = document.getElementById("campaignTransitionList");
    list.innerHTML = "";

    options.entries.forEach(entry => {
      const row = document.createElement("div");
      row.className = "campaign-row" + (entry.highlight ? " highlight" : "");
      row.appendChild(buildAvatarElement(entry.candidate, 44));

      const info = document.createElement("div");
      const name = document.createElement("div");
      name.className = "campaign-row-name";
      name.textContent = entry.candidate ? entry.candidate.name : "—";

      const label = document.createElement("div");
      label.className = "campaign-row-label";
      label.textContent = entry.label;

      info.appendChild(name);
      info.appendChild(label);
      row.appendChild(info);
      list.appendChild(row);
    });

    document.getElementById("campaignTransitionButton").textContent = options.buttonLabel;
    pendingCampaignContinue = options.onContinue;
    document.getElementById("campaignTransitionScreen").classList.remove("hidden");
  }

  function continueCampaignTransition() {
    if (pendingCampaignContinue) {
      const fn = pendingCampaignContinue;
      pendingCampaignContinue = null;
      fn();
    }
  }

  function stopGame() {
    state.running = false;
    state.countdownActive = false;
    TimerManager.clearAll();
    if (animationId) cancelAnimationFrame(animationId);
  }

  function quitGame() {
    stopGame();
    showSelection();
  }

  function getStats() {
    try {
      const saved = localStorage.getItem("debatStats");
      return saved ? JSON.parse(saved) : { games: 0, wins: 0, playerCharacters: {} };
    } catch (e) {
      return { games: 0, wins: 0, playerCharacters: {} };
    }
  }

  function saveGameStats(playerWon) {
    const stats = getStats();
    stats.games = (stats.games || 0) + 1;
    if (playerWon) stats.wins = (stats.wins || 0) + 1;
    if (state.playerCandidate) {
      stats.playerCharacters[state.playerCandidate.name] = (stats.playerCharacters[state.playerCandidate.name] || 0) + 1;
    }
    try { localStorage.setItem("debatStats", JSON.stringify(stats)); } catch (e) {}
  }

  // Retour à l'accueil du quiz (écouté dans game.js)
  function exit() {
    stopGame();
    document.dispatchEvent(new CustomEvent("pong:exit"));
  }

  return {
    init, setCamp, setMode, setDifficulty, updateCandidatePreview,
    startGame, quitGame, showSelection, continueCampaignTransition, exit
  };
})();

window.PongApp = App;

let pongReady = false;
export function openPong() {
  document.getElementById("pong").classList.remove("hidden");
  if (!pongReady) { App.init(); pongReady = true; }   // init() affiche aussi l'écran de sélection
  else { App.showSelection(); }
}

export function closePong() {
  document.getElementById("pong").classList.add("hidden");
}
