// ============================================================
// Données (chargées depuis data/*.json au démarrage)
// ============================================================
let QUESTIONS_QUIZ = [];
let QUESTIONS_CITATIONS = [];
let QUESTIONS_PERSONS = [];

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
    quiestce_facile: "quizPolitiqueBestScoreQuiestceFacile",
    quiestce_moyen: "quizPolitiqueBestScoreQuiestceMoyen",
    quiestce_difficile: "quizPolitiqueBestScoreQuiestceDifficile",
    quiestce_presidentielle: "quizPolitiqueBestScoreQuiestcePresidentielle"
};

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

// ---- État du combo ----
let streak = 0;
let comboActive = false;

const $ = (id) => document.getElementById(id);

// ============================================================
// Chargement des données
// ============================================================
async function loadData() {
    const [quiz, citations, persons] = await Promise.all([
        fetch("data/quiz.json").then(r => r.json()),
        fetch("data/citations.json").then(r => r.json()),
        fetch("data/persons.json").then(r => r.json())
    ]);
    QUESTIONS_QUIZ = quiz;
    QUESTIONS_CITATIONS = citations;
    QUESTIONS_PERSONS = persons;
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

    // Exception : le niveau "présidentielle" a un vivier réduit (peu de
    // candidats marqués candidat:true). Les 10 noms à deviner restent tous
    // différents, mais les photos utilisées comme leurres peuvent revenir
    // d'une question à l'autre. Les autres niveaux gardent l'unicité totale.
    if (niveau === "presidentielle") {
        return buildQuiestceRoundPresidentielle(bucket);
    }

    const usedNames = new Set();
    const usedPhotos = new Set();
    const targets = shuffle([...(bucket.homme || []), ...(bucket.femme || [])]);
    const round = [];

    for (const target of targets) {
        if (round.length >= ROUND_LENGTH) break;
        if (usedNames.has(target.nom) || usedPhotos.has(target.photo)) continue;

        const isAvailable = p => p.nom !== target.nom && !usedNames.has(p.nom) && !usedPhotos.has(p.photo);
        let decoyPool = shuffle((bucket[target.sexe] || []).filter(isAvailable));

        // Si le vivier du même sexe est trop petit, complète avec l'autre
        // sexe plutôt que d'abandonner la cible.
        if (decoyPool.length < QUIESTCE_GRID_SIZE - 1) {
            const otherSexe = target.sexe === "homme" ? "femme" : "homme";
            decoyPool = decoyPool.concat(shuffle((bucket[otherSexe] || []).filter(isAvailable)));
        }

        const decoys = decoyPool.slice(0, QUIESTCE_GRID_SIZE - 1);
        if (decoys.length < 3) continue; // pas assez de monde disponible pour une grille jouable

        usedNames.add(target.nom);
        usedPhotos.add(target.photo);
        decoys.forEach(d => {
            usedNames.add(d.nom);
            usedPhotos.add(d.photo);
        });

        round.push({
            nom: target.nom,
            fonction: target.fonction,
            autre: target.autre,
            correctPhoto: target.photo,
            photos: shuffle([target.photo, ...decoys.map(d => d.photo)])
        });
    }
    return round;
}

// Variante utilisée uniquement pour "présidentielle" : chacun des 10 noms à
// deviner est unique sur la manche (jamais deux fois la même personne à
// trouver). En revanche, les photos servant de LEURRES ne sont pas retirées
// du vivier une fois utilisées : elles peuvent réapparaître d'une question à
// l'autre, ce qui permet de tenir 10 questions même avec peu de candidats.
// Seule contrainte conservée : à l'intérieur d'UNE MÊME grille, la personne à
// trouver et les leurres sont tous différents les uns des autres.
function buildQuiestceRoundPresidentielle(bucket) {
    const usedTargetNames = new Set();
    const targets = shuffle([...(bucket.homme || []), ...(bucket.femme || [])]);
    const round = [];

    for (const target of targets) {
        if (round.length >= ROUND_LENGTH) break;
        if (usedTargetNames.has(target.nom)) continue;

        let decoyPool = shuffle((bucket[target.sexe] || []).filter(p => p.nom !== target.nom));
        if (decoyPool.length < QUIESTCE_GRID_SIZE - 1) {
            const otherSexe = target.sexe === "homme" ? "femme" : "homme";
            decoyPool = decoyPool.concat(shuffle((bucket[otherSexe] || []).filter(p => p.nom !== target.nom)));
        }

        // Une même personne ne doit pas apparaître deux fois DANS LA MÊME grille.
        const seenInGrid = new Set();
        const decoys = [];
        for (const d of decoyPool) {
            if (seenInGrid.has(d.nom)) continue;
            seenInGrid.add(d.nom);
            decoys.push(d);
            if (decoys.length >= QUIESTCE_GRID_SIZE - 1) break;
        }

        usedTargetNames.add(target.nom);

        round.push({
            nom: target.nom,
            fonction: target.fonction,
            autre: target.autre,
            correctPhoto: target.photo,
            photos: shuffle([target.photo, ...decoys.map(d => d.photo)])
        });
    }
    return round;
}

