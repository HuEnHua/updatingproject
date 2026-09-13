// A headless walk through an entire session, for each of the four arms.
// Requires jsdom: npm install --no-save jsdom
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const dir = fileURLToPath(new URL('.', import.meta.url));
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');
const manifest = fs.readFileSync(path.join(dir, 'photos.json'), 'utf8');

let failures = 0;
const A = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg); };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runArm(arm) {
  const dom = new JSDOM(html.replace('<script src="script.js"></script>', ''), {
    url: 'https://example.test/index.html?arm=' + arm,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const savedPayloads = [];
  window.scrollTo = () => {};
  window.fetch = async (url, options) => {
    if (String(url).includes('photos.json')) {
      return { ok: true, status: 200, json: async () => JSON.parse(manifest) };
    }
    if (options?.body) savedPayloads.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ status: 'success', schema: 1 }), text: async () => '{"status":"success","schema":1}' };
  };
  window.eval(js + '\nwindow.testBank = () => state.photoBank;');
  const $ = (id) => window.document.getElementById(id);
  const click = (id) => $(id).dispatchEvent(new window.Event('click', { bubbles: true }));
  const active = () => window.document.querySelector('.screen.active').id;

  click('btn-consent');
  A(active() === 'screen-welcome', arm + ': consent leads to the welcome screen');
  $('subject-input').value = 'A12';
  click('btn-welcome');
  await sleep(30);
  A(active() === 'screen-overview', arm + ': the photograph bank loads and the overview opens');
  A(window.testBank().every(p => Number.isInteger(p.age) && p.older === (p.age > 21)),
    arm + ': recorded ages survive loading and agree with the payment labels');

  click('btn-overview');
  A(active() === 'screen-advisors', arm + ': the advisor screen opens');
  const advisorText = $('advisors-body').textContent;
  const named = arm.startsWith('named');
  const withAccuracy = arm.endsWith('accuracy');
  A(advisorText.includes('Claude') === named, arm + ': names appear only in the named arms');
  A(advisorText.includes('Advisor 1') === !named, arm + ': neutral labels appear only in the unnamed arms');
  A(/correct on/i.test(advisorText) === withAccuracy, arm + ': accuracy appears only in the accuracy arms');
  if (withAccuracy) {
    A(/not.{0,20}telling you how often the two/i.test(advisorText),
      arm + ': the accuracy arms say plainly that the joint behaviour is withheld');
  }

  click('btn-advisors');
  A(active() === 'screen-scoring', arm + ': the payment rule screen opens');
  const demo = $('demo-slider');
  demo.value = '80';
  demo.dispatchEvent(new window.Event('input', { bubbles: true }));
  A($('demo-older').textContent === '96%' && $('demo-younger').textContent === '36%',
    arm + ': the payment demonstration computes the scoring rule');

  click('btn-scoring');
  click('btn-practice-intro');
  A(active() === 'screen-trial', arm + ': practice begins');

  // jsdom does not fetch/decode images: explicitly simulate browser events.
  // The separately verified real files are checked by test-photos.mjs.
  Object.defineProperty($('trial-photo'), 'naturalWidth', { configurable: true, value: 240 });
  const photoLoaded = () => $('trial-photo').dispatchEvent(new window.Event('load'));
  A($('trial-slider').disabled && $('btn-trial').disabled,
    arm + ': reports are blocked while the photograph is loading');
  A($('trial-advisors').hidden, arm + ': advisor answers wait for the photograph to load');
  click('btn-trial');
  A($('trial-advisors').textContent.includes('appears after'),
    arm + ': a premature click cannot reveal the second answer');
  $('trial-photo').dispatchEvent(new window.Event('error'));
  A($('trial-photo').hidden && $('trial-slider').disabled && !$('trial-error').hidden,
    arm + ': an image error blocks reporting and shows a visible message');
  A(!$('trial-photo').src.startsWith('data:'), arm + ': image failure does not substitute a drawing');
  A($('btn-trial').textContent === 'Retry photograph', arm + ': a failed image can be retried');
  click('btn-trial');
  photoLoaded();
  A(!$('trial-photo').hidden && !$('trial-slider').disabled && !$('btn-trial').disabled,
    arm + ': a successful retry restores the photograph and controls');
  A(!$('trial-advisors').hidden, arm + ': the photograph and advisor answers appear together');

  const answer = (value) => {
    photoLoaded();
    const s = $('trial-slider');
    s.value = String(value);
    s.dispatchEvent(new window.Event('input', { bubbles: true }));
    click('btn-trial');
  };

  // Refusing to answer without touching the slider.
  click('btn-trial');
  A(!$('trial-error').hidden, arm + ': an untouched slider is refused');

  // Two practice photographs, two reports each.
  for (let i = 0; i < 2; i++) {
    A($('trial-advisors').textContent.includes('appears after'), arm + ': only one answer is shown at first');
    answer(40 + i);
    A(!$('trial-advisors').textContent.includes('appears after'), arm + ': both answers are shown second');
    answer(60 + i);
  }
  A(active() === 'screen-quiz', arm + ': practice hands over to the comprehension check');
  A($('quiz-body').querySelectorAll('.quiz-q').length === 6, arm + ': six comprehension questions');

  // Answer wrongly once, then correctly.
  const pick = (qi, oi) => {
    const el = window.document.querySelector('input[name="quiz-' + qi + '"][value="' + oi + '"]');
    el.checked = true;
  };
  for (let qi = 0; qi < 6; qi++) pick(qi, 1);
  click('btn-quiz');
  A(active() === 'screen-quiz' && !$('quiz-error').hidden, arm + ': a wrong sheet is sent back');
  for (let qi = 0; qi < 6; qi++) pick(qi, 0);
  click('btn-quiz');
  A(active() === 'screen-trials-intro', arm + ': a correct sheet moves on');

  click('btn-trials-intro');
  A(active() === 'screen-trial', arm + ': the paid photographs begin');
  A($('btn-back').disabled, arm + ': there is no going back once they begin');

  let guard = 0;
  while (active() === 'screen-trial' || active() === 'screen-break') {
    if (guard++ > 200) break;
    if (active() === 'screen-break') { click('btn-break'); continue; }
    answer(20 + (guard % 60));
  }
  await sleep(40);
  A(active() === 'screen-payment', arm + ': the session ends at the payment draw');
  A(/HK\$/.test($('payment-body').textContent), arm + ': the draw states the money');

  click('btn-payment');
  A(active() === 'screen-debrief', arm + ': the debrief follows');
  const debrief = $('debrief-body').textContent;
  A(debrief.includes('Claude') && debrief.includes('ChatGPT'),
    arm + ': the debrief names both systems whatever the arm withheld');
  A(/correct on/i.test(debrief) || withAccuracy, arm + ': the debrief reports the accuracies it had withheld');
  A($('debrief-body').querySelectorAll('.debrief-table tbody tr').length === 20,
    arm + ': every photograph is listed back');
  A([...$('debrief-body').querySelectorAll('.debrief-table tbody tr')].every(row =>
    /\d+ \((?:older|younger)\)/.test(row.textContent)),
    arm + ': the debrief shows numeric recorded ages');
  A(savedPayloads.length > 0 && savedPayloads.every(p =>
    p.pilot === true && p.photoBankMetadata?.dataset === 'AgeDB' &&
    p.photoBankMetadata?.advisorAnswersSource === 'illustrative'),
    arm + ': saved data identifies real AgeDB photos and illustrative pilot advice');
  dom.window.close();
  console.log('');
}

