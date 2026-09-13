# Belief-consistency study — front end

**Build 1 · Schema 1**

The participant-facing site for the two-advisor belief-elicitation experiment: consent
through to debrief, the four disclosure arms, a stratified session plan, the binarized
scoring rule, the payment draw, and executable tests.

Same architecture as the portfolio experiment: a static single page of hidden
`.screen` sections driven by one script, a small token stylesheet, and a Netlify
function that proxies saves to whatever backend you point it at.

## What a subject does

1. Consent, seat code, overview.
2. **The advisor screen.** The one screen the treatment arm changes — see below.
3. How the payment works, with a live slider showing what each report would do to
   the chance of winning.
4. Two practice photographs, then a six-question comprehension check with three
   attempts.
5. Twenty photographs. Each one is answered twice: once after one system's answer,
   once after both. A rest screen falls at the halfway mark.
6. The payment draw, then a debrief listing every photograph, both answers, both of
   the subject's reports, and the true age.

Each photograph therefore yields one single-signal report and one cell report, which
is what fills the eight marginals the test needs.

## The four disclosure arms

The arm is drawn once per subject and is the full crossing of two binary disclosures:

| Arm key | Advisors are | Marginal accuracy |
| --- | --- | --- |
| `named_plain` | named as Claude (Anthropic) and ChatGPT (OpenAI) | not disclosed |
| `blind_plain` | "Advisor 1" and "Advisor 2" | not disclosed |
| `blind_accuracy` | "Advisor 1" and "Advisor 2" | disclosed |
| `named_accuracy` | named as Claude and ChatGPT | disclosed |

Force one for piloting with `index.html?arm=blind_accuracy`.

Three things the arms hold fixed on purpose:

- **Only the marginals are ever disclosed.** The accuracy arms say so in as many
  words: the subject is told how often each system is right and told plainly that
  they are not being told how often the two agree or whether they err on the same
  faces. Leaving the correlation unknown is what keeps the test's free parameter
  free, so the copy protects it rather than leaving it to inference.
- **Labels are stable but scrambled.** In the unnamed arms "Advisor 1" is the same
  system all session, but which system it is, is randomized per subject and recorded
  in `blindMap`. Without that, "Advisor 1" would silently mean Claude for everyone.
- **The debrief undoes both withholdings.** Unnamed arms are told who the two systems
  were and which label was which; arms that were not told the accuracies are told
  them. Nothing is misstated at any point — information is withheld and then
  released, which is what "no deception" requires.

## The 75% ceiling — read this before setting the accuracy numbers

Pre-screening stratifies the four agreement cells to be equally frequent. In a
discordant cell (`Gb`, `Bg`) exactly one advisor is right, so those photographs
contribute exactly 50% to the *average* of the two accuracies regardless of which
faces fill them. With equal quotas that caps the average at **75%**:

```
max average accuracy = (n_Gg + n_Bb + (n_Gb + n_Bg)/2) / N
```

So a pair like 78% / 74% is not merely optimistic, it is unattainable on the set the
subject actually faces, and stating it would be a false statement to subjects in two
of the four arms. The interface computes the ceiling from `CONFIG.cellQuota` and warns
on the first screen if the configured pair breaches it. It also recomputes both
accuracies directly from `photos.json` when the bank loads and warns if either differs
from the disclosed figure by more than two points.

Defaults ship at 72% and 68%, which the sample manifest reproduces exactly.

Two ways to go if the real models score higher than the ceiling on the raw bank:

- **Disclose accuracy on the stratified set** (what the interface does now). Honest
  about the photographs the subject faces, and necessarily nearer 50%.
- **Weaken the stratification.** Raising `cellQuota` for the concordant cells lifts
  the ceiling, at the cost of thinner discordant cells, which are the ones the loop
  test leans on. Keep the discordant cells well populated.

Either is defensible; the wording on the advisor screen matches the first. If you
switch, change the phrase "of the photographs in this study" with it.

## Configuration

Everything researcher-editable sits in `CONFIG` at the top of `script.js`.

| Key | Default | Notes |
| --- | --- | --- |
| `showUpFeeHKD` | 60 | Paid regardless |
| `prizeHKD` | 200 | One drawn judgement decides it |
| `cellQuota` | 5 per cell | 20 photographs per session |
| `practiceTrials` | 2 | Unpaid, excluded from the data |
| `breakAfter` | 10 | Rest screen, set 0 to remove |
| `quizAttempts` | 3 | Then the return screen |
| `requireSliderMove` | true | The slider must be touched, so 50 is a choice not a default |
| `showPayoffPreview` | true | Live win-chance readout under the slider |
| `showFirstReportInStage2` | **false** | See below |
| `advisors.*.marginalAccuracy` | .72 / .68 | Must match the bank; checked at load |
| `saveEndpoint` | `/.netlify/functions/save` | Empty switches saving off and offers a JSON download |

**`showFirstReportInStage2`** is off by design. The second report is meant to be the
subject's belief at the pair, not an edit of the first number, and re-displaying the
first invites anchoring on it. Turning it on is a real design change, not a
convenience — it belongs in a pilot comparison if you want it.

## The photograph bank

`photos.json` holds one entry per photograph:

```json
{ "id": "p007", "file": "photos/p007.jpg", "age": 27, "older": true,
  "claude": "G", "gpt": "b", "practice": false }
```

`claude` is `G`/`B` and `gpt` is `g`/`b`, following the notation in the proposal;
together they give the cell. `older` and `age` are used only to settle the prize and
to write the debrief — no trial screen reads them, and a static test enforces that.

The shipped manifest is sample data for piloting the interface. Replace it with the
pre-screening output. Images go in `photos/`; when a file is missing the page draws a
stand-in portrait and logs the missing path, so a session is never stranded by one
bad file.

**One caveat worth a decision.** `older` ships to the browser, because payment is
settled in the room at the end of the session. A determined subject could read it out
of the network tab. In a supervised lab that is a small risk, but if you would rather
close it: strip `older` and `age` from the manifest, and have the save endpoint return
the `payment` object — the client already prefers the backend's draw over its own
whenever the reply carries one.

## Running it

```bash
npx netlify dev          # or any static server; the save function needs Netlify
npm test
```

`npm test` runs three suites. `test-logic.mjs` exercises the fenced pure logic,
including a check that truth-telling maximises the chance of winning at five
different beliefs and that both worked examples from the proposal satisfy loop
consistency. `test-static.mjs` checks the wiring between the three runtime files and
that no unnamed-arm branch leaks a maker's name. `test-session.mjs` walks a complete
session in jsdom for all four arms; it needs `npm install --no-save jsdom` and is not
in the default `npm test` for that reason — run it with `node test-session.mjs`.

## Deploying

Upload the repository to the site root. Point `GOOGLE_SHEET_WEBHOOK` at your Apps
Script or other backend; with it unset the save function runs in sink mode, confirming
payloads without storing them, which is what you want while piloting.

The backend must reply `{"status":"success","schema":1}` or the page will refuse to
continue past the final save — a deliberate check, so a session cannot appear to
complete while its data goes nowhere.

## What is not here

The analysis side. `loopResidual()` in the pure-logic section computes the loop
residual for a single profile and is exercised by the tests, but the eight-marginal
transport program, the ε-band, and `D` are analysis-time work on the collected data,
not the front end's job.
