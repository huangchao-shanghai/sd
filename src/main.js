import { Constants, DIFFICULTIES, I18N } from "./config.js";
import { Generator, Solver, fmtSec, hashString, localToday, mulberry32 } from "./core/sudoku.js";
import { createStorage, createURLSync, sanitizeDailyScoresMap, sanitizeScoresMap } from "./io/persistence.js";

const els = {
  body: document.body,
  board: document.getElementById("board"),
  numPad: document.getElementById("numPad"),
  difficultyRow: document.getElementById("difficultyRow"),
  status: document.getElementById("status"),
  toast: document.getElementById("toast"),
  meta: document.getElementById("meta"),
  modeBadge: document.getElementById("modeBadge"),
  dayBadge: document.getElementById("dayBadge"),
  timer: document.getElementById("timer"),
  score: document.getElementById("score"),
  filled: document.getElementById("filled"),
  best: document.getElementById("best"),
  danger: document.getElementById("danger"),
  leaderboard: document.getElementById("leaderboard"),
  leaderboardTitle: document.getElementById("leaderboardTitle"),
  noteMode: document.getElementById("noteMode"),
  autoCandidates: document.getElementById("autoCandidates"),
  clearCandidates: document.getElementById("clearCandidates"),
  undo: document.getElementById("undo"),
  redo: document.getElementById("redo"),
  erase: document.getElementById("erase"),
  hint: document.getElementById("hint"),
  newGame: document.getElementById("newGame"),
  share: document.getElementById("share"),
  toggleSettings: document.getElementById("toggleSettings"),
  settingsModal: document.getElementById("settingsModal"),
  settingsTitle: document.getElementById("settingsTitle"),
  settingsClose: document.getElementById("settingsClose"),
  settingsPanel: document.getElementById("settingsPanel"),
  modeNormal: document.getElementById("modeNormal"),
  modeDaily: document.getElementById("modeDaily"),
  copyDailyLink: document.getElementById("copyDailyLink"),
  langZh: document.getElementById("langZh"),
  langEn: document.getElementById("langEn"),
  muteBtn: document.getElementById("muteBtn"),
  contrastBtn: document.getElementById("contrastBtn"),
  fontBtn: document.getElementById("fontBtn"),
  effectRow: document.getElementById("effectRow"),
  volumeLabel: document.getElementById("volumeLabel"),
  volumeSlider: document.getElementById("volumeSlider"),
  volumeText: document.getElementById("volumeText"),
  exportData: document.getElementById("exportData"),
  importData: document.getElementById("importData"),
  importFile: document.getElementById("importFile"),
  resultModal: document.getElementById("resultModal"),
  resultTitle: document.getElementById("resultTitle"),
  resultBody: document.getElementById("resultBody"),
  resultRetry: document.getElementById("resultRetry"),
  resultClose: document.getElementById("resultClose"),
  fireworks: document.getElementById("fireworks"),
  victoryBanner: document.getElementById("victoryBanner"),
};

const GameState = {
  cells: [],
  solution: [],
  puzzle: [],
  state: [],
  fixed: [],
  notes: [],
  selected: -1,
  gameSeed: 0,
  difficulty: "medium",
  mode: "normal",
  day: "",
  startedAt: 0,
  elapsedSeconds: 0,
  timer: null,
  completed: false,
  failed: false,
  noteMode: false,
  settingsModalOpen: false,
  penaltyPoints: 0,
  score: Constants.START_SCORE,
  wrongCount: 0,
  hintCount: 0,
  candidateUseCount: 0,
  undoStack: [],
  redoStack: [],
  difficultyScore: 0,
  difficultyTech: { naked: 0, hidden: 0, locked: 0 },
  urlSyncTimer: null,
  lastUrlHash: "",
  longPressTimer: null,
  longPressTriggered: false,
  modalLastFocused: null,
};

const Settings = {
  mute: false,
  volume: 0.7,
  effectIntensity: "medium",
  highContrast: false,
  largeFont: false,
  language: "zh",
};

const Storage = createStorage({ Constants, Settings });
const URLSync = createURLSync({ Constants, GameState, windowRef: window });

const AudioState = {
  ctx: null,
  ready: false,
};

const Effects = {
  ctx: els.fireworks.getContext("2d"),
};

function t(key, vars = {}) {
  const dict = I18N[Settings.language] || I18N.zh;
  let str = dict[key] ?? I18N.zh[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replaceAll(`{${k}}`, String(v));
  }
  return str;
}

function diffLabel(diffKey) {
  return t(`diff.${diffKey}`);
}

function setIconButtonText(el, icon, text) {
  el.textContent = "";
  const iconEl = document.createElement("span");
  iconEl.className = "btn-ico";
  iconEl.setAttribute("aria-hidden", "true");
  iconEl.textContent = icon;
  el.appendChild(iconEl);
  el.appendChild(document.createTextNode(text));
}

function toast(msg, ok = false) {
  els.toast.textContent = msg;
  els.toast.style.color = ok ? "#198754" : "#b23a48";
}

function setStatus(msg) {
  els.status.textContent = msg;
}

function ensureAudio() {
  if (Settings.mute) return false;
  if (!AudioState.ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    AudioState.ctx = new Ctx();
  }
  if (AudioState.ctx.state === "suspended") AudioState.ctx.resume();
  AudioState.ready = true;
  return true;
}

function playTone(freq, duration, type = "sine", volume = 0.05, when = 0) {
  if (Settings.mute) return;
  if (!AudioState.ready && !ensureAudio()) return;
  const now = AudioState.ctx.currentTime + when;
  const osc = AudioState.ctx.createOscillator();
  const gain = AudioState.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  const vol = volume * Settings.volume;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(AudioState.ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.03);
}

