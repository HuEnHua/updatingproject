# Data dictionary — Schema 1

One JSON payload per subject. `stage` is `progress` for the autosaves written after
every milestone and `final` for the completed session; keying on `submissionKey`
lets a backend overwrite rather than accumulate rows.

## Identifiers and design

| Field | Meaning |
| --- | --- |
| `subjectId` | Seat code entered on the welcome screen |
| `sessionCode`, `stationCode` | From `?session=` and `?station=`, if used |
| `submissionKey` | Stable for the browser session; the natural row key |
| `schema`, `build` | Format and code version |
| `startedAt`, `finishedAt`, `submittedAt` | ISO timestamps |

## Treatment

| Field | Meaning |
| --- | --- |
| `treatment` | `named_plain`, `blind_plain`, `blind_accuracy`, `named_accuracy` |
| `treatmentIdentity` | `named` or `blind` |
| `treatmentAccuracy` | `shown` or `hidden` |
| `treatmentForced` | True when the arm came from `?arm=`, i.e. a pilot session |
| `blindMap` | Which model carried which neutral label, e.g. `{claude:"Advisor 2"}` |
| `disclosedAccuracy` | The two numbers actually shown, or `null` in the hidden arms |

## Session plan

`plan` holds one entry per photograph, fixed before the first trial:

| Field | Meaning |
| --- | --- |
| `index` | Position in the session, 1–20 |
| `photoId` | Key into the photograph bank |
| `cell` | `Gg`, `Gb`, `Bg`, `Bb` — capital-first, so it does not depend on order |
| `arm` | `ST` (Claude first) or `TS` (GPT first) |
| `firstAdvisor`, `secondAdvisor` | `claude` / `gpt` |
| `coord1` | Which single-signal marginal the first report belongs to: `G`, `B`, `g`, `b` |
| `coord2` | Which cell marginal the second report belongs to; always equals `cell` |

`coord1` and `coord2` are the mapping from a report to its coordinate in the eight
distributions, precomputed so the analysis does not have to reconstruct it.

## Reports

`records` repeats every `plan` field and adds:

| Field | Meaning |
| --- | --- |
| `signal1`, `signal2` | The verdicts as shown, in arrival order |
| `report1`, `report2` | Percentages, 0–100 |
| `report1Ms`, `report2Ms` | Milliseconds on each elicitation screen |
| `report1Moves`, `report2Moves` | Slider input events, so an untouched-then-nudged answer is distinguishable from a deliberated one |
| `answeredAt` | ISO timestamp of the second report |

`practiceRecords` has the same shape for the two unpaid photographs.

## Comprehension

| Field | Meaning |
| --- | --- |
| `comprehension.attempts` | 1–3 |
| `comprehension.log` | One entry per attempt: chosen indices and whether all were right |
| `comprehension.failed` | True for subjects sent to the return screen |

## Payment

| Field | Meaning |
| --- | --- |
| `payment.trialIndex`, `payment.photoId` | The photograph drawn |
| `payment.stage` | 1 or 2 — which of the two reports paid |
| `payment.report` | The number that decided it |
| `payment.older` | The truth for that photograph |
| `payment.winProbability` | `1 - (r - x)^2` |
| `payment.won`, `payment.prizeHKD` | Outcome |
| `payment.uniforms` | The three draws, so the settlement can be replayed |
| `showUpFeeHKD`, `prizeHKD` | Terms in force for that session |

## Timing

`pageTimes` accumulates milliseconds by screen name, with trial screens keyed
`trial_<index>_stage<1|2>`, so time on instructions is separable from time on task.
