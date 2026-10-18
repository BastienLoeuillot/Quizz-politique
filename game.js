import { openPong, closePong } from "./pong.js";

// ============================================================
// Données (chargées depuis data/*.json au démarrage)
// ============================================================
let QUESTIONS_QUIZ = [];
let QUESTIONS_CITATIONS = [];
let QUESTIONS_PERSONS = [];
let QUESTIONS_DAILY_QUIZ = [];


// Index pré-calculé pour "Qui est-ce ?" : { niveau: { homme: [...], femme: [...] } }
// Construit une seule fois au chargement pour éviter de filtrer/mélanger
// tout le tableau de personnes à chaque manche.
let personsIndex = {};

const ROUND_LENGTH = 10;
const TIME_LIMIT = 30; // seconds
const MAX_POINTS = 50;
const QUIESTCE_MAX_POINTS = 100;
const QUIESTCE_GRID_SIZE = 9;

// ---- Combo ----
const COMBO_THRESHOLD = 3; // nombre de bonnes réponses d'affilée pour activer le combo
const COMBO_MULTIPLIER = 2;

const STORAGE_KEYS = {
    quiz: "quizPolitiqueBestScoreQuiz",
    citations: "quizPolitiqueBestScoreCitations",
    dailyquiz: "quizPolitiqueBestScoreDailyQuiz",
    quiestce_facile: "quizPolitiqueBestScoreQuiestceFacile",
    quiestce_moyen: "quizPolitiqueBestScoreQuiestceMoyen",
    quiestce_difficile: "quizPolitiqueBestScoreQuiestceDifficile",
    quiestce_presidentielle: "quizPolitiqueBestScoreQuiestcePresidentielle",
    mixed: "quizPolitiqueBestScoreMixed"
};

const DAILY_STORAGE_KEYS = {
    lastLogin: "quizPolitiqueLastLoginDate",
    streakDays: "quizPolitiqueStreakDays",
    dailyScore: "quizPolitiqueDailyScore",
    dailyScoreDate: "quizPolitiqueDailyScoreDate",
    dailyRecord: "quizPolitiqueDailyRecord",
    loginDays: "quizPolitiqueLoginDays"
};

const ANSWER_STATS_KEY = "quizPolitiqueAnswerStats";

function dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function todayStr() {
    return dateStr(new Date());
}

// Enregistre le jour courant dans l'historique des connexions (60 derniers jours conservés)
function recordLoginDay() {
    const today = todayStr();
    const days = readJSON(DAILY_STORAGE_KEYS.loginDays, []);
    // reprend la dernière connexion connue si l'historique est encore vide
    const lastLogin = localStorage.getItem(DAILY_STORAGE_KEYS.lastLogin);
    if (!days.length && lastLogin) days.push(lastLogin);
    if (!days.includes(today)) days.push(today);
    localStorage.setItem(DAILY_STORAGE_KEYS.loginDays, JSON.stringify(days.slice(-60)));
}

// Dessine les 7 ronds de la semaine en cours (lundi → dimanche)
function renderWeekTracker() {
    const wrap = $("weekTracker");
    if (!wrap) return;

    const letters = ["L", "M", "M", "J", "V", "S", "D"];
    const names = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
    const logged = new Set(readJSON(DAILY_STORAGE_KEYS.loginDays, []));

    const now = new Date();
    const offset = (now.getDay() + 6) % 7;   // 0 = lundi
    const today = todayStr();

    wrap.innerHTML = "";
    for (let i = 0; i < 7; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset + i);
        const key = dateStr(d);

        const dot = document.createElement("div");
        dot.className = "day-dot";
        if (logged.has(key)) dot.classList.add("done");
        if (key === today) dot.classList.add("today");
        dot.textContent = letters[i];
        dot.setAttribute("aria-label", names[i] + (logged.has(key) ? " : connecté" : ""));
        wrap.appendChild(dot);
    }
}

