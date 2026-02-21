# Sudoku Party Pro / 数独派对 Pro

A browser-playable Sudoku game with bilingual UI (Chinese/English), daily challenge mode, score/penalty system, notes, undo/redo, audio feedback, and shareable progress links.

一个可直接在浏览器游玩的数独游戏，支持中英文切换，包含每日挑战、分数与扣分机制、候选笔记、撤销重做、音效反馈和进度分享链接。

## Demo / 运行方式

### EN
- Open `index.html` directly in a browser.
- Or run a local static server in this folder.

### 中文
- 直接在浏览器打开 `index.html`。
- 或在当前目录启动本地静态服务器后访问。

## Features / 功能

### EN
- Unique-solution puzzle generation.
- Difficulty levels (`easy`, `medium`, `hard`) with solver-based rating.
- Modes: `Normal` and `Daily`.
- Notes mode + auto-candidates + clear-candidates.
- Undo/redo, hint, erase, keyboard support.
- Score and penalty system with failure threshold.
- Win effects (fireworks/confetti/banner) + operation sound effects.
- Settings panel (language, contrast, font size, mute/volume, effect intensity).
- Result modal (time, score, mistakes, hints, candidate usage, rating).
- Local leaderboards (normal top 5 / daily top 5).
- Data export/import (`JSON`).
- Shareable progress link (includes seed/state/notes/time/penalty/mode/day).

### 中文
- 唯一解题盘生成。
- 难度分级（`easy` / `medium` / `hard`）并结合求解策略评分。
- 模式支持：`普通` 与 `每日挑战`。
- 候选笔记 + 自动候选 + 清空候选。
- 撤销/重做、提示、擦除、键盘操作。
- 分数与扣分机制，达到阈值可判负。
- 通关特效（烟花/彩带/横幅）与操作音效。
- 设置面板（语言、高对比、大字号、静音/音量、特效强度）。
- 结算弹层（用时、得分、错误、提示、候选使用、难度评分）。
- 本地排行榜（普通前 5 / 每日前 5）。
- 数据导出/导入（`JSON`）。
- 可分享进度链接（包含 seed/盘面/候选/用时/扣分/模式/日期）。

## Controls / 操作

### EN
- Number input: click number pad or press `1-9`.
- Erase: button or `Backspace/Delete/0`.
- Notes mode: toggle button, then enter numbers as candidates.
- Move selection: arrow keys.
- Undo/redo: buttons or `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, `Ctrl/Cmd+Shift+Z`.

### 中文
- 填数：点击数字键盘或按 `1-9`。
- 擦除：按钮或 `Backspace/Delete/0`。
- 笔记模式：切换后输入候选数字。
- 选格移动：方向键。
- 撤销/重做：按钮或 `Ctrl/Cmd+Z`、`Ctrl/Cmd+Y`、`Ctrl/Cmd+Shift+Z`。

## URL Params / URL 参数

### EN
The app stores/reads game state from query params (versioned):
- `v`: protocol version (current `3`)
- `seed`: puzzle seed
- `diff`: difficulty (`easy|medium|hard`)
- `mode`: `normal|daily`
- `day`: date for daily mode (`YYYY-MM-DD`)
- `state`: 81-char digits (board values)
- `notes`: encoded 81-cell notes bitmask
- `t`: elapsed seconds
- `p`: penalty points

### 中文
应用会通过 URL 查询参数读写状态（带版本）：
- `v`：协议版本（当前 `3`）
- `seed`：题盘种子
- `diff`：难度（`easy|medium|hard`）
- `mode`：`normal|daily`
- `day`：每日模式日期（`YYYY-MM-DD`）
- `state`：81 位盘面数字
- `notes`：81 格候选编码
- `t`：已用秒数
- `p`：扣分累计

## Local Storage / 本地存储

### EN
- `sudoku-party-scores-v3`: normal leaderboard
- `sudoku-party-daily-v1`: daily leaderboard
- `sudoku-party-settings-v1`: user settings
- Legacy read support: `sudoku-party-scores-v2`

### 中文
- `sudoku-party-scores-v3`：普通模式排行榜
- `sudoku-party-daily-v1`：每日挑战排行榜
- `sudoku-party-settings-v1`：用户设置
- 兼容读取旧键：`sudoku-party-scores-v2`

## Project Structure / 项目结构

```text
project-root
├── index.html   # single-file app (HTML/CSS/JS)
└── README.md
```

## Notes / 说明

### EN
- This project is intentionally single-file for portability and easy sharing.
- No backend dependency.

### 中文
- 项目刻意保持单文件，便于携带和分享。
- 无后端依赖。

## License / 开源协议

### EN
- This project is licensed under the **MIT License**.
- You can use, modify, distribute, and use commercially with attribution.

### 中文
- 本项目采用 **MIT License** 开源协议。
- 可在保留版权声明的前提下自由使用、修改、分发和商用。
