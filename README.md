# Belief-consistency study — front end

**Build 4 · Schema 2 · Priors and visible report history**

This release is delivered as `agedb-experiment-v4-priors.zip`, with a visible
version label in the researcher preview and versioned script/style URLs to
refresh cached assets. Extract it into a new folder and use the included
`index.html`; replace the full deployed package when updating a hosted copy.

For an immediate view of the new task, open the separately provided
`agedb-prior-preview-v4.html`. It is a self-contained preview with embedded
AgeDB photographs. It starts directly at the unaided question, then reveals
one advisor and both advisors as you submit reports. It does not send responses
to a backend.

Each photograph now yields three reports: an initial estimate before any AI
advice (`prior`), an estimate after one advisor (`report1`), and an estimate after
both advisors (`report2`). The initial estimate is shown during the first update;
both earlier reports are shown during the final update. Each report is equally
eligible for payment. The binarized scoring rule is unchanged internally, while
its numeric win probabilities are no longer displayed. A short instruction and
an expandable explanation explain why subjects should report their true beliefs.

This package includes **104 original AgeDB JPEG photographs**: 100 main-bank
images and four practice-bank images, with a different dataset identity in every
slot. Each session still draws 20 main photographs and two practice photographs.
Every image was matched to the exact recorded age in the supplied pilot manifest.

**The photographs are real; the advisor answers remain illustrative.** No Claude
or ChatGPT responses were collected for these photographs. The existing sample
answers and their 72% / 68% rates are retained for interface testing and are
explicitly labelled throughout the preview. `CONFIG.pilotMode` is `true`, and
saved payloads identify pilot data. Do not treat this package as a completed
model pre-screening exercise.

The participant-facing site for the two-advisor belief-elicitation experiment: consent
through to debrief, the four disclosure arms, a stratified session plan, the binarized
scoring rule, the payment draw, and executable tests.

Same architecture as the portfolio experiment: a static single page of hidden
`.screen` sections driven by one script, a small token stylesheet, and a Netlify
function that proxies saves to whatever backend you point it at.

## What a subject does

1. Consent, seat code, overview.
2. **The advisor screen.** The one screen the treatment arm changes — see below.
3. How the payment works: report the probability you actually believe, with an
   optional expandable explanation.
4. Two practice photographs, then a six-question comprehension check with three
   attempts.
5. Twenty photographs. Each one is answered three times: without advice, after one
   advisor, and after both. A rest screen falls at the halfway mark.
6. The payment draw, then a debrief listing every photograph, both advisor answers, all three of
   the subject's reports, and the true age.

Each photograph yields a prior, one single-signal report, and one cell report.
The latter two still fill the eight advice-conditioned marginals. Across the 20
main photographs a subject gives 60 reports, plus six unpaid practice reports.

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
| `pilotMode` | true | Shows the preview notice and marks saved data as pilot data |
| `usePlaceholderFaces` | false | Missing photos block answers and can be retried |
| `showUpFeeHKD` | 60 | Paid regardless |
| `prizeHKD` | 200 | One drawn judgement decides it |
| `cellQuota` | 5 per cell | 20 photographs per session |
| `practiceTrials` | 2 | Unpaid, excluded from the data |
| `breakAfter` | 10 | Rest screen, set 0 to remove |
| `quizAttempts` | 3 | Then the return screen |
| `requireSliderMove` | true | The slider must be touched, so 50 is a choice not a default |
| `advisors.*.marginalAccuracy` | .72 / .68 | Must match the bank; checked at load |
| `saveEndpoint` | `/.netlify/functions/save` | Empty switches saving off and offers a JSON download |

**Report history is always shown once advice starts.** At stage 1, the subject sees
their initial estimate; at stage 2, they see both earlier estimates. The history
uses the assigned advisor label, preserving anonymity in the unnamed arms. It is
cleared for the next photograph. The current slider still starts with a blank
readout and must be touched before a report can be submitted.

**Payment probabilities are not displayed.** The old `showPayoffPreview` and
`showFirstReportInStage2` settings have been removed. An expandable explanation is
available on the payment-instruction and trial screens. Marginal advisor accuracy
disclosures remain part of their assigned treatment arms.

## The photograph bank

`photos.json` holds one entry per photograph:

```json
{ "id": "p007", "file": "photos/p007.jpg", "age": 27, "older": true,
  "claude": "G", "gpt": "b", "practice": false }
```

`claude` is `G`/`B` and `gpt` is `g`/`b`, following the notation in the proposal;
together they give the cell. `older` and `age` are used only to settle the prize and
to write the debrief — no trial screen reads them, and a static test enforces that.

The shipped photographs and ages are actual AgeDB data. `claude` and `gpt` are
still sample answers from the supplied manifest. Replace those fields with real
pre-screening output before collecting participant data.