async function checkRejectedBank(mutate, pattern, participant = false) {
  const changed = JSON.parse(manifest);
  mutate(changed);
  const dom = new JSDOM(html.replace('<script src="script.js"></script>', ''), {
    url: 'https://example.test/index.html', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.fetch = async () => ({ ok: true, status: 200, json: async () => changed });
  window.eval(participant ? js.replace('pilotMode: true,', 'pilotMode: false,') : js);
  const $ = id => window.document.getElementById(id);
  $('btn-consent').click();
  $('subject-input').value = 'TEST';
  $('btn-welcome').click();
  await sleep(30);
  A(window.document.querySelector('.screen.active').id === 'screen-welcome' &&
    !$('subject-error').hidden && pattern.test($('subject-error').textContent),
    'invalid bank is rejected: ' + pattern);
  dom.window.close();
}

for (const arm of ['named_plain', 'blind_plain', 'blind_accuracy', 'named_accuracy']) {
  await runArm(arm);
}
await checkRejectedBank(m => { m.photos[0].older = !m.photos[0].older; }, /age and older\/younger label disagree/);
await checkRejectedBank(m => { delete m.photos[0].age; }, /invalid recorded age/);
await checkRejectedBank(m => { m.photos[1].id = m.photos[0].id; }, /unique, non-empty ID/);
await checkRejectedBank(() => {}, /sample advisor answers/, true);

console.log(failures ? `${failures} FAILURES` : 'SESSION WALKTHROUGH PASSES');
process.exit(failures ? 1 : 0);
