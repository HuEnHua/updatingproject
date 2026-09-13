import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const all = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');
const end = all.indexOf('// === PURE LOGIC END ===');
const code = all.slice(0, end) +
  `\n;globalThis.X={BUILD,SCHEMA_VERSION,CONFIG,DESIGN,TREATMENTS,treatmentFromUniform,treatmentByKey,
    cellOf,coordForStage,advisorForStage,signalOf,buildTrialPlan,armsForCells,winProbability,
    settlePayment,loopResidual,loopWeights,shuffleWith};`;
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const X = ctx.X;

let failures = 0;
const A = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg); };
const close = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

// ---- Treatment arms -------------------------------------------------
A(X.TREATMENTS.length === 4, 'four disclosure arms');
A(X.TREATMENTS.filter(t => t.identity === 'named').length === 2, 'two arms name the advisors');
A(X.TREATMENTS.filter(t => t.accuracy === 'shown').length === 2, 'two arms disclose marginal accuracy');
const keys = new Set(X.TREATMENTS.map(t => t.identity + '/' + t.accuracy));
A(keys.size === 4, 'the arms are the full identity x accuracy crossing');
const drawn = [0.01, 0.3, 0.6, 0.99].map(u => X.treatmentFromUniform(u).key);
A(new Set(drawn).size === 4, 'a uniform draw can reach every arm');
A(X.treatmentByKey('blind_accuracy').identity === 'blind', 'arms are addressable by key for piloting');

// ---- Coordinates ----------------------------------------------------
const photo = { id: 'x', claude: 'G', gpt: 'b', older: true };
A(X.cellOf(photo) === 'Gb', 'the cell is the capital-first pair');
A(X.coordForStage(photo, 'ST', 1) === 'G', 'first report under ST carries Claude\'s signal');
A(X.coordForStage(photo, 'TS', 1) === 'b', 'first report under TS carries GPT\'s signal');
A(X.coordForStage(photo, 'ST', 2) === X.coordForStage(photo, 'TS', 2),
  'the cell label does not depend on the order of arrival');
A(X.advisorForStage('ST', 1) === 'claude' && X.advisorForStage('TS', 1) === 'gpt', 'arm sets who speaks first');
A(X.signalOf(photo, 'gpt') === 'b', 'signals are read off the right model');

// ---- Session plan ---------------------------------------------------
let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const bank = [];
let n = 0;
for (const cell of ['Gg', 'Gb', 'Bg', 'Bb']) {
  for (let i = 0; i < 14; i++) {
    bank.push({ id: 'p' + (++n), claude: cell[0], gpt: cell[1], older: i % 2 === 0 });
  }
}
const plan = X.buildTrialPlan(bank, X.CONFIG.cellQuota, rand, {});
A(plan.length === 20, 'a session is twenty photographs');
const byCell = {};
plan.forEach(p => { byCell[p.cell] = (byCell[p.cell] || 0) + 1; });
A(Object.values(byCell).every(v => v === 5), 'the four agreement cells are equally represented');
const st = plan.filter(p => p.arm === 'ST').length;
A(st === 10, 'the two orders are balanced across the session');
Object.keys(byCell).forEach(c => {
  const inCell = plan.filter(p => p.cell === c);
  const stHere = inCell.filter(p => p.arm === 'ST').length;
  A(Math.abs(stHere - inCell.length / 2) <= 0.5, 'orders are balanced inside cell ' + c);
});
A(new Set(plan.map(p => p.photoId)).size === 20, 'no photograph repeats within a session');
A(plan.every(p => p.coord2 === p.cell), 'every second report lands in its own cell');
const firstCoords = new Set(plan.map(p => p.coord1));
A(['G', 'B', 'g', 'b'].every(c => firstCoords.has(c)), 'all four single-signal coordinates are reached');
let threw = false;
try { X.buildTrialPlan(bank.slice(0, 6), X.CONFIG.cellQuota, rand, {}); } catch (_) { threw = true; }
A(threw, 'a bank too thin in some cell is refused rather than silently unbalanced');

