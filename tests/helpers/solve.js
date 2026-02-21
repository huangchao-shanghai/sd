function solveSudoku(input) {
  const board = input.slice();

  function isValid(idx, n) {
    const r = Math.floor(idx / 9);
    const c = idx % 9;

    for (let i = 0; i < 9; i += 1) {
      if (board[r * 9 + i] === n) return false;
      if (board[i * 9 + c] === n) return false;
    }

    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr += 1) {
      for (let cc = bc; cc < bc + 3; cc += 1) {
        if (board[rr * 9 + cc] === n) return false;
      }
    }

    return true;
  }

  function nextEmpty() {
    let bestIdx = -1;
    let bestCandidates = null;
    for (let i = 0; i < 81; i += 1) {
      if (board[i] !== 0) continue;
      const candidates = [];
      for (let n = 1; n <= 9; n += 1) {
        if (isValid(i, n)) candidates.push(n);
      }
      if (candidates.length === 0) return { idx: i, candidates };
      if (!bestCandidates || candidates.length < bestCandidates.length) {
        bestIdx = i;
        bestCandidates = candidates;
        if (candidates.length === 1) break;
      }
    }
    return { idx: bestIdx, candidates: bestCandidates || [] };
  }

  function dfs() {
    const { idx, candidates } = nextEmpty();
    if (idx === -1) return true;
    for (const n of candidates) {
      board[idx] = n;
      if (dfs()) return true;
      board[idx] = 0;
    }
    return false;
  }

  if (!dfs()) throw new Error("Sudoku puzzle is unsolvable");
  return board;
}

module.exports = { solveSudoku };