function playSfx(name) {
  if (Settings.mute) return;
  if (!AudioState.ready && !ensureAudio()) return;

  if (name === "fill-ok") {
    playTone(660, 0.09, "triangle", 0.04);
    playTone(880, 0.1, "triangle", 0.035, 0.06);
  } else if (name === "erase") {
    playTone(420, 0.06, "square", 0.03);
  } else if (name === "note") {
    playTone(720, 0.05, "sine", 0.02);
  } else if (name === "wrong") {
    playTone(220, 0.14, "sawtooth", 0.05);
    playTone(170, 0.12, "sawtooth", 0.04, 0.05);
  } else if (name === "hint") {
    playTone(540, 0.07, "triangle", 0.03);
    playTone(680, 0.08, "triangle", 0.03, 0.07);
  } else if (name === "undo") {
    playTone(500, 0.05, "sine", 0.02);
  } else if (name === "redo") {
    playTone(620, 0.05, "sine", 0.02);
  } else if (name === "fail") {
    playTone(210, 0.2, "sawtooth", 0.055);
    playTone(140, 0.22, "sawtooth", 0.05, 0.1);
  } else if (name === "win") {
    playTone(523, 0.09, "triangle", 0.04);
    playTone(659, 0.09, "triangle", 0.04, 0.1);
    playTone(784, 0.12, "triangle", 0.045, 0.2);
    playTone(1047, 0.16, "triangle", 0.045, 0.34);
  }
}

const Scoring = {
  recompute() {
    GameState.score = Math.max(0, Constants.START_SCORE - GameState.penaltyPoints);
    els.score.textContent = t("label.score", { score: GameState.score });
    els.danger.textContent = t("label.failThreshold", { n: Constants.FAIL_THRESHOLD });
  },
};