function updateDailyStats() {
    const today = todayStr();
    const lastLogin = localStorage.getItem(DAILY_STORAGE_KEYS.lastLogin);
    let streakDays = parseInt(localStorage.getItem(DAILY_STORAGE_KEYS.streakDays) || "0", 10);

    if (lastLogin !== today) {
        if (lastLogin) {
            const lastDate = new Date(lastLogin);
            const currentDate = new Date(today);
            const diffDays = Math.round((currentDate - lastDate) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                streakDays += 1;
            } else if (diffDays > 1) {
                streakDays = 1;
            }
        } else {
            streakDays = 1;
        }
        localStorage.setItem(DAILY_STORAGE_KEYS.lastLogin, today);
        localStorage.setItem(DAILY_STORAGE_KEYS.streakDays, String(streakDays));
    }

    const lastScoreDate = localStorage.getItem(DAILY_STORAGE_KEYS.dailyScoreDate);
    if (lastScoreDate !== today) {
        localStorage.setItem(DAILY_STORAGE_KEYS.dailyScore, "0");
        localStorage.setItem(DAILY_STORAGE_KEYS.dailyScoreDate, today);
    }
    recordLoginDay();
    renderWeekTracker();
    refreshGlobalTopbar();
}

function refreshGlobalTopbar() {
    const streakDays = localStorage.getItem(DAILY_STORAGE_KEYS.streakDays) || "1";
    const dailyScore = localStorage.getItem(DAILY_STORAGE_KEYS.dailyScore) || "0";

    const dailyStreakEl = $("dailyStreakVal");
    const dailyScoreEl = $("dailyScoreVal");

    if (dailyStreakEl) dailyStreakEl.textContent = `🔥 ${streakDays} j`;
    if (dailyScoreEl) dailyScoreEl.textContent = `${dailyScore} pts`;
}

function addDailyScore(points) {
    const today = todayStr();
    const currentDaily = parseInt(localStorage.getItem(DAILY_STORAGE_KEYS.dailyScore) || "0", 10);
    const newDaily = currentDaily + points;

    localStorage.setItem(DAILY_STORAGE_KEYS.dailyScore, String(newDaily));
    localStorage.setItem(DAILY_STORAGE_KEYS.dailyScoreDate, today);

    const record = parseInt(localStorage.getItem(DAILY_STORAGE_KEYS.dailyRecord) || "0", 10);
    if (newDaily > record) {
        localStorage.setItem(DAILY_STORAGE_KEYS.dailyRecord, String(newDaily));
    }
    refreshGlobalTopbar();
}

function readJSON(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (e) {
        return fallback;
    }
}

// Appelée à chaque question répondue (le temps écoulé compte comme faux)
function recordAnswer(isCorrect) {
    const s = readJSON(ANSWER_STATS_KEY, { correct: 0, total: 0 });
    s.total = (s.total || 0) + 1;
    if (isCorrect) s.correct = (s.correct || 0) + 1;
    localStorage.setItem(ANSWER_STATS_KEY, JSON.stringify(s));
}

function renderAccount() {
    const a = readJSON(ANSWER_STATS_KEY, { correct: 0, total: 0 });
    const pong = readJSON("debatStats", { games: 0, wins: 0 });
    const dailyRecord = parseInt(localStorage.getItem(DAILY_STORAGE_KEYS.dailyRecord) || "0", 10);
    const dailyToday = parseInt(localStorage.getItem(DAILY_STORAGE_KEYS.dailyScore) || "0", 10);

    $("statAnswerRate").textContent = a.total ? Math.round(a.correct / a.total * 100) + " %" : "—";
    $("statAnswerDetail").textContent = a.total
        ? `${a.correct} bonne${a.correct > 1 ? "s" : ""} réponse${a.correct > 1 ? "s" : ""} sur ${a.total}`
        : "Aucune question jouée pour l'instant";

    $("statPongGames").textContent = pong.games || 0;
    $("statPongWinRate").textContent = pong.games ? Math.round((pong.wins || 0) / pong.games * 100) + " %" : "—";
    $("statPongWinDetail").textContent = pong.games ? `${pong.wins || 0} victoire${pong.wins > 1 ? "s" : ""}` : "";

    $("statDailyRecord").textContent = Math.max(dailyRecord, dailyToday) + " pts";
}

