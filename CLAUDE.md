# Tankoban Max — Rules for Claude

## Golden Rule
Do what I say and only what I say. Nothing more, nothing less.

## Workflow — Non-Negotiable

### 1. Commit and push after EVERY change
Every single edit, no matter how small, gets its own commit and push immediately. No batching. No "I'll commit later." Edit → commit → push. Every time.

### 2. Launch the app and verify your changes
After every edit, run the app yourself (`unset ELECTRON_RUN_AS_NODE && npm start`) and check the logs/output to confirm the change actually works. Do NOT blindly commit without verifying. If something looks wrong in the logs, fix it before telling me it's done.

### 3. Review your own edits for regressions
Before committing, re-read the diff. Ask yourself: "Did I break something else?" If you changed CSS, check that you didn't make something invisible. If you changed JS, check that you didn't remove a needed event listener. Think like a code reviewer, not just a code writer.

### 4. Think holistically before committing to a plan
Before writing a single line of code, understand how the change fits into the entire app. Read the surrounding code. Understand what depends on what. Don't fix one thing and break three others. A fix that causes new bugs is worse than no fix at all.

### 5. Ask questions until you are absolutely sure
If there is ANY ambiguity in what I'm asking, ask me. Ask me again. Keep asking until you are 100% certain you understand the problem and the desired outcome. Do not guess. Do not assume. Assumptions lead to wasted commits and broken features.

## Code Style
- Use `var`, not `let` or `const` — never change existing code style
- Comics `el` object lives in `shell/core.js` (global scope); Books `el` is in its own IIFE
- `ensureWebModulesLoaded()` lazy-loads web.js; access browser via `Tanko.web.openBrowser(source)`
- WebContentsViews render natively ON TOP of DOM — must zero bounds to show DOM overlays

## Environment
- Electron `^40.6.0` (Node.js v24.x internally)
- System Node.js: v22.x
- VS Code sets `ELECTRON_RUN_AS_NODE=1` — must `unset ELECTRON_RUN_AS_NODE` before `npm start`

## Task Discipline
- One task per session unless I explicitly say otherwise
- Don't bundle unrelated fixes into one session