Images are bundled in `photos/` and have neutral filenames (`p001.jpg`, etc.).
Their original JPEG bytes are preserved: no generated faces, re-encoding,
retouching, or additional crops. The interface uses `object-fit: contain` to show
the full image. AgeDB contains public figures and historical photographs; this
selection has not been screened for recognizability or model difficulty.

The loader now retains `age`, verifies that `older` agrees with `age > 21`, and
rejects missing ages, duplicate IDs, and invalid advisor codes. Reports remain
disabled until an image loads. If loading fails, a retry button appears; no
substitute image is used. Response timing begins after image loading completes.
Enabling `usePlaceholderFaces` is an explicit interface-demo option only.

### Source and provenance

Source: [AgeDB's official iBUG resource page](https://ibug.doc.ic.ac.uk/resources/agedb/)
and the original ZIP linked there. All 16,488 image entries in the current archive
were unencrypted; no password was needed for the selected files.

`provenance/agedb-selection.json` records each experiment ID, original archive
filename, dataset identity and age, dimensions, SHA-256 checksum, and archive CRC.
It also records the source link and deterministic selection method. Ages come
from the dataset filename labels, not estimates from appearance. Selection
preserved the original age profile, the four agreement-cell counts, and the
practice/main split. The person shown does not repeat anywhere in the bank.

Please cite: Stylianos Moschoglou, Athanasios Papaioannou, Christos Sagonas,
Jiankang Deng, Irene Kotsia, and Stefanos Zafeiriou (2017), *AgeDB: the first
manually collected, in-the-wild age database*, CVPR Workshops.
[Author-hosted paper](https://ibug.doc.ic.ac.uk/media/uploads/documents/agedb.pdf).

AgeDB is provided for non-commercial research. The official terms restrict
copying and redistribution of annotations and allow internal copies within one
organization. Keep this research package internal and consult the linked terms
before publishing any images or annotations.

### Replacing the illustrative advice

1. Obtain both models' responses to the selected images using the same age
   question; retain the actual outputs, model versions, prompts, and dates.
   Do not send age labels or original filenames with the images.
2. Replace the manifest's `claude` / `gpt` fields with those responses. Rebuild
   the bank if needed to supply enough photographs in all four cells, while
   keeping practice and main identities separate.
3. Recalculate and configure the disclosed accuracies. Keep the main-bank cell
   proportions aligned with `CONFIG.cellQuota`, since sampling is stratified.
4. Set `advisorAnswersSource` in `photos.json` to `"model-prescreened"` only once
   that work is complete, then set `CONFIG.pilotMode` to `false`. The app rejects
   sample or unspecified advice in participant mode.

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

`npm test` checks JavaScript syntax and runs four suites. `test-logic.mjs` exercises the fenced pure logic,
including a check that truth-telling maximises the chance of winning at five
different beliefs and that both worked examples from the proposal satisfy loop
consistency. `test-static.mjs` checks the wiring between the three runtime files and
that no unnamed-arm branch leaks a maker's name. `test-photos.mjs` verifies every
bundled JPEG against its provenance checksum and checks ages and distinct
identities. `test-save.mjs` verifies schema handling and that the proxy preserves
priors and stage-0 payments. `test-session.mjs` walks a complete
session in jsdom for all four arms; it needs `npm install --no-save jsdom` and is not
in the default `npm test` for that reason — run it with `node test-session.mjs`.
That test simulates image events because jsdom does not decode JPEGs; it also
checks loading, failure, retry, priors before advice, 0% and 100% report history,
all three exported reports and timings, and numeric ages in the debrief.

For a quick local preview, run `python3 -m http.server 8000` in this directory
and open `http://localhost:8000/index.html`. Opening the HTML directly as a file
does not support loading the JSON manifest. The default save endpoint needs
Netlify; set `CONFIG.saveEndpoint` to `""` for a local preview that finishes with
a downloadable session JSON.

## Deploying

Upload the repository to the site root. Point `GOOGLE_SHEET_WEBHOOK` at your Apps
Script or other backend; with it unset the save function runs in sink mode, confirming
payloads without storing them, which is what you want while piloting.

This build sends **schema 2** because it adds priors and includes stage 0 in the
payment draw. Deploy the included updated save function with the frontend. Update
any custom backend to retain `prior`, its timing fields, and stages 0/1/2.

The backend must reply `{"status":"success","schema":2}` or the page will refuse to
continue past the final save — a deliberate check, so a session cannot appear to
complete while its data goes nowhere.

## What is not here

The analysis side. `loopResidual()` in the pure-logic section computes the loop
residual for a single profile and is exercised by the tests, but the eight-marginal
transport program, the ε-band, and `D` are analysis-time work on the collected data,
not the front end's job.