let currentMode = "quiz";
let currentNiveau = null;
let roundQuestions = [];
let currentIndex = 0;
let score = 0;
let results = [];
let timerStart = null;
let timeLeft = TIME_LIMIT;
let timerRAF = null;
let answered = false;
let nextTimeout = null;

// ---- État du combo ----
let streak = 0;
let comboActive = false;

const $ = (id) => document.getElementById(id);

// ============================================================
// Chargement des données
// ============================================================
async function loadData() {
    const [quiz, citations, persons, dailyQuiz] = await Promise.all([
        fetch("data/quiz.json").then(r => r.json()),
        fetch("data/citations.json").then(r => r.json()),
        fetch("data/persons.json").then(r => r.json()),
        fetch("data/daily_quiz.json").then(r => r.json())
    ]);
    QUESTIONS_QUIZ = quiz;
    QUESTIONS_CITATIONS = citations;
    QUESTIONS_PERSONS = persons;
    QUESTIONS_DAILY_QUIZ = dailyQuiz;
    buildPersonsIndex();
}

// Regroupe les personnes par niveau puis par sexe une seule fois.
// Ajoute en plus un groupe "presidentielle" (personnes avec candidat === true),
// indépendamment de leur niveau de difficulté.
function buildPersonsIndex() {
    personsIndex = {};
    const addTo = (niveau, p) => {
        if (!niveau) return;
        if (!personsIndex[niveau]) personsIndex[niveau] = { homme: [], femme: [] };
        if (!personsIndex[niveau][p.sexe]) personsIndex[niveau][p.sexe] = [];
        personsIndex[niveau][p.sexe].push(p);
    };
    for (const p of QUESTIONS_PERSONS) {
        addTo(p.niveau, p);
        if (p.candidat) addTo("presidentielle", p);
    }
}

// ============================================================
// Utilitaires
// ============================================================
function storageKey() {
    if (currentMode === "quiestce") return "quiestce_" + currentNiveau;
    return currentMode;
}

function getBest(key) {
    return parseInt(localStorage.getItem(STORAGE_KEYS[key]) || "0", 10);
}

function getBestQuiestce() {
    return Math.max(...["facile","moyen","difficile","presidentielle"]
        .map(n => getBest("quiestce_" + n)));
}
// $("introBestquiestce").textContent = getBestQuiestce();

function setBest(key, v) {
    localStorage.setItem(STORAGE_KEYS[key], String(v));
}

function poolFor(mode) {
    return mode === "citations" ? QUESTIONS_CITATIONS : QUESTIONS_QUIZ;
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function verdictFor(s) {
    if (s <= 100) return "Même Jacques Cheminade a été meilleur en 2017";
    if (s <= 200) return "Suffisant pour être élu au conseil municipal d'un village du Poitou";
    if (s <= 300) return "La campagne de François Bayrou en 2012 : sans saveur";
    if (s <= 400) return "Presque aussi bon qu'un Philippe Poutou des grands soirs de débats";
    return "Tu fais quelque chose en 2027 ? On va peut-être avoir besoin de toi.";
}

function setActiveNav(targetId) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === targetId);
    });
}

// ============================================================
// Navigation / Gestion des pages
// ============================================================
export function changerPage(targetId) {
    // 1. Masquer toutes les sections ayant la classe .page
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.add('hidden'));

    // 2. Traitement spécifique selon la page ciblée
    if (targetId === 'pong') {
        openPong(); // Ouvre Pong via pong.js
    } else {
        closePong(); // Ferme le canvas/boucle de Pong si ouvert
        const pageCible = document.getElementById(targetId);
        if (pageCible) {
            pageCible.classList.remove('hidden');
        }
        goHome(); // Réinitialise l'écran d'accueil à son état initial
        if (targetId === 'page-compte') renderAccount();
    }
}