const UI = {
  applyLanguageTexts() {
    document.documentElement.lang = Settings.language === "en" ? "en" : "zh-CN";
    document.title = t("app.title");
    els.victoryBanner.textContent = Settings.language === "en" ? "Perfect! Sudoku Cleared" : "Perfect! 数独通关";
    const title = document.querySelector("h1");
    if (title) title.textContent = t("app.title");

    setIconButtonText(els.noteMode, "✎", t("btn.note"));
    setIconButtonText(els.undo, "↶", t("btn.undo"));
    setIconButtonText(els.redo, "↷", t("btn.redo"));
    setIconButtonText(els.erase, "⌫", t("btn.erase"));
    setIconButtonText(els.hint, "💡", t("btn.hint"));
    setIconButtonText(els.newGame, "⟳", t("btn.newGame"));
    setIconButtonText(els.share, "🔗", t("btn.share"));
    setIconButtonText(els.toggleSettings, "⚙", t("btn.settings"));
    setIconButtonText(els.copyDailyLink, "🔗", t("btn.copyDaily"));
    setIconButtonText(els.autoCandidates, "⚙", t("btn.autoCandidates"));
    setIconButtonText(els.clearCandidates, "⊘", t("btn.clearCandidates"));
    setIconButtonText(els.muteBtn, "🔊", t("btn.mute"));
    setIconButtonText(els.contrastBtn, "◐", t("btn.contrast"));
    setIconButtonText(els.fontBtn, "A+", t("btn.font"));
    setIconButtonText(els.exportData, "⬇", t("btn.export"));
    setIconButtonText(els.importData, "⬆", t("btn.import"));

    els.modeNormal.textContent = t("mode.normal");
    els.modeDaily.textContent = t("mode.daily");
    els.langZh.textContent = "中文";
    els.langEn.textContent = "English";
    els.resultRetry.textContent = t("btn.retry");
    els.resultClose.textContent = t("btn.close");
    els.settingsTitle.textContent = t("settings.title");
    els.settingsClose.textContent = t("btn.close");
    els.volumeLabel.textContent = t("label.volume");

    for (const btn of els.effectRow.querySelectorAll("button")) {
      const level = btn.dataset.effect;
      btn.textContent = t(`btn.effect.${level}`);
    }
  },
  applySettings() {
    this.applyLanguageTexts();
    els.body.classList.toggle("high-contrast", Settings.highContrast);
    els.body.classList.toggle("large-font", Settings.largeFont);
    els.muteBtn.classList.toggle("active", Settings.mute);
    els.muteBtn.setAttribute("aria-pressed", String(Settings.mute));
    els.contrastBtn.classList.toggle("active", Settings.highContrast);
    els.contrastBtn.setAttribute("aria-pressed", String(Settings.highContrast));
    els.fontBtn.classList.toggle("active", Settings.largeFont);
    els.fontBtn.setAttribute("aria-pressed", String(Settings.largeFont));
    els.langZh.classList.toggle("active", Settings.language === "zh");
    els.langEn.classList.toggle("active", Settings.language === "en");
    els.volumeSlider.value = String(Settings.volume);
    els.volumeText.textContent = `${Math.round(Settings.volume * 100)}%`;
    for (const btn of els.effectRow.querySelectorAll("button")) {
      btn.classList.toggle("active", btn.dataset.effect === Settings.effectIntensity);
    }
  },
  updateTimer() {
    els.timer.textContent = t("label.timer", { time: fmtSec(GameState.elapsedSeconds) });
  },
  updateBadges() {
    const modeText = GameState.mode === "daily" ? t("mode.daily") : t("mode.normal");
    els.modeBadge.textContent = t("label.mode", { mode: modeText });
    els.dayBadge.textContent = t("label.day", { day: GameState.day || "--" });
    els.meta.textContent = t("label.meta", { diff: diffLabel(GameState.difficulty), seed: GameState.gameSeed });
    els.modeNormal.classList.toggle("active", GameState.mode === "normal");
    els.modeDaily.classList.toggle("active", GameState.mode === "daily");
  },
  updateProgress() {
    const filled = GameState.state.filter((v) => v !== 0).length;
    els.filled.textContent = t("label.filled", { filled });
  },
  renderDifficultyButtons() {
    for (const btn of els.difficultyRow.querySelectorAll("button")) {
      btn.classList.toggle("active", btn.dataset.diff === GameState.difficulty);
    }
  },
  renderActionButtons() {
    els.noteMode.classList.toggle("active", GameState.noteMode);
    els.noteMode.setAttribute("aria-pressed", String(GameState.noteMode));
    els.undo.disabled = GameState.undoStack.length === 0;
    els.redo.disabled = GameState.redoStack.length === 0;
    els.undo.title = t("btn.undo");
    els.redo.title = t("btn.redo");
    els.toggleSettings.classList.toggle("active", GameState.settingsModalOpen);
    els.toggleSettings.setAttribute("aria-expanded", String(GameState.settingsModalOpen));
  },
  noteDigits(mask) {
    let out = "";
    for (let n = 1; n <= 9; n += 1) {
      if (mask & (1 << (n - 1))) out += String(n);
    }
    return out;
  },
  setCellAria(cell, i) {
    const r = Math.floor(i / 9) + 1;
    const c = (i % 9) + 1;
    const fixed = GameState.fixed[i] ? t("aria.fixed") : t("aria.editable");
    const value = GameState.state[i] || (GameState.notes[i] ? t("aria.candidates", { value: this.noteDigits(GameState.notes[i]) }) : t("aria.empty"));
    cell.setAttribute("aria-label", t("aria.cell", { r, c, fixed, value }));
  },
  renderBoard() {
    const conflicts = new Uint8Array(81);
    for (let i = 0; i < 81; i += 1) {
      if (GameState.state[i] === 0) continue;
      const v = GameState.state[i];
      for (const p of Generator.peers(i)) {
        if (GameState.state[p] === v) {
          conflicts[i] = 1;
          conflicts[p] = 1;
        }
      }
    }

    const peers = GameState.selected >= 0 ? Generator.peers(GameState.selected) : [];
    const peerFlags = new Uint8Array(81);
    for (const idx of peers) peerFlags[idx] = 1;

    GameState.cells.forEach((cell, i) => {
      cell.className = "cell";
      if (GameState.fixed[i]) cell.classList.add("fixed");
      else if (GameState.state[i] !== 0) cell.classList.add("input");

      if (GameState.selected === i) cell.classList.add("selected");
      else if (peerFlags[i]) cell.classList.add("peer");
      if (conflicts[i]) cell.classList.add("conflict");
      if (!conflicts[i] && GameState.state[i] !== 0 && GameState.state[i] === GameState.solution[i]) {
        cell.classList.add("good");
      }

      if (GameState.state[i] !== 0) {
        cell.textContent = String(GameState.state[i]);
      } else if (GameState.notes[i] !== 0) {
        cell.classList.add("note");
        cell.textContent = this.noteDigits(GameState.notes[i]);
      } else {
        cell.textContent = "";
      }

      this.setCellAria(cell, i);
    });

    this.renderActionButtons();
    this.updateProgress();
    Scoring.recompute();
    URLSync.schedule();

    if (GameState.failed) {
      setStatus(t("status.failed"));
    } else if (GameState.selected < 0) {
      setStatus(GameState.noteMode ? t("status.noteMode") : t("status.start"));
    } else if (GameState.fixed[GameState.selected]) {
      setStatus(t("status.fixed"));
    } else {
      const rr = Math.floor(GameState.selected / 9) + 1;
      const cc = (GameState.selected % 9) + 1;
      setStatus(t("status.pos", { r: rr, c: cc, mode: GameState.noteMode ? t("status.pos.noteSuffix") : "" }));
    }

    if (!GameState.completed && !GameState.failed && checkWin()) {
      Game.complete();
    }
  },
  renderLeaderboard() {
    els.leaderboard.innerHTML = "";
    if (GameState.mode === "daily") {
      const dayKey = `${GameState.day}:${GameState.difficulty}`;
      const map = Storage.readDailyScores();
      const list = Array.isArray(map[dayKey]) ? map[dayKey] : [];
      els.leaderboardTitle.textContent = t("leaderboard.daily", { day: GameState.day });
      if (list.length === 0) {
        const li = document.createElement("li");
        li.textContent = t("leaderboard.empty.daily");
        els.leaderboard.appendChild(li);
        els.best.textContent = t("label.best.none");
        return;
      }
      list.forEach((e, i) => {
        const li = document.createElement("li");
        li.textContent = `#${i + 1} ${fmtSec(e.time)} | ${e.score}`;
        els.leaderboard.appendChild(li);
      });
      els.best.textContent = t("label.best", { time: fmtSec(list[0].time), score: list[0].score });
      return;
    }

    const scores = Storage.readScores();
    const list = scores[GameState.difficulty] || [];
    els.leaderboardTitle.textContent = t("leaderboard.normal");
    if (list.length === 0) {
      const li = document.createElement("li");
      li.textContent = t("leaderboard.empty.normal");
      els.leaderboard.appendChild(li);
      els.best.textContent = t("label.best.none");
      return;
    }
    list.forEach((e, i) => {
      const li = document.createElement("li");
      li.textContent = `#${i + 1} ${fmtSec(e.time)} | ${e.score}`;
      els.leaderboard.appendChild(li);
    });
    els.best.textContent = t("label.best", { time: fmtSec(list[0].time), score: list[0].score });
  },
  openResultModal(title, lines) {
    if (GameState.settingsModalOpen) this.closeSettingsModal(false);
    GameState.modalLastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    els.resultTitle.textContent = title;
    els.resultBody.textContent = "";
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      els.resultBody.appendChild(p);
    }
    els.resultModal.classList.add("open");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      els.resultRetry.focus();
    });
  },
  modalFocusableElements(modalEl) {
    return Array.from(
      modalEl.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((node) => !node.hasAttribute("disabled"));
  },
  trapFocus(e, modalEl) {
    const focusables = this.modalFocusableElements(modalEl);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (!focusables.includes(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
      return;
    }
    if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
      return;
    }
  },
  closeResultModal() {
    els.resultModal.classList.remove("open");
    document.body.style.overflow = "";
    if (GameState.modalLastFocused && typeof GameState.modalLastFocused.focus === "function") {
      GameState.modalLastFocused.focus();
    }
    GameState.modalLastFocused = null;
  },
  openSettingsModal() {
    if (els.resultModal.classList.contains("open")) this.closeResultModal();
    GameState.settingsModalOpen = true;
    els.settingsModal.classList.add("open");
    document.body.style.overflow = "hidden";
    this.renderActionButtons();
    requestAnimationFrame(() => {
      els.settingsClose.focus();
    });
  },
  closeSettingsModal(restoreFocus = true) {
    GameState.settingsModalOpen = false;
    els.settingsModal.classList.remove("open");
    document.body.style.overflow = "";
    this.renderActionButtons();
    if (restoreFocus) els.toggleSettings.focus();
  },
};