// ---- Scoring rule ---------------------------------------------------
A(close(X.winProbability(100, true), 1), 'a confident correct report wins for sure');
A(close(X.winProbability(100, false), 0), 'a confident wrong report cannot win');
A(close(X.winProbability(50, true), 0.75) && close(X.winProbability(50, false), 0.75), 'fifty is symmetric');
// Truthful reporting maximises the expected chance, whatever the belief.
for (const belief of [0.1, 0.35, 0.5, 0.72, 0.9]) {
  const expected = r => belief * X.winProbability(r, true) + (1 - belief) * X.winProbability(r, false);
  let best = 0;
  for (let r = 0; r <= 100; r++) if (expected(r) > expected(best)) best = r;
  A(Math.abs(best - belief * 100) <= 0.5, 'truth-telling is optimal at a belief of ' + belief);
}

// ---- Settlement -----------------------------------------------------
const bankById = {}; bank.forEach(p => { bankById[p.id] = p; });
const records = plan.map(p => Object.assign({}, p, { report1: 30, report2: 70 }));
const paidStage1 = X.settlePayment(records, bankById, { trial: 0, stage: 0.1, win: 0 });
const paidStage2 = X.settlePayment(records, bankById, { trial: 0, stage: 0.9, win: 0 });
A(paidStage1.stage === 1 && paidStage1.report === 30, 'the first report can be the one that pays');
A(paidStage2.stage === 2 && paidStage2.report === 70, 'the second report can be the one that pays');
A(paidStage1.won === true, 'a draw below the win probability pays the prize');
A(X.settlePayment(records, bankById, { trial: 0, stage: 0.1, win: 0.999 }).prizeHKD === 0, 'a draw above it does not');

// ---- Loop consistency, the object the design measures ---------------
// Build a genuine joint distribution and confirm its induced profile closes the
// square; then perturb one coordinate and confirm the residual moves off zero.
function profileFrom(q, p) {
  const wGg = q.Gg, wGb = q.Gb, wBg = q.Bg, wBb = q.Bb;
  return {
    Gg: p.Gg, Gb: p.Gb, Bg: p.Bg, Bb: p.Bb,
    G: (wGg * p.Gg + wGb * p.Gb) / (wGg + wGb),
    B: (wBg * p.Bg + wBb * p.Bb) / (wBg + wBb),
    g: (wGg * p.Gg + wBg * p.Bg) / (wGg + wBg),
    b: (wGb * p.Gb + wBb * p.Bb) / (wGb + wBb),
  };
}
const q = { Gg: 0.4, Gb: 0.1, Bg: 0.15, Bb: 0.35 };
const cellBeliefs = { Gg: 0.9, Gb: 0.55, Bg: 0.4, Bb: 0.08 };
const coherent = profileFrom(q, cellBeliefs);
const lc = X.loopResidual(coherent);
A(lc.martingale, 'every single-signal belief lies inside its two successors');
A(Math.abs(lc.residual) < 1e-9, 'a profile from a real joint distribution closes the loop');
const bent = Object.assign({}, coherent, { G: coherent.G + 0.05 });
A(Math.abs(X.loopResidual(bent).residual) > 0.1, 'moving one report opens the loop');
A(X.loopResidual(Object.assign({}, coherent, { G: 0.99 })).martingale === false,
  'a single-signal belief outside its interval fails the martingale condition');

// ---- The example from the proposal ---------------------------------
const pA = { G: 3 / 10, B: 7 / 10, g: 8 / 25, b: 4 / 5, Gg: 1 / 5, Gb: 3 / 5, Bg: 1 / 2, Bb: 9 / 10 };
const pB = { G: 7 / 10, B: 2 / 5, g: 1 / 4, b: 13 / 20, Gg: 2 / 5, Gb: 4 / 5, Bg: 1 / 10, Bb: 1 / 2 };
A(Math.abs(X.loopResidual(pA).residual) < 1e-9 && X.loopResidual(pA).martingale, 'worked example A is Bayes-consistent');
A(Math.abs(X.loopResidual(pB).residual) < 1e-9 && X.loopResidual(pB).martingale, 'worked example B is Bayes-consistent');

console.log(failures ? `\n${failures} FAILURES` : '\nDESIGN LOGIC PASSES');
process.exit(failures ? 1 : 0);