// ============================================================
// Construction d'une manche "Qui est-ce ?"
// ============================================================
// Construit une manche : 10 cibles piochées dans le groupe du niveau choisi
// (facile / moyen / difficile / presidentielle), chacune avec 8 leurres du
// même sexe, sans qu'un nom ou une photo ne revienne deux fois sur la manche.
// Le vivier est déjà filtré par niveau via personsIndex — plus besoin de
// parcourir/mélanger l'ensemble des 1000+ personnes à chaque cible.
function buildQuiestceRound(niveau) {
    const bucket = personsIndex[niveau] || { homme: [], femme: [] };
    const usedTargets = new Set();
    const targets = shuffle([...(bucket.homme || []), ...(bucket.femme || [])]);
    const round = [];

    for (const target of targets) {
        if (round.length >= ROUND_LENGTH) break;
        if (usedTargets.has(target.nom)) continue;

        const ok = p => p.sexe === target.sexe && p.nom !== target.nom && p.photo !== target.photo;
        // d'abord les leurres du même niveau, puis on complète avec toute la base
        let pool = shuffle((bucket[target.sexe] || []).filter(ok));
        if (pool.length < QUIESTCE_GRID_SIZE - 1) {
            pool = pool.concat(shuffle(QUESTIONS_PERSONS.filter(ok)));
        }

        const seen = new Set();
        const decoys = [];
        for (const d of pool) {
            if (seen.has(d.nom) || seen.has(d.photo)) continue;
            seen.add(d.nom); seen.add(d.photo);
            decoys.push(d);
            if (decoys.length === QUIESTCE_GRID_SIZE - 1) break;
        }
        if (decoys.length < QUIESTCE_GRID_SIZE - 1) continue;

        usedTargets.add(target.nom);
        round.push({
            nom: target.nom, fonction: target.fonction, autre: target.autre,
            correctPhoto: target.photo,
            photos: shuffle([target.photo, ...decoys.map(d => d.photo)])
        });
    }
    return round;
}

function buildMixedRound() {
    // 1. Choisir des personnes pour "Qui est-ce ?"
    const randomNiveaux = ["facile", "moyen", "difficile", "presidentielle"];
    const quiestceQuestions = [];
    for (let i = 0; i < 4; i++) {
        const lvl = randomNiveaux[Math.floor(Math.random() * randomNiveaux.length)];
        const subRound = buildQuiestceRound(lvl);
        if (subRound && subRound.length > 0) {
            const picked = subRound[Math.floor(Math.random() * subRound.length)];
            quiestceQuestions.push({ ...picked, __mode: "quiestce" });
        }
    }

    const quizQuestions = QUESTIONS_QUIZ.map(q => ({ ...q, __mode: "quiz" }));
    const citationsQuestions = QUESTIONS_CITATIONS.map(q => ({ ...q, __mode: "citations" }));

    const pool = [...quiestceQuestions, ...quizQuestions, ...citationsQuestions];
    const shuffled = shuffle(pool).slice(0, ROUND_LENGTH);

    return shuffled.map(q => {
        if (q.__mode === "quiestce") {
            return q;
        }
        return {
            ...q,
            shuffled: shuffle(q.propositions)
        };
    });
}


// ============================================================
// Affichage
// ============================================================
function buildGauge() {
    const g = $("gauge");
    g.innerHTML = "";
    for (let i = 0; i < roundQuestions.length; i++) {
        const seg = document.createElement("div");
        seg.className = "seg";
        seg.id = "seg-" + i;
        g.appendChild(seg);
    }
}

function updateGauge() {
    for (let i = 0; i < roundQuestions.length; i++) {
        const seg = $("seg-" + i);
        if (!seg) continue;
        seg.classList.remove("current", "done-ok", "done-ko");
        if (i < results.length) {
            seg.classList.add(results[i] === "ok" ? "done-ok" : "done-ko");
        } else if (i === currentIndex) {
            seg.classList.add("current");
        }
    }
}