function resizeFireworks() {
  els.fireworks.width = window.innerWidth;
  els.fireworks.height = window.innerHeight;
}

function vibrateWarn() {
  if (navigator.vibrate) navigator.vibrate([120, 50, 120]);
  els.board.classList.remove("shake");
  void els.board.offsetWidth;
  els.board.classList.add("shake");
}

function effectConfig() {
  if (Settings.effectIntensity === "low") return { bursts: 4, confetti: 80, frames: 100 };
  if (Settings.effectIntensity === "high") return { bursts: 12, confetti: 260, frames: 220 };
  return { bursts: 8, confetti: 160, frames: 160 };
}

function launchFireworks() {
  const cfg = effectConfig();
  const colors = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93", "#ff924c"];
  const particles = [];
  const confetti = [];

  els.body.classList.add("victory-flash");
  els.victoryBanner.classList.remove("show");
  void els.victoryBanner.offsetWidth;
  els.victoryBanner.classList.add("show");
  setTimeout(() => {
    els.body.classList.remove("victory-flash");
    els.victoryBanner.classList.remove("show");
  }, 1800);

  for (let b = 0; b < cfg.bursts; b += 1) {
    const cx = Math.random() * els.fireworks.width;
    const cy = Math.random() * (els.fireworks.height * 0.55);
    const count = 38;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 1 + Math.random() * 4;
      particles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 70 + Math.floor(Math.random() * 30), color: colors[Math.floor(Math.random() * colors.length)] });
    }
  }

  for (let i = 0; i < cfg.confetti; i += 1) {
    confetti.push({
      x: Math.random() * els.fireworks.width,
      y: -Math.random() * els.fireworks.height * 0.35,
      vx: -1 + Math.random() * 2,
      vy: 1.4 + Math.random() * 2.4,
      w: 4 + Math.random() * 4,
      h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: -0.1 + Math.random() * 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }

  let frame = 0;
  function step() {
    frame += 1;
    Effects.ctx.clearRect(0, 0, els.fireworks.width, els.fireworks.height);

    for (const p of particles) {
      if (p.life <= 0) continue;
      p.life -= 1;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      Effects.ctx.globalAlpha = Math.max(0, p.life / 100);
      Effects.ctx.fillStyle = p.color;
      Effects.ctx.beginPath();
      Effects.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      Effects.ctx.fill();
    }

    for (const c of confetti) {
      c.x += c.vx;
      c.y += c.vy;
      c.rot += c.vr;
      Effects.ctx.save();
      Effects.ctx.translate(c.x, c.y);
      Effects.ctx.rotate(c.rot);
      Effects.ctx.fillStyle = c.color;
      Effects.ctx.globalAlpha = frame < cfg.frames * 0.6 ? 0.85 : Math.max(0, (cfg.frames - frame) / (cfg.frames * 0.4));
      Effects.ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      Effects.ctx.restore();
    }

    Effects.ctx.globalAlpha = 1;
    if (frame < cfg.frames) requestAnimationFrame(step);
    else Effects.ctx.clearRect(0, 0, els.fireworks.width, els.fireworks.height);
  }

  requestAnimationFrame(step);
}

function startTimer(fromSeconds = 0) {
  if (GameState.timer) clearInterval(GameState.timer);
  GameState.elapsedSeconds = fromSeconds;
  GameState.startedAt = Date.now() - fromSeconds * 1000;
  UI.updateTimer();
  GameState.timer = setInterval(() => {
    if (!GameState.startedAt || GameState.completed || GameState.failed) return;
    GameState.elapsedSeconds = Math.floor((Date.now() - GameState.startedAt) / 1000);
    UI.updateTimer();
    URLSync.schedule();
  }, 1000);
}

function stopTimer() {
  if (GameState.timer) {
    clearInterval(GameState.timer);
    GameState.timer = null;
  }
}

function checkWin() {
  if (GameState.state.includes(0)) return false;
  for (let i = 0; i < 81; i += 1) {
    if (GameState.state[i] !== GameState.solution[i]) return false;
  }
  return true;
}

function snapshot() {
  return {
    state: GameState.state.slice(),
    notes: GameState.notes.slice(),
    penaltyPoints: GameState.penaltyPoints,
    elapsedSeconds: GameState.elapsedSeconds,
    completed: GameState.completed,
    failed: GameState.failed,
    selected: GameState.selected,
    wrongCount: GameState.wrongCount,
    hintCount: GameState.hintCount,
    candidateUseCount: GameState.candidateUseCount,
  };
}

function saveHistory() {
  GameState.undoStack.push(snapshot());
  if (GameState.undoStack.length > 200) GameState.undoStack.shift();
  GameState.redoStack = [];
}

function restoreSnapshot(snap) {
  GameState.state = snap.state.slice();
  GameState.notes = snap.notes.slice();
  GameState.penaltyPoints = snap.penaltyPoints;
  GameState.elapsedSeconds = snap.elapsedSeconds;
  GameState.completed = snap.completed;
  GameState.failed = snap.failed;
  GameState.selected = snap.selected;
  GameState.wrongCount = snap.wrongCount;
  GameState.hintCount = snap.hintCount;
  GameState.candidateUseCount = snap.candidateUseCount;
  Scoring.recompute();
  if (!GameState.completed && !GameState.failed) startTimer(GameState.elapsedSeconds);
  else stopTimer();
  UI.renderBoard();
}

function pushNormalScore(diff, sec, score) {
  const scores = Storage.readScores();
  const list = scores[diff] || [];
  list.push({ time: sec, score });
  list.sort((a, b) => (a.time !== b.time ? a.time - b.time : b.score - a.score));
  scores[diff] = list.slice(0, 5);
  Storage.writeScores(scores);
}

function pushDailyScore(day, diff, sec, score) {
  const all = Storage.readDailyScores();
  const key = `${day}:${diff}`;
  const list = Array.isArray(all[key]) ? all[key] : [];
  list.push({ time: sec, score });
  list.sort((a, b) => (a.time !== b.time ? a.time - b.time : b.score - a.score));
  all[key] = list.slice(0, 5);
  Storage.writeDailyScores(all);
  return all[key];
}

function applyPenalty(points, msg, sfx = "wrong") {
  GameState.penaltyPoints += points;
  Scoring.recompute();
  vibrateWarn();
  playSfx(sfx);
  toast(`${msg} (-${points})`, false);
  if (!GameState.failed && GameState.score <= Constants.FAIL_THRESHOLD) {
    GameState.failed = true;
    stopTimer();
    playSfx("fail");
    setStatus(t("status.failWithAction"));
    toast(t("toast.fail"), false);
    Game.openResult(false);
  }
}

function clearDigitFromPeers(idx, digit) {
  const bit = 1 << (digit - 1);
  for (const p of Generator.peers(idx)) {
    GameState.notes[p] &= ~bit;
  }
}

function autoCandidates() {
  saveHistory();
  let touched = 0;
  for (let i = 0; i < 81; i += 1) {
    if (GameState.state[i] !== 0 || GameState.fixed[i]) continue;
    const mask = Generator.candidateMask(GameState.state, i);
    const prev = GameState.notes[i];
    GameState.notes[i] = prev | mask;
    if (GameState.notes[i] !== prev) touched += 1;
  }
  GameState.candidateUseCount += 1;
  playSfx("note");
  toast(touched > 0 ? t("toast.autoCandidates.updated", { n: touched }) : t("toast.autoCandidates.latest"), true);
  UI.renderBoard();
}

function clearCandidates() {
  saveHistory();
  GameState.notes = new Array(81).fill(0);
  playSfx("erase");
  toast(t("toast.clearCandidates"), true);
  UI.renderBoard();
}

const Game = {
  generatePuzzle(seed, targetDiff) {
    const target = DIFFICULTIES[targetDiff];
    const randBase = mulberry32(seed);
    let best = null;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const full = new Array(81).fill(0);
      const rand = mulberry32(((seed ^ (attempt * 2654435761)) + Math.floor(randBase() * 1e9)) >>> 0);
      Generator.fill(rand, full, 0);

      const puzzle = full.slice();
      const indexes = Generator.shuffle([...Array(81).keys()], rand);
      let removed = 0;
      let guard = 0;

      for (const idx of indexes) {
        if (removed >= target.holes || guard > 600) break;
        guard += 1;
        const old = puzzle[idx];
        if (old === 0) continue;
        puzzle[idx] = 0;
        const solutions = Generator.countSolutions(puzzle, 2);
        if (solutions === 1) removed += 1;
        else puzzle[idx] = old;
      }

      const rating = Solver.solveAndRate(puzzle);
      const gotDiff = Solver.classify(rating);
      const cand = {
        solved: full,
        puzzle,
        score: rating.difficultyScore,
        tech: rating.stats,
        gotDiff,
        diffDistance: Math.abs(rating.difficultyScore - target.target),
      };

      if (!best || cand.diffDistance < best.diffDistance) best = cand;
      if (gotDiff === targetDiff) return cand;
    }

    return best;
  },
  load(seed, options = {}) {
    GameState.gameSeed = seed >>> 0;
    const gen = this.generatePuzzle(GameState.gameSeed, GameState.difficulty);
    GameState.solution = gen.solved;
    GameState.puzzle = gen.puzzle;
    GameState.state = gen.puzzle.slice();
    GameState.fixed = gen.puzzle.map((v) => v !== 0);
    GameState.notes = new Array(81).fill(0);
    GameState.selected = -1;
    GameState.completed = false;
    GameState.failed = false;
    GameState.noteMode = false;
    GameState.undoStack = [];
    GameState.redoStack = [];
    GameState.wrongCount = 0;
    GameState.hintCount = 0;
    GameState.candidateUseCount = 0;
    GameState.difficultyScore = gen.score;
    GameState.difficultyTech = gen.tech;
    els.body.classList.remove("victory-flash");
    els.victoryBanner.classList.remove("show");

    if (Array.isArray(options.progress) && options.progress.length === 81) {
      for (let i = 0; i < 81; i += 1) {
        if (!GameState.fixed[i] && options.progress[i] >= 0 && options.progress[i] <= 9) GameState.state[i] = options.progress[i];
      }
    }
    if (Array.isArray(options.notes) && options.notes.length === 81) {
      for (let i = 0; i < 81; i += 1) {
        if (!GameState.fixed[i] && GameState.state[i] === 0) GameState.notes[i] = options.notes[i] & 511;
      }
    }

    GameState.penaltyPoints = Number.isFinite(options.penaltyPoints) && options.penaltyPoints >= 0 ? Math.floor(options.penaltyPoints) : 0;
    Scoring.recompute();

    const initialSeconds = Number.isFinite(options.elapsed) && options.elapsed >= 0 ? Math.floor(options.elapsed) : 0;
    if (GameState.score <= Constants.FAIL_THRESHOLD) {
      GameState.failed = true;
      GameState.elapsedSeconds = initialSeconds;
      UI.updateTimer();
      stopTimer();
    } else {
      startTimer(initialSeconds);
    }

    UI.updateBadges();
    UI.renderDifficultyButtons();
    UI.renderLeaderboard();
    UI.renderBoard();
    toast(options.restore ? t("toast.restore") : t("toast.newPuzzle"), true);
  },
  complete() {
    GameState.completed = true;
    GameState.elapsedSeconds = Math.floor((Date.now() - GameState.startedAt) / 1000);
    stopTimer();
    playSfx("win");
    launchFireworks();

    if (GameState.mode === "daily") {
      const list = pushDailyScore(GameState.day, GameState.difficulty, GameState.elapsedSeconds, GameState.score);
      UI.renderLeaderboard();
      const rank = list.findIndex((x) => x.time === GameState.elapsedSeconds && x.score === GameState.score) + 1;
      this.openResult(true, rank);
    } else {
      pushNormalScore(GameState.difficulty, GameState.elapsedSeconds, GameState.score);
      UI.renderLeaderboard();
      this.openResult(true, null);
    }
    URLSync.flush(true);
  },
  openResult(win, dailyRank) {
    const title = win ? t("title.win") : t("title.fail");
    const reason = win ? t("result.winReason") : t("result.failReason");
    const lines = [
      reason,
      t("result.mode", { mode: GameState.mode === "daily" ? t("result.mode.daily", { day: GameState.day }) : t("result.mode.normal") }),
      t("result.diff", { diff: diffLabel(GameState.difficulty) }),
      t("result.time", { time: fmtSec(GameState.elapsedSeconds) }),
      t("result.score", { score: GameState.score }),
      t("result.wrong", { n: GameState.wrongCount }),
      t("result.hint", { n: GameState.hintCount }),
      t("result.candidate", { n: GameState.candidateUseCount }),
      t("result.rating", {
        score: GameState.difficultyScore,
        naked: GameState.difficultyTech.naked,
        hidden: GameState.difficultyTech.hidden,
        locked: GameState.difficultyTech.locked,
      }),
    ];
    if (GameState.mode === "daily" && dailyRank) lines.push(t("result.dailyRank", { n: dailyRank }));
    UI.openResultModal(title, lines);
  },
};