// ============================================================
// Affichage
// ============================================================
function buildGauge() {
    const g = $("gauge");
    g.innerHTML = "";
    for (let i = 0; i < ROUND_LENGTH; i++) {
        const seg = document.createElement("div");
        seg.className = "seg";
        seg.id = "seg-" + i;
        g.appendChild(seg);
    }
}

function updateGauge() {
    for (let i = 0; i < ROUND_LENGTH; i++) {
        const seg = $("seg-" + i);
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
    if (mode) currentMode = mode;
    if (niveau) currentNiveau = niveau;

    if (currentMode === "quiestce") {
        roundQuestions = buildQuiestceRound(currentNiveau);
    } else {
        roundQuestions = shuffle(poolFor(currentMode)).slice(0, ROUND_LENGTH).map(q => {
            return {
                ...q,
                shuffled: shuffle(q.propositions)
            };
        });
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
    $("screenIntro").classList.add("hidden");
    $("screenLevel").classList.add("hidden");
    $("screenEnd").classList.add("hidden");
    $("screenGame").classList.remove("hidden");
    showQuestion();
}

function showQuestion() {
    answered = false;
    const q = roundQuestions[currentIndex];
    updateGauge();

    $("reveal").classList.add("hidden");
    $("revealContext").textContent = "";
    $("revealSource").textContent = "";
    $("revealTimeout").classList.add("hidden");
    $("revealTimeout").textContent = "";
    $("revealFonction").classList.add("hidden");
    $("revealFonction").innerHTML = "";

    if (currentMode === "quiestce") {
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
    const isQuiestce = currentMode === "quiestce";
    const timedOut = correct === null;
    const isCorrect = correct === true;
    const maxPoints = isQuiestce ? QUIESTCE_MAX_POINTS : MAX_POINTS;

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

    let nextDelay = 1100;
    if (!isQuiestce && currentMode === "citations" && (q.source || q.contexte)) nextDelay = 3800;
    if (isQuiestce) nextDelay = 1800;

    setTimeout(() => {
        currentIndex++;
        if (currentIndex >= roundQuestions.length) {
            endGame();
        } else {
            showQuestion();
        }
    }, nextDelay);
}

function endGame() {
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
    cancelAnimationFrame(timerRAF);
    $("screenGame").classList.add("hidden");
    $("screenEnd").classList.add("hidden");
    $("screenLevel").classList.add("hidden");
    $("screenIntro").classList.remove("hidden");
    $("introBestQuiz").textContent = getBest("quiz");
    $("introBestCitations").textContent = getBest("citations");
}

function goLevelScreen() {
    $("screenIntro").classList.add("hidden");
    $("screenLevel").classList.remove("hidden");
}

function initUI() {
    $("btnStartQuiz").addEventListener("click", () => startGame("quiz"));
    $("btnStartCitations").addEventListener("click", () => startGame("citations"));
    $("btnGoLevel").addEventListener("click", goLevelScreen);
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
    $("introBestQuiz").textContent = getBest("quiz");
    $("introBestCitations").textContent = getBest("citations");
}

// ============================================================
// Démarrage
// ============================================================
(async function init() {
    initUI();
    try {
        await loadData();
    } catch (err) {
        console.error("Erreur de chargement des données :", err);
        $("screenIntro").innerHTML = "<p>Impossible de charger les données du jeu. Vérifie que le fichier est servi via un serveur local (pas ouvert en file://).</p>";
    }
})();