function updateStreakDisplay() {
    const group = $("streakGroup");
    const val = $("streakVal");
    if (streak >= 2) {
        group.style.display = "";
        val.textContent = streak;
        val.classList.toggle("active", comboActive);
    } else {
        group.style.display = "none";
        val.classList.remove("active");
    }
}

function startGame(mode, niveau) {
    document.body.classList.add("game-in-progress");
    if (mode) currentMode = mode;
    if (niveau) currentNiveau = niveau;

    if (currentMode === "mixed") {
        roundQuestions = buildMixedRound();

    } else if (currentMode === "quiestce") {
        roundQuestions = buildQuiestceRound(currentNiveau);

    } else if (currentMode === "dailyquiz") {
        roundQuestions = QUESTIONS_DAILY_QUIZ.map(q => ({
            ...q,
            shuffled: shuffle(q.propositions)
        }));

    } else {
        roundQuestions = shuffle(poolFor(currentMode))
            .slice(0, ROUND_LENGTH)
            .map(q => ({
                ...q,
                shuffled: shuffle(q.propositions)
            }));
    }

    currentIndex = 0;
    score = 0;
    results = [];
    streak = 0;
    comboActive = false;
    $("scoreVal").textContent = "0";
    $("bestVal").textContent = getBest(storageKey());
    updateStreakDisplay();
    buildGauge();

    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.add('hidden'));
    $("page-accueil").classList.remove('hidden');
    setActiveNav("page-accueil"); 
    
    $("screenIntro").classList.add("hidden");
    $("screenLevel").classList.add("hidden");
    $("screenEnd").classList.add("hidden");
    $("screenGame").classList.remove("hidden");
    showQuestion();
}

function showQuestion() {
    answered = false;
    const q = roundQuestions[currentIndex];
    const isQuiestce = q.photos !== undefined || q.__mode === "quiestce";
    updateGauge();

    $("reveal").classList.add("hidden");
    $("revealContext").textContent = "";
    $("revealSource").textContent = "";
    $("revealTimeout").classList.add("hidden");
    $("revealTimeout").textContent = "";
    $("revealFonction").classList.add("hidden");
    $("revealFonction").innerHTML = "";

    if (isQuiestce) {
        $("qSurtitre").textContent = "";
        $("qText").classList.add("hidden");
        $("qName").classList.remove("hidden");
        $("qName").textContent = q.nom;

        $("answers").innerHTML = "";
        $("answers").classList.add("hidden");
        const grid = $("photoGrid");
        grid.classList.remove("hidden");
        grid.innerHTML = "";
        q.photos.forEach(photoUrl => {
            const btn = document.createElement("button");
            btn.className = "photo-btn";
            btn.dataset.correct = (photoUrl === q.correctPhoto) ? "1" : "0";
            const img = document.createElement("img");
            img.src = photoUrl;
            img.alt = "";
            btn.appendChild(img);
            btn.addEventListener("click", () => submitAnswer(btn.dataset.correct === "1", btn));
            grid.appendChild(btn);
        });
    } else {
        $("qName").classList.add("hidden");
        $("qText").classList.remove("hidden");
        $("qSurtitre").textContent = q.surtitre;
        $("qText").textContent = q.question;

        $("photoGrid").innerHTML = "";
        $("photoGrid").classList.add("hidden");
        const wrap = $("answers");
        wrap.classList.remove("hidden");
        wrap.innerHTML = "";
        const letters = ["A", "B", "C", "D"];
        q.shuffled.forEach((prop, i) => {
            const btn = document.createElement("button");
            btn.className = "ans";
            // La question de savoir si ce bouton est la bonne réponse est
            // tranchée une fois pour toutes ici (data-correct), au lieu de
            // relire le texte affiché plus tard pour le comparer à q.reponse.
            btn.dataset.correct = (prop === q.reponse) ? "1" : "0";

            const k = document.createElement("span");
            k.className = "k";
            k.textContent = letters[i] + ".";

            const label = document.createElement("span");
            label.textContent = prop;

            btn.append(k, label);
            btn.addEventListener("click", () => submitAnswer(btn.dataset.correct === "1", btn));
            wrap.appendChild(btn);
        });
    }

    timeLeft = TIME_LIMIT;
    timerStart = performance.now();
    runTimer();
}