function toggleNote(index, n) {
  const bit = 1 << (n - 1);
  GameState.notes[index] ^= bit;
}

function writeNumber(n) {
  if (GameState.selected < 0 || GameState.fixed[GameState.selected] || GameState.completed || GameState.failed) return;
  saveHistory();

  if (GameState.noteMode && GameState.state[GameState.selected] === 0) {
    toggleNote(GameState.selected, n);
    GameState.candidateUseCount += 1;
    playSfx("note");
    toast(t("toast.noteUpdated"), true);
    UI.renderBoard();
    return;
  }

  if (GameState.solution[GameState.selected] !== n) {
    GameState.wrongCount += 1;
    applyPenalty(Constants.WRONG_PENALTY, t("toast.wrong"), "wrong");
    UI.renderBoard();
    return;
  }

  GameState.state[GameState.selected] = n;
  GameState.notes[GameState.selected] = 0;
  clearDigitFromPeers(GameState.selected, n);
  playSfx("fill-ok");
  toast(t("toast.correct"), true);
  UI.renderBoard();
}

function erase() {
  if (GameState.selected < 0 || GameState.fixed[GameState.selected] || GameState.completed || GameState.failed) return;
  saveHistory();
  GameState.state[GameState.selected] = 0;
  GameState.notes[GameState.selected] = 0;
  playSfx("erase");
  toast(t("toast.erased"), true);
  UI.renderBoard();
}

