import { Constants } from "../config.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function localToday() {
  const dtf = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = dtf.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

function fmtSec(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const Generator = {
  shuffle(arr, rand) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  },
  row(idx) { return Math.floor(idx / Constants.SIZE); },
  col(idx) { return idx % Constants.SIZE; },
  boxStartRow(r) { return Math.floor(r / Constants.BOX) * Constants.BOX; },
  boxStartCol(c) { return Math.floor(c / Constants.BOX) * Constants.BOX; },
  canPlace(grid, idx, n) {
    const r = this.row(idx);
    const c = this.col(idx);
    for (let i = 0; i < 9; i += 1) {
      if (grid[r * 9 + i] === n) return false;
      if (grid[i * 9 + c] === n) return false;
    }
    const br = this.boxStartRow(r);
    const bc = this.boxStartCol(c);
    for (let rr = br; rr < br + 3; rr += 1) {
      for (let cc = bc; cc < bc + 3; cc += 1) {
        if (grid[rr * 9 + cc] === n) return false;
      }
    }
    return true;
  },
  fill(rand, grid = new Array(81).fill(0), idx = 0) {
    while (idx < 81 && grid[idx] !== 0) idx += 1;
    if (idx === 81) return true;
    for (const n of this.shuffle(Constants.DIGITS, rand)) {
      if (!this.canPlace(grid, idx, n)) continue;
      grid[idx] = n;
      if (this.fill(rand, grid, idx + 1)) return true;
      grid[idx] = 0;
    }
    return false;
  },
  candidateMask(grid, idx) {
    if (grid[idx] !== 0) return 0;
    let mask = 0;
    for (let n = 1; n <= 9; n += 1) {
      if (this.canPlace(grid, idx, n)) mask |= 1 << (n - 1);
    }
    return mask;
  },
  bitCount(mask) {
    let x = mask;
    let c = 0;
    while (x) {
      x &= x - 1;
      c += 1;
    }
    return c;
  },
  firstBitDigit(mask) {
    for (let n = 1; n <= 9; n += 1) {
      if (mask & (1 << (n - 1))) return n;
    }
    return 0;
  },
  findBestCell(grid) {
    let bestIdx = -1;
    let bestMask = 0;
    let minCount = 10;
    for (let i = 0; i < 81; i += 1) {
      if (grid[i] !== 0) continue;
      const mask = this.candidateMask(grid, i);
      const cnt = this.bitCount(mask);
      if (cnt === 0) return { idx: i, mask: 0, count: 0 };
      if (cnt < minCount) {
        minCount = cnt;
        bestIdx = i;
        bestMask = mask;
        if (cnt === 1) break;
      }
    }
    return { idx: bestIdx, mask: bestMask, count: minCount };
  },
  countSolutions(grid, limit = 2) {
    let count = 0;
    const arr = grid.slice();
    const dfs = () => {
      if (count >= limit) return;
      const best = this.findBestCell(arr);
      if (best.idx === -1) {
        count += 1;
        return;
      }
      if (best.count === 0) return;

      for (let n = 1; n <= 9; n += 1) {
        const bit = 1 << (n - 1);
        if (!(best.mask & bit)) continue;
        arr[best.idx] = n;
        dfs();
        arr[best.idx] = 0;
        if (count >= limit) return;
      }
    };
    dfs();
    return count;
  },
  buildPeerCache() {
    return Array.from({ length: 81 }, (_, index) => {
      const r = this.row(index);
      const c = this.col(index);
      const set = new Set();
      for (let i = 0; i < 9; i += 1) {
        set.add(r * 9 + i);
        set.add(i * 9 + c);
      }
      const br = this.boxStartRow(r);
      const bc = this.boxStartCol(c);
      for (let rr = br; rr < br + 3; rr += 1) {
        for (let cc = bc; cc < bc + 3; cc += 1) set.add(rr * 9 + cc);
      }
      set.delete(index);
      return [...set];
    });
  },
};

const PEER_CACHE = Generator.buildPeerCache();
Generator.peers = (index) => PEER_CACHE[index];