function runTimer() {
    cancelAnimationFrame(timerRAF);
    const fill = $("timerFill");
    fill.style.background = "var(--ink)";
    const tick = (now) => {
        if (answered) return;
        const elapsed = (now - timerStart) / 1000;
        timeLeft = Math.max(0, TIME_LIMIT - elapsed);
        $("timeNum").textContent = timeLeft.toFixed(1) + "s";
        fill.style.width = (timeLeft / TIME_LIMIT * 100) + "%";
        if (timeLeft <= TIME_LIMIT * 0.15) fill.style.background = "var(--ko)";
        if (timeLeft <= 0) {
            submitAnswer(null, null);
            return;
        }
        timerRAF = requestAnimationFrame(tick);
    };
    timerRAF = requestAnimationFrame(tick);
}

// correct : true (bonne réponse), false (mauvaise réponse) ou null (temps écoulé, pas de réponse)
function submitAnswer(correct, btnEl) {
    if (answered) return;
    answered = true;
    cancelAnimationFrame(timerRAF);

    const q = roundQuestions[currentIndex];
    const isQuiestce = q.photos !== undefined || q.__mode === "quiestce";
    const timedOut = correct === null;
    const isCorrect = correct === true;
    const maxPoints = isQuiestce ? QUIESTCE_MAX_POINTS : MAX_POINTS;
    recordAnswer(isCorrect);

    let points = 0;
    let comboJustApplied = false;
    if (isCorrect) {
        points = Math.round(maxPoints * (timeLeft / TIME_LIMIT));
        points = Math.max(0, Math.min(maxPoints, points));

        streak++;
        comboActive = streak >= COMBO_THRESHOLD;
        if (comboActive) {
            points *= COMBO_MULTIPLIER;
            comboJustApplied = true;
        }
    } else {
        streak = 0;
        comboActive = false;
    }

    score += points;
    results.push(isCorrect ? "ok" : "ko");
    $("scoreVal").textContent = score;
    updateStreakDisplay();

    if (points > 0) {
        addDailyScore(points);
        const pop = $("pointsPop");
        pop.textContent = (comboJustApplied ? "COMBO x" + COMBO_MULTIPLIER + " · " : "") + "+" + points;
        pop.classList.toggle("combo", comboJustApplied);
        pop.classList.remove("show");
        void pop.offsetWidth;
        pop.classList.add("show");
    }

    if (isQuiestce) {
        document.querySelectorAll(".photo-btn").forEach(b => {
            b.disabled = true;
            if (b.dataset.correct === "1") {
                b.classList.add("correct");
            } else if (btnEl === b) {
                b.classList.add("wrong");
            }
        });

        if (timedOut) {
            $("revealTimeout").textContent = "Euh n'hésite pas à répondre aux questions";
            $("revealTimeout").classList.remove("hidden");
        }

        const fonctionHtml = [];
        if (q.fonction) fonctionHtml.push(`<b>${q.fonction}</b>`);
        if (q.autre) fonctionHtml.push(q.autre);
        if (fonctionHtml.length) {
            $("revealFonction").innerHTML = fonctionHtml.join(" — ");
            $("revealFonction").classList.remove("hidden");
        }
        $("reveal").classList.remove("hidden");
    } else {
        document.querySelectorAll(".ans").forEach(b => {
            b.disabled = true;
            if (b.dataset.correct === "1") {
                b.classList.add("correct");
            } else if (btnEl === b) {
                b.classList.add("wrong");
            }
        });

        // La source/le contexte apparaît juste sous la citation/question,
        // au-dessus des propositions, pour mieux la mettre en valeur.
        if (q.source || q.contexte) {
            $("revealSource").textContent = q.source ? "Source : " + q.source : "";
            $("revealContext").textContent = q.contexte || "";
            $("reveal").classList.remove("hidden");
        }
    }

    updateGauge();
    
    const mode = q.__mode || currentMode;
    let nextDelay = 1100;
    if (!isQuiestce && mode === "citations" && (q.source || q.contexte)) nextDelay = 3800;
    if (isQuiestce) nextDelay = 1800;

        nextTimeout = setTimeout(() => {
        currentIndex++;
        if (currentIndex >= roundQuestions.length) {
            endGame();
        } else {
            showQuestion();
        }
    }, nextDelay);
}

