# Data dictionary — Schema 2

Build 3 adds a photo-specific prior before advice. Stage 0 is the prior, stage 1
is the report after one advisor, and stage 2 is the report after both advisors.
The existing `report1` and `report2` fields retain their previous meanings.

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
| `pilot` | True for the researcher preview; advisor answers are illustrative |
| `photoBankMetadata.dataset` | Dataset identifier (`AgeDB` in this package) |
| `photoBankMetadata.advisorAnswersSource` | `illustrative` in this package; `model-prescreened` only after collecting real responses |
| `photoBankMetadata.provenanceFile` | Researcher mapping from experiment IDs to original dataset files and checksums |
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
| `coord0` | `prior`: the photograph-only report before either advisor's answer |
| `coord1` | Which single-signal marginal the first report belongs to: `G`, `B`, `g`, `b` |
| `coord2` | Which cell marginal the second report belongs to; always equals `cell` |

`coord1` and `coord2` map the advice-conditioned reports to the original eight
distributions. `coord0` identifies the additional unaided prior. Prior here means
before advice about the current photograph, not before all earlier photographs
or the session's treatment disclosures.

## Reports

`records` repeats every `plan` field and adds:

| Field | Meaning |
| --- | --- |
| `signal1`, `signal2` | The verdicts as shown, in arrival order |
| `prior` | Probability, 0–100, submitted before either advisor's answer |
| `report1`, `report2` | Probabilities, 0–100, after one advisor and after both advisors |
| `priorMs`, `report1Ms`, `report2Ms` | Milliseconds on each elicitation screen, starting after the photograph loads |
| `priorMoves`, `report1Moves`, `report2Moves` | Slider input-event counts for each report |
| `priorAnsweredAt`, `report1AnsweredAt`, `report2AnsweredAt` | ISO timestamps for the three submissions |
| `answeredAt` | ISO timestamp of the final report; equal to `report2AnsweredAt` |

`practiceRecords` has the same shape for the two unpaid photographs.
Each completed main photograph contributes one record with three reports (60
reports in 20 records per completed subject). The history displayed at stage 1 is
`prior`; at stage 2 it is `prior` and `report1`. Showing history does not modify
those saved values.

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
| `payment.stage` | 0 = prior, 1 = after one advisor, 2 = after both advisors; equally likely |
| `payment.report` | The number that decided it |
| `payment.older` | The truth for that photograph |
| `payment.winProbability` | `1 - (r - x)^2`; retained for audit, not displayed to participants |
| `payment.won`, `payment.prizeHKD` | Outcome |
| `payment.uniforms` | The three draws, so the settlement can be replayed |
| `showUpFeeHKD`, `prizeHKD` | Terms in force for that session |

## Timing

`pageTimes` accumulates milliseconds by screen name, with trial screens keyed
`trial_<index>_stage<0|1|2>`, so time on instructions is separable from time on task.
