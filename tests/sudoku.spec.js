const { test, expect } = require('@playwright/test');
const { solveSudoku } = require('./helpers/solve');

function parseFilled(text) {
  const m = text.match(/(\d+)\s*\/\s*81/);
  if (!m) throw new Error(`Unable to parse filled count from: ${text}`);
  return Number(m[1]);
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