function giveHint() {
  if (GameState.completed || GameState.failed) return;
  const editable = [...Array(81).keys()].filter((i) => !GameState.fixed[i] && GameState.state[i] !== GameState.solution[i]);
  if (editable.length === 0) {
    toast(t("toast.noHint"), true);
    return;
  }
  saveHistory();
  const idx = editable[Math.floor(Math.random() * editable.length)];
  GameState.state[idx] = GameState.solution[idx];
  GameState.notes[idx] = 0;
  clearDigitFromPeers(idx, GameState.solution[idx]);
  GameState.selected = idx;
  GameState.hintCount += 1;
  applyPenalty(Constants.HINT_PENALTY, t("toast.hintUsed"), "hint");
  UI.renderBoard();
}

function undo() {
  if (GameState.undoStack.length === 0) {
    toast(t("toast.noUndo"), false);
    return;
  }
  GameState.redoStack.push(snapshot());
  const snap = GameState.undoStack.pop();
  restoreSnapshot(snap);
  playSfx("undo");
  toast(t("toast.undo"), true);
}

function redo() {
  if (GameState.redoStack.length === 0) {
    toast(t("toast.noRedo"), false);
    return;
  }
  GameState.undoStack.push(snapshot());
  const snap = GameState.redoStack.pop();
  restoreSnapshot(snap);
  playSfx("redo");
  toast(t("toast.redo"), true);
}

function createBoard() {
  els.board.innerHTML = "";
  GameState.cells = [];
  for (let i = 0; i < 81; i += 1) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.dataset.row = String(Math.floor(i / 9));
    cell.dataset.col = String(i % 9);
    cell.addEventListener("click", () => {
      GameState.selected = i;
      UI.renderBoard();
    });
    els.board.appendChild(cell);
    GameState.cells.push(cell);
  }
}

function createNumPad() {
  els.numPad.innerHTML = "";
  for (const n of Constants.DIGITS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "num-btn";
    btn.textContent = String(n);
    btn.addEventListener("click", () => writeNumber(n));
    els.numPad.appendChild(btn);
  }
}

