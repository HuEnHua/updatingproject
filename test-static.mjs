import fs from 'node:fs';

const js = fs.readFileSync('script.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const manifest = JSON.parse(fs.readFileSync('photos.json', 'utf8'));

let failures = 0;
const A = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg); };

// Every element the script reaches for exists in the page.
const ids = new Set([...js.matchAll(/\$\("([a-z0-9-]+)"\)/g)].map(m => m[1]));
const rendered = new Set([...js.matchAll(/id=\\?"([a-z0-9-]+)\\?"/g)].map(m => m[1]));
const missing = [...ids].filter(id => !html.includes('id="' + id + '"') && !rendered.has(id));
A(missing.length === 0, 'every element the script reaches for is either in index.html or rendered by the script' +
  (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));

// The four arms and what each one may say.
A(/named_plain|blind_plain|blind_accuracy|named_accuracy/.test(js), 'the four arms are present');
A(js.includes('?arm=') || js.includes('getParam("arm")'), 'an arm can be forced for piloting');
A(/not.{0,40}telling you how often the two/i.test(js),
  'the accuracy arms state that the joint behaviour is withheld');
A(js.includes('blindMap'), 'the unnamed arms randomise which system carries which label');

// Things that must never leak in the unnamed arms before the debrief.
const advisorBlock = js.slice(js.indexOf('function renderAdvisors'), js.indexOf('$("btn-advisors")'));
const blindBranch = advisorBlock.slice(advisorBlock.indexOf('} else {'));
A(!/Anthropic|OpenAI/.test(blindBranch), 'the unnamed branch of the advisor screen names no maker');

// The debrief must undo both kinds of withholding.
const debrief = js.slice(js.indexOf('function renderDebrief'));
A(/Anthropic/.test(debrief) && /OpenAI/.test(debrief), 'the debrief names both systems');
A(/accuracyPercent\("claude"\)/.test(debrief), 'the debrief discloses the accuracies it withheld');

// Elicitation.
A(js.includes('requireSliderMove'), 'the slider must be touched before continuing');
A(js.includes('1 - Math.pow(r - x, 2)'), 'the binarized scoring rule is implemented as stated');
A(html.includes('type="range"'), 'the belief is elicited on a slider');
A(html.includes('aria-label="How likely'), 'the slider is labelled for screen readers');
A(css.includes('prefers-reduced-motion'), 'reduced motion is respected');
A(css.includes(':focus-visible'), 'keyboard focus is visible');

// Order and stratification.
A(js.includes('armsForCells'), 'the two orders are balanced inside each cell');
A(js.includes('accuracyCeiling'), 'impossible disclosed accuracies are refused');
A(js.includes('checkDisclosedAccuracy'), 'the disclosed accuracy is checked against the bank');

// No feedback during the session.
const trialBlock = js.slice(js.indexOf('function renderTrial'), js.indexOf('function showBreak'));
A(!/\bolder\b.*photo\.older/.test(trialBlock) && !trialBlock.includes('photo.age'),
  'the trial screen never touches the true age');

// The sample manifest is usable and self-consistent.
const photos = manifest.photos || manifest;
const study = photos.filter(p => !p.practice);
const cells = {};
study.forEach(p => { const c = p.claude + p.gpt; cells[c] = (cells[c] || 0) + 1; });
A(Object.keys(cells).length === 4, 'the manifest covers all four agreement cells');
A(Object.values(cells).every(v => v >= 5), 'every cell has enough photographs for a session');
A(photos.filter(p => p.practice).length >= 2, 'the manifest carries practice photographs');
const stated = { claude: 0.72, gpt: 0.68 };
['claude', 'gpt'].forEach(k => {
  const hit = study.filter(p => ((k === 'claude' ? p.claude === 'G' : p.gpt === 'g') === p.older)).length;
  const actual = hit / study.length;
  A(Math.abs(actual - stated[k]) < 0.02,
    'the sample manifest delivers the accuracy the config discloses for ' + k +
    ' (' + Math.round(actual * 100) + '%)');
});
A((stated.claude + stated.gpt) / 2 <= 0.75 + 1e-9,
  'the disclosed pair respects the 75% ceiling that equal stratification imposes');

console.log(failures ? `\n${failures} FAILURES` : '\nSTATIC CHECKS PASS');
process.exit(failures ? 1 : 0);
