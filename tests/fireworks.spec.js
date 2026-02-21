const { test, expect } = require('@playwright/test');
const { solveSudoku } = require('./helpers/solve');

test('complete game triggers victory effects', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('#board .cell')).toHaveCount(81);

  const cells = page.locator('#board .cell');
  const initial = [];
  const fixed = [];

  for (let i = 0; i < 81; i += 1) {
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
  await expect
    .poll(async () => ((await page.locator('body').getAttribute('class')) || '').includes('victory-flash'))
    .toBe(true);
  await expect
    .poll(async () => ((await page.locator('#victoryBanner').getAttribute('class')) || '').includes('show'))
    .toBe(true);

  if (testInfo.project.use.headless === false) {
    await page.waitForTimeout(5000);
  }
});
