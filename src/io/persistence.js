function clampInt(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

function sanitizeScoreEntry(entry, fallbackScore) {
  if (typeof entry === "number") {
    const time = clampInt(entry, 0, 360000);
    return time === null ? null : { time, score: fallbackScore };
  }
  if (!entry || typeof entry !== "object") return null;
  const time = clampInt(entry.time, 0, 360000);
  const score = clampInt(entry.score, 0, 999999);
  if (time === null || score === null) return null;
  return { time, score };
}

function sanitizeScoresMap(rawScores, fallbackScore) {
  const base = { easy: [], medium: [], hard: [] };
  if (!rawScores || typeof rawScores !== "object") return base;
  for (const key of ["easy", "medium", "hard"]) {
    const list = Array.isArray(rawScores[key]) ? rawScores[key] : [];
    base[key] = list
      .map((entry) => sanitizeScoreEntry(entry, fallbackScore))
      .filter(Boolean)
      .sort((a, b) => (a.time !== b.time ? a.time - b.time : b.score - a.score))
      .slice(0, 5);
  }
  return base;
}

function sanitizeDailyScoresMap(raw, fallbackScore) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}:(easy|medium|hard)$/.test(key)) continue;
    if (!Array.isArray(value)) continue;
    out[key] = value
      .map((entry) => sanitizeScoreEntry(entry, fallbackScore))
      .filter(Boolean)
      .sort((a, b) => (a.time !== b.time ? a.time - b.time : b.score - a.score))
      .slice(0, 5);
  }
  return out;
}

function createStorage({ Constants, Settings }) {
  return {
    detectLanguage() {
      const lang = (navigator.language || "").toLowerCase();
      return lang.startsWith("zh") ? "zh" : "en";
    },
    readSettings() {
      try {
        const raw = localStorage.getItem(Constants.SETTINGS_KEY);
        if (!raw) {
          Settings.language = this.detectLanguage();
          return;
        }
        const data = JSON.parse(raw);
        if (typeof data.mute === "boolean") Settings.mute = data.mute;
        if (Number.isFinite(data.volume)) Settings.volume = Math.min(1, Math.max(0, data.volume));
        if (["low", "medium", "high"].includes(data.effectIntensity)) Settings.effectIntensity = data.effectIntensity;
        if (typeof data.highContrast === "boolean") Settings.highContrast = data.highContrast;
        if (typeof data.largeFont === "boolean") Settings.largeFont = data.largeFont;
        if (["zh", "en"].includes(data.language)) Settings.language = data.language;
        else Settings.language = this.detectLanguage();
      } catch {
        Settings.language = this.detectLanguage();
      }
    },
    writeSettings() {
      try {
        localStorage.setItem(Constants.SETTINGS_KEY, JSON.stringify(Settings));
      } catch (err) {
        console.warn("Failed to persist settings:", err);
      }
    },
    readScores() {
      try {
        const raw = localStorage.getItem(Constants.SCORE_KEY);
        if (!raw) return { easy: [], medium: [], hard: [] };
        return sanitizeScoresMap(JSON.parse(raw), Constants.START_SCORE);
      } catch {
        return { easy: [], medium: [], hard: [] };
      }
    },
    writeScores(scores) {
      try {
        const safe = sanitizeScoresMap(scores, Constants.START_SCORE);
        localStorage.setItem(Constants.SCORE_KEY, JSON.stringify(safe));
      } catch (err) {
        console.warn("Failed to persist scores:", err);
      }
    },
    readDailyScores() {
      try {
        const raw = localStorage.getItem(Constants.DAILY_SCORE_KEY);
        if (!raw) return {};
        return sanitizeDailyScoresMap(JSON.parse(raw), Constants.START_SCORE);
      } catch {
        return {};
      }
    },
    writeDailyScores(data) {
      try {
        const safe = sanitizeDailyScoresMap(data, Constants.START_SCORE);
        localStorage.setItem(Constants.DAILY_SCORE_KEY, JSON.stringify(safe));
      } catch (err) {
        console.warn("Failed to persist daily scores:", err);
      }
    },
  };
}

function createURLSync({ Constants, GameState, windowRef }) {
  const MAX_TIME_SECONDS = 360000;
  const MAX_PENALTY = 999999;

  return {
    encodeState(arr) { return arr.map((n) => String(n)).join(""); },
    decodeState(text) {
      if (!text || text.length !== 81 || !/^[0-9]+$/.test(text)) return null;
      return text.split("").map((c) => Number(c));
    },
    encodeNotes(arr) {
      return arr.map((n) => n.toString(36).padStart(2, "0")).join("");
    },
    decodeNotes(text) {
      if (!text || text.length !== 162 || !/^[0-9a-z]+$/.test(text)) return null;
      const out = [];
      for (let i = 0; i < 162; i += 2) {
        const val = Number.parseInt(text.slice(i, i + 2), 36);
        if (!Number.isFinite(val) || val < 0 || val > 511) return null;
        out.push(val);
      }
      return out;
    },
    parseElapsed(raw) {
      const val = Number(raw);
      return clampInt(val, 0, MAX_TIME_SECONDS) ?? 0;
    },
    parsePenalty(raw) {
      const val = Number(raw);
      return clampInt(val, 0, MAX_PENALTY) ?? 0;
    },
    parseDay(raw, fallback) {
      if (typeof raw !== "string") return fallback;
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
    },
    makeURL() {
      const url = new URL(windowRef.location.href);
      url.searchParams.set("v", Constants.URL_VERSION);
      url.searchParams.set("seed", String(GameState.gameSeed));
      url.searchParams.set("diff", GameState.difficulty);
      url.searchParams.set("mode", GameState.mode);
      url.searchParams.set("day", GameState.day);
      url.searchParams.set("state", this.encodeState(GameState.state));
      url.searchParams.set("notes", this.encodeNotes(GameState.notes));
      url.searchParams.set("t", String(GameState.elapsedSeconds));
      url.searchParams.set("p", String(GameState.penaltyPoints));
      return url;
    },
    flush(force = false) {
      if (GameState.urlSyncTimer) {
        clearTimeout(GameState.urlSyncTimer);
        GameState.urlSyncTimer = null;
      }
      const url = this.makeURL();
      const hash = url.search;
      if (!force && hash === GameState.lastUrlHash) return;
      history.replaceState({}, "", url);
      GameState.lastUrlHash = hash;
    },
    schedule() {
      if (GameState.urlSyncTimer) return;
      GameState.urlSyncTimer = setTimeout(() => {
        GameState.urlSyncTimer = null;
        this.flush(false);
      }, 300);
    },
  };
}

export { createStorage, createURLSync, sanitizeDailyScoresMap, sanitizeScoresMap };