function createDifficultyButtons() {
  els.difficultyRow.innerHTML = "";
  for (const key of Object.keys(DIFFICULTIES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.diff = key;
    btn.textContent = diffLabel(key);
    btn.addEventListener("click", () => {
      GameState.difficulty = key;
      UI.renderDifficultyButtons();
      UI.renderLeaderboard();
      startNewGame();
    });
    els.difficultyRow.appendChild(btn);
  }
}

function dailySeed(day, diff) {
  return hashString(`${day}:${diff}:daily`);
}

function startNewGame(options = {}) {
  const nowDay = localToday();
  if (GameState.mode === "daily") {
    GameState.day = options.day || nowDay;
    const seed = dailySeed(GameState.day, GameState.difficulty);
    Game.load(seed, options);
  } else {
    GameState.day = nowDay;
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    Game.load(seed, options);
  }
}

function setMode(mode) {
  if (!["normal", "daily"].includes(mode)) return;
  GameState.mode = mode;
  GameState.day = localToday();
  startNewGame();
}

function setLanguage(lang) {
  Settings.language = lang;
  Storage.writeSettings();
  UI.applySettings();
  createDifficultyButtons();
  UI.renderDifficultyButtons();
  UI.updateBadges();
  UI.renderLeaderboard();
  UI.renderBoard();
}

function exportData() {
  try {
    const payload = {
      version: Constants.EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      scores: Storage.readScores(),
      dailyScores: Storage.readDailyScores(),
      settings: Settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sudoku-party-backup-${localToday().replaceAll("-", "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(t("toast.export.ok"), true);
  } catch {
    toast(t("toast.export.fail"), false);
  }
}

async function importData(file) {
  try {
    if (!file || file.size > 1024 * 1024) {
      toast(t("toast.import.fail"), false);
      return;
    }
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || data.version !== Constants.EXPORT_VERSION) {
      toast(t("toast.import.badVersion"), false);
      return;
    }

    if (data.scores && typeof data.scores === "object") {
      Storage.writeScores(sanitizeScoresMap(data.scores, Constants.START_SCORE));
    }
    if (data.dailyScores && typeof data.dailyScores === "object") {
      Storage.writeDailyScores(sanitizeDailyScoresMap(data.dailyScores, Constants.START_SCORE));
    }
    if (data.settings && typeof data.settings === "object") {
      const s = data.settings;
      if (typeof s.mute === "boolean") Settings.mute = s.mute;
      if (Number.isFinite(s.volume)) Settings.volume = Math.max(0, Math.min(1, s.volume));
      if (["low", "medium", "high"].includes(s.effectIntensity)) Settings.effectIntensity = s.effectIntensity;
      if (typeof s.highContrast === "boolean") Settings.highContrast = s.highContrast;
      if (typeof s.largeFont === "boolean") Settings.largeFont = s.largeFont;
      if (["zh", "en"].includes(s.language)) Settings.language = s.language;
      Storage.writeSettings();
      UI.applySettings();
    }

    UI.renderLeaderboard();
    toast(t("toast.import.ok"), true);
  } catch {
    toast(t("toast.import.fail"), false);
  }
}

async function shareProgress() {
  URLSync.flush(true);
  const text = t("share.text", { url: window.location.href });
  try {
    if (navigator.share) {
      await navigator.share({ title: t("share.title"), text: t("share.invite"), url: window.location.href });
      toast(t("toast.share.system"), true);
      return;
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast(t("toast.share.copied"), true);
      return;
    }
    throw new Error("unsupported");
  } catch {
    toast(t("toast.share.fail"), false);
  }
}

async function copyDailyLink() {
  const u = new URL(window.location.href);
  u.searchParams.set("mode", "daily");
  u.searchParams.set("day", GameState.day);
  u.searchParams.set("diff", GameState.difficulty);
  u.searchParams.set("seed", String(dailySeed(GameState.day, GameState.difficulty)));
  u.searchParams.set("v", Constants.URL_VERSION);
  u.searchParams.delete("state");
  u.searchParams.delete("notes");
  u.searchParams.delete("t");
  u.searchParams.delete("p");

  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(u.toString());
      toast(t("toast.daily.copied"), true);
      return;
    }
    throw new Error("no clipboard");
  } catch {
    toast(t("toast.daily.copyFail"), false);
  }
}

function maybeConfirmNewGame() {
  const inProgress = !GameState.completed && !GameState.failed && GameState.state.some((v, i) => !GameState.fixed[i] && v !== 0);
  if (!inProgress) {
    startNewGame();
    return;
  }

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) {
    if (window.confirm(t("confirm.new.desktop"))) startNewGame();
    return;
  }

  if (!window.confirm(t("confirm.new.mobile"))) return;
  startNewGame();
}

function bindNewGameLongPress() {
  const btn = els.newGame;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) {
    btn.addEventListener("click", maybeConfirmNewGame);
    return;
  }

  const start = () => {
    GameState.longPressTriggered = false;
    GameState.longPressTimer = setTimeout(() => {
      GameState.longPressTriggered = true;
      startNewGame();
      toast(t("toast.longPressNew"), true);
    }, 450);
  };

  const end = () => {
    if (GameState.longPressTimer) {
      clearTimeout(GameState.longPressTimer);
      GameState.longPressTimer = null;
    }
  };

  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", () => {
    const wasLong = GameState.longPressTriggered;
    end();
    if (!wasLong) maybeConfirmNewGame();
  });
  btn.addEventListener("pointerleave", end);
  btn.addEventListener("pointercancel", end);
  btn.addEventListener("click", (e) => e.preventDefault());
}

function applyModeFromURL(url) {
  const m = url.searchParams.get("mode");
  if (m === "daily" || m === "normal") GameState.mode = m;
}

function bootstrapFromURL() {
  const url = new URL(window.location.href);
  applyModeFromURL(url);

  const diff = url.searchParams.get("diff");
  if (diff && DIFFICULTIES[diff]) GameState.difficulty = diff;

  const today = localToday();
  const day = url.searchParams.get("day");
  GameState.day = URLSync.parseDay(day, today);

  const version = url.searchParams.get("v");
  const supportsRestore = !version || version === Constants.URL_VERSION;
  const state = supportsRestore ? URLSync.decodeState(url.searchParams.get("state")) : null;
  const notes = supportsRestore ? URLSync.decodeNotes(url.searchParams.get("notes")) : null;
  const elapsed = supportsRestore ? URLSync.parseElapsed(url.searchParams.get("t")) : 0;
  const penalty = supportsRestore ? URLSync.parsePenalty(url.searchParams.get("p")) : 0;

  let seed = Number(url.searchParams.get("seed"));
  if (!Number.isFinite(seed) || seed <= 0) {
    seed = GameState.mode === "daily" ? dailySeed(GameState.day, GameState.difficulty) : ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  }

  if (GameState.mode === "daily") seed = dailySeed(GameState.day, GameState.difficulty);

  Game.load(seed, {
    progress: state,
    notes,
    elapsed,
    penaltyPoints: penalty,
    restore: Boolean(state || notes),
  });
}