function endGame() {
    document.body.classList.remove("game-in-progress");
    $("screenGame").classList.add("hidden");
    const key = storageKey();
    const best = Math.max(getBest(key), score);
    setBest(key, best);
    $("finalScore").textContent = score;
    $("finalVerdict").textContent = currentMode === "quiestce" ? "" : verdictFor(score);
    $("finalBest").textContent = best;
    $("screenEnd").classList.remove("hidden");
}

function goHome() {
    document.body.classList.remove("game-in-progress");
    cancelAnimationFrame(timerRAF);
    clearTimeout(nextTimeout); 
    $("screenGame").classList.add("hidden");
    $("screenEnd").classList.add("hidden");
    $("screenLevel").classList.add("hidden");
    $("screenIntro").classList.remove("hidden");
    renderWeekTracker();
    if ($("introBestMixed")) $("introBestMixed").textContent = getBest("mixed");
    if ($("mixedPageBest")) $("mixedPageBest").textContent = getBest("mixed");
}

function goLevelScreen() {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    $("page-accueil").classList.remove("hidden");
    setActiveNav("page-accueil"); 
    $("screenIntro").classList.add("hidden");
    $("screenLevel").classList.remove("hidden");
}

function initUI() {
    document.querySelectorAll('.nav-btn').forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.getAttribute('data-target');
            setActiveNav(targetId);
            changerPage(targetId);
        });
    });

    $("btnStartQuiz").addEventListener("click", () => startGame("quiz"));
    $("btnStartCitations").addEventListener("click", () => startGame("citations"));
    if ($("btnStartMixed")) $("btnStartMixed").addEventListener("click", () => startGame("mixed"));
    if ($("btnStartDailyQuiz")) $("btnStartDailyQuiz").addEventListener("click", () => startGame("dailyquiz"));
    $("btnGoLevel").addEventListener("click", goLevelScreen);

    // Abandon de partie (croix)
    $("btnQuitGame").addEventListener("click", goHome);

    document.addEventListener("pong:exit", () => {
        setActiveNav('page-accueil');
        changerPage('page-accueil');
    });

    $("btnLevelBack").addEventListener("click", () => {
        $("screenLevel").classList.add("hidden");
        $("screenIntro").classList.remove("hidden");
    });
    $("btnLevelFacile").addEventListener("click", () => startGame("quiestce", "facile"));
    $("btnLevelMoyen").addEventListener("click", () => startGame("quiestce", "moyen"));
    $("btnLevelDifficile").addEventListener("click", () => startGame("quiestce", "difficile"));
    $("btnLevelPresidentielle").addEventListener("click", () => startGame("quiestce", "presidentielle"));
    $("btnReplay").addEventListener("click", () => startGame());
    $("btnHome").addEventListener("click", goHome);
    initCampaignsCarousel();


    // Barre flottante : réduction au défilement
    const bottomNav = document.getElementById("bottomNav");

    if (bottomNav) {
        const THRESHOLD = 10;
        let lastScrollY = window.scrollY;
        let idleTimer;

        const expandNav = () => {
            bottomNav.classList.remove("is-compact");
        };

        window.addEventListener("scroll", () => {
            const currentY = window.scrollY;

            if (currentY > lastScrollY + THRESHOLD && currentY > 40) {
                bottomNav.classList.add("is-compact");
            } else if (currentY < lastScrollY - THRESHOLD) {
                expandNav();
            }

            lastScrollY = currentY;

            clearTimeout(idleTimer);
            idleTimer = setTimeout(expandNav, 600);
        }, { passive: true });

        bottomNav.addEventListener("pointerenter", expandNav);
        bottomNav.addEventListener("focusin", expandNav);

        // Sur écran tactile, développer la barre dès qu'on la touche.
        bottomNav.addEventListener("pointerdown", expandNav);
    }

}