const Solver = {
  allUnits() {
    const units = [];
    for (let r = 0; r < 9; r += 1) units.push([...Array(9)].map((_, c) => r * 9 + c));
    for (let c = 0; c < 9; c += 1) units.push([...Array(9)].map((_, r) => r * 9 + c));
    for (let br = 0; br < 3; br += 1) {
      for (let bc = 0; bc < 3; bc += 1) {
        const u = [];
        for (let r = br * 3; r < br * 3 + 3; r += 1) {
          for (let c = bc * 3; c < bc * 3 + 3; c += 1) u.push(r * 9 + c);
        }
        units.push(u);
      }
    }
    return units;
  },
  solveAndRate(puzzle) {
    const grid = puzzle.slice();
    const notes = new Array(81).fill(0);
    const stats = { naked: 0, hidden: 0, locked: 0 };
    const units = this.allUnits();

    const computeAllNotes = () => {
      for (let i = 0; i < 81; i += 1) {
        notes[i] = grid[i] === 0 ? Generator.candidateMask(grid, i) : 0;
      }
    };

    const setCell = (idx, n, kind) => {
      grid[idx] = n;
      notes[idx] = 0;
      if (kind && stats[kind] !== undefined) stats[kind] += 1;
    };

    const applyNakedSingle = () => {
      for (let i = 0; i < 81; i += 1) {
        if (grid[i] !== 0) continue;
        const m = notes[i];
        if (m && Generator.bitCount(m) === 1) {
          setCell(i, Generator.firstBitDigit(m), "naked");
          return true;
        }
      }
      return false;
    };

    const applyHiddenSingle = () => {
      for (const unit of units) {
        for (let n = 1; n <= 9; n += 1) {
          const bit = 1 << (n - 1);
          let pos = -1;
          let cnt = 0;
          for (const idx of unit) {
            if (grid[idx] === 0 && (notes[idx] & bit)) {
              cnt += 1;
              pos = idx;
              if (cnt > 1) break;
            }
          }
          if (cnt === 1) {
            setCell(pos, n, "hidden");
            return true;
          }
        }
      }
      return false;
    };

    const applyLockedCandidates = () => {
      for (let br = 0; br < 3; br += 1) {
        for (let bc = 0; bc < 3; bc += 1) {
          const box = [];
          for (let r = br * 3; r < br * 3 + 3; r += 1) {
            for (let c = bc * 3; c < bc * 3 + 3; c += 1) box.push(r * 9 + c);
          }
          for (let n = 1; n <= 9; n += 1) {
            const bit = 1 << (n - 1);
            const holders = box.filter((idx) => grid[idx] === 0 && (notes[idx] & bit));
            if (holders.length <= 1) continue;
            const rows = new Set(holders.map((idx) => Math.floor(idx / 9)));
            const cols = new Set(holders.map((idx) => idx % 9));

            if (rows.size === 1) {
              const row = [...rows][0];
              let changed = false;
              for (let c = 0; c < 9; c += 1) {
                const idx = row * 9 + c;
                if (box.includes(idx) || grid[idx] !== 0) continue;
                if (notes[idx] & bit) {
                  notes[idx] &= ~bit;
                  changed = true;
                }
              }
              if (changed) {
                stats.locked += 1;
                return true;
              }
            }

            if (cols.size === 1) {
              const col = [...cols][0];
              let changed = false;
              for (let r = 0; r < 9; r += 1) {
                const idx = r * 9 + col;
                if (box.includes(idx) || grid[idx] !== 0) continue;
                if (notes[idx] & bit) {
                  notes[idx] &= ~bit;
                  changed = true;
                }
              }
              if (changed) {
                stats.locked += 1;
                return true;
              }
            }
          }
        }
      }
      return false;
    };

    computeAllNotes();
    let guard = 0;
    while (guard < 1000) {
      guard += 1;
      if (!grid.includes(0)) break;
      if (applyNakedSingle()) {
        computeAllNotes();
        continue;
      }
      if (applyHiddenSingle()) {
        computeAllNotes();
        continue;
      }
      if (applyLockedCandidates()) {
        continue;
      }
      break;
    }

    const solved = !grid.includes(0);
    const difficultyScore = stats.naked * 1 + stats.hidden * 2 + stats.locked * 7;
    return { solved, difficultyScore, stats };
  },
  classify(result) {
    const { difficultyScore, stats } = result;
    if (stats.locked === 0 && difficultyScore <= 30) return "easy";
    if (difficultyScore <= 80 && stats.locked <= 4) return "medium";
    return "hard";
  },
};

export { Generator, Solver, mulberry32, hashString, localToday, fmtSec };