function bindEvents() {
  document.addEventListener("pointerdown", ensureAudio, { passive: true });

  els.noteMode.addEventListener("click", () => {
    GameState.noteMode = !GameState.noteMode;
    playSfx("note");
    UI.renderBoard();
  });
  els.autoCandidates.addEventListener("click", autoCandidates);
  els.clearCandidates.addEventListener("click", clearCandidates);
  els.undo.addEventListener("click", undo);
  els.redo.addEventListener("click", redo);
  els.erase.addEventListener("click", erase);
  els.hint.addEventListener("click", giveHint);
  els.share.addEventListener("click", shareProgress);
  els.toggleSettings.addEventListener("click", () => {
    if (GameState.settingsModalOpen) UI.closeSettingsModal();
    else UI.openSettingsModal();
  });
  els.modeNormal.addEventListener("click", () => setMode("normal"));
  els.modeDaily.addEventListener("click", () => setMode("daily"));
  els.copyDailyLink.addEventListener("click", copyDailyLink);
  els.langZh.addEventListener("click", () => setLanguage("zh"));
  els.langEn.addEventListener("click", () => setLanguage("en"));

  bindNewGameLongPress();

  els.muteBtn.addEventListener("click", () => {
    Settings.mute = !Settings.mute;
    UI.applySettings();
    Storage.writeSettings();
    toast(Settings.mute ? t("toast.mute.on") : t("toast.mute.off"), true);
  });

  els.contrastBtn.addEventListener("click", () => {
    Settings.highContrast = !Settings.highContrast;
    UI.applySettings();
    Storage.writeSettings();
    toast(Settings.highContrast ? t("toast.contrast.on") : t("toast.contrast.off"), true);
  });

  els.fontBtn.addEventListener("click", () => {
    Settings.largeFont = !Settings.largeFont;
    UI.applySettings();
    Storage.writeSettings();
    toast(Settings.largeFont ? t("toast.font.on") : t("toast.font.off"), true);
  });

  els.volumeSlider.addEventListener("input", () => {
    Settings.volume = Number(els.volumeSlider.value);
    UI.applySettings();
    Storage.writeSettings();
    playTone(620, 0.03, "sine", 0.03);
  });

  for (const btn of els.effectRow.querySelectorAll("button")) {
    btn.addEventListener("click", () => {
      Settings.effectIntensity = btn.dataset.effect;
      UI.applySettings();
      Storage.writeSettings();
      toast(t("toast.effect", { name: t(`effect.${btn.dataset.effect}`) }), true);
    });
  }

  els.exportData.addEventListener("click", exportData);
  els.importData.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await importData(file);
    e.target.value = "";
  });

  els.resultClose.addEventListener("click", UI.closeResultModal);
  els.resultRetry.addEventListener("click", () => {
    UI.closeResultModal();
    startNewGame();
  });
  els.resultModal.addEventListener("click", (e) => {
    if (e.target === els.resultModal) UI.closeResultModal();
  });
  els.settingsClose.addEventListener("click", () => UI.closeSettingsModal());
  els.settingsModal.addEventListener("click", (e) => {
    if (e.target === els.settingsModal) UI.closeSettingsModal();
  });

  document.addEventListener("keydown", (e) => {
    if (els.resultModal.classList.contains("open")) {
      if (e.key === "Escape") {
        e.preventDefault();
        UI.closeResultModal();
        return;
      }
      if (e.key === "Tab") {
        UI.trapFocus(e, els.resultModal);
      }
      return;
    }
    if (GameState.settingsModalOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        UI.closeSettingsModal();
        return;
      }
      if (e.key === "Tab") {
        UI.trapFocus(e, els.settingsModal);
      }
      return;
    }

    ensureAudio();
    if (e.key >= "1" && e.key <= "9") {
      writeNumber(Number(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      e.preventDefault();
      erase();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      redo();
    } else if (e.key.toLowerCase() === "n") {
      e.preventDefault();
      GameState.noteMode = !GameState.noteMode;
      UI.renderBoard();
    } else if (e.key === "ArrowUp" && GameState.selected >= 9) {
      e.preventDefault();
      GameState.selected -= 9;
      UI.renderBoard();
    } else if (e.key === "ArrowDown" && GameState.selected <= 71 && GameState.selected >= 0) {
      e.preventDefault();
      GameState.selected += 9;
      UI.renderBoard();
    } else if (e.key === "ArrowLeft" && GameState.selected > 0) {
      e.preventDefault();
      GameState.selected -= 1;
      UI.renderBoard();
    } else if (e.key === "ArrowRight" && GameState.selected >= 0 && GameState.selected < 80) {
      e.preventDefault();
      GameState.selected += 1;
      UI.renderBoard();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (!GameState.startedAt || GameState.completed || GameState.failed) return;
    GameState.elapsedSeconds = Math.floor((Date.now() - GameState.startedAt) / 1000);
    UI.updateTimer();
    URLSync.schedule();
  });

  window.addEventListener("beforeunload", () => URLSync.flush(true));
  window.addEventListener("resize", resizeFireworks);
}

function init() {
  Storage.readSettings();
  Storage.writeSettings();
  UI.applySettings();
  createBoard();
  createNumPad();
  createDifficultyButtons();
  resizeFireworks();
  bindEvents();
  bootstrapFromURL();
}

init();
