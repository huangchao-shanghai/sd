const { test, expect } = require('@playwright/test');

function parseFilled(text) {
  const m = text.match(/(\d+)\s*\/\s*81/);
  if (!m) throw new Error(`Unable to parse filled count from: ${text}`);
  return Number(m[1]);
}

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

  if (!dfs()) throw new Error('Sudoku puzzle is unsolvable');
  return board;
}

test('board renders and supports hint/undo/redo', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#board .cell')).toHaveCount(81);

  const filledBefore = parseFilled(await page.locator('#filled').innerText());

  await page.click('#hint');
  await expect.poll(async () => parseFilled(await page.locator('#filled').innerText())).toBe(filledBefore + 1);

  await page.click('#undo');
  await expect.poll(async () => parseFilled(await page.locator('#filled').innerText())).toBe(filledBefore);

  await page.click('#redo');
  await expect.poll(async () => parseFilled(await page.locator('#filled').innerText())).toBe(filledBefore + 1);
});

test('settings can switch language and mode', async ({ page }) => {
  await page.goto('/');

  await page.click('#toggleSettings');
  await page.click('#langEn');
  await expect(page.locator('#settingsTitle')).toContainText('Settings');

  await page.click('#modeDaily');
  await expect(page.locator('#modeBadge')).toContainText(/Daily|每日/);
});

test('complete game flow: solve puzzle and verify result modal', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#board .cell')).toHaveCount(81);

  const cells = page.locator('#board .cell');
  const count = await cells.count();
  const initial = [];
  const fixed = [];

  for (let i = 0; i < count; i += 1) {
    const cell = cells.nth(i);
    const txt = (await cell.innerText()).trim();
    const cls = await cell.getAttribute('class');
    initial.push(/^[1-9]$/.test(txt) ? Number(txt) : 0);
    fixed.push(Boolean(cls && cls.includes('fixed')));
  }

  const solved = solveSudoku(initial);

  for (let i = 0; i < 81; i += 1) {
    if (fixed[i]) continue;
    await cells.nth(i).click();
    await page.keyboard.press(String(solved[i]));
  }

  await expect(page.locator('#resultModal')).toHaveClass(/open/);
  await expect(page.locator('#resultTitle')).toContainText(/You Win|恭喜通关/);
  await expect(page.locator('#resultBody')).toContainText(/solved this Sudoku board|完成了本局数独/);
  await expect(page.locator('#leaderboard li').first()).toBeVisible();
});