// ============================================================
// Carrousel de campagnes (page d'accueil)
// ============================================================
function initCampaignsCarousel() {
    const track = $("campaignsTrack");
    const titleEl = $("campaignsTitle");
    if (!track) return;

    const slides = [...track.querySelectorAll(".campaign")];

    let ticking = false;

    function update() {
        ticking = false;
        const trackRect = track.getBoundingClientRect();
        const centerX = trackRect.left + trackRect.width / 2;
        let closest = 0;
        let closestDist = Infinity;

        slides.forEach((slide, i) => {
            const r = slide.getBoundingClientRect();
            if (!r.width) return;
            const dist = Math.abs(r.left + r.width / 2 - centerX);
            const d = Math.min(dist / r.width, 1);       // 0 = centré, 1 = voisin direct ou plus loin

            slide.style.transform = `scale(${1 - d * 0.35})`;
            slide.style.filter = `blur(${d * 4}px)`;
            slide.style.opacity = String(1 - d * 0.5);

            if (dist < closestDist) { closestDist = dist; closest = i; }
        });

        titleEl.textContent = slides[closest].dataset.title || "";
    }

    track.addEventListener("scroll", () => {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });

    // ---- Glisser à la souris (ordinateur) ----
    let dragging = false;
    let dragMoved = false;
    let startX = 0;
    let startScroll = 0;

    track.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return;   // tactile : défilement natif
        dragging = true;
        dragMoved = false;
        startX = e.clientX;
        startScroll = track.scrollLeft;
    });

    track.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        if (!dragMoved && Math.abs(dx) > 5) {
            dragMoved = true;                       // on est vraiment en train de glisser
            track.classList.add("dragging");
            track.setPointerCapture(e.pointerId);   // continue même si la souris sort du carrousel
        }
        if (dragMoved) track.scrollLeft = startScroll - dx;
    });

    function endDrag() {
        if (!dragging) return;
        dragging = false;
        if (!dragMoved) return;

        track.classList.remove("dragging");

        // recentre sur le bouton le plus proche
        const trackRect = track.getBoundingClientRect();
        const centerX = trackRect.left + trackRect.width / 2;
        let target = slides[0];
        let best = Infinity;
        slides.forEach((slide) => {
            const r = slide.getBoundingClientRect();
            const dist = Math.abs(r.left + r.width / 2 - centerX);
            if (dist < best) { best = dist; target = slide; }
        });
        const r = target.getBoundingClientRect();
        track.scrollTo({
            left: track.scrollLeft + (r.left + r.width / 2 - centerX),
            behavior: "smooth"
        });
    }

    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);

    // Un glisser ne doit pas être interprété comme un clic sur un bouton
    track.addEventListener("click", (e) => {
        if (dragMoved) {
            e.preventDefault();
            e.stopPropagation();
            dragMoved = false;
        }
    }, true);

    window.addEventListener("resize", update);

    // Recalcule dès que le carrousel a une taille réelle (chargement, retour sur la page d'accueil...)
    let wasVisible = false;
    new ResizeObserver(() => {
        const visible = track.clientWidth > 0;
        if (visible && !wasVisible) track.scrollLeft = 0;   // première campagne au centre
        wasVisible = visible;
        if (visible) update();
    }).observe(track);

    // Sécurité : une fois les polices et images chargées
    window.addEventListener("load", update);
}

// ============================================================
// Démarrage
// ============================================================
(async function init() {
    initUI();
    updateDailyStats(); // <--- AJOUTER CETTE LIGNE
    try {
        await loadData();
    } catch (err) {
        console.error("Erreur de chargement des données :", err);
        $("screenIntro").innerHTML = "<p>Impossible de charger les données du jeu. Vérifie que le fichier est servi via un serveur local (pas ouvert en file://).</p>";
    }
})();
