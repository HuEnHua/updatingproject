# Design notes — Build 3

## What the session has to produce

Eight distributions: four single-signal (`G`, `B`, `g`, `b`) and four cell
(`Gg`, `Gb`, `Bg`, `Bb`). One subject-photograph pair produces one report in a
single-signal marginal and one in a cell marginal, and no subject ever reveals a
whole profile — which is why the test is a population statement. Each photograph
also elicits a prior before either advisor's answer appears.

The sequence is: photograph alone → prior → one advisor → `report1` → both
advisors → `report2`. A prior is unaided for that photograph; subjects may already
have seen treatment disclosures and advice on earlier photographs.

## Randomization

| What | How |
| --- | --- |
| Disclosure arm | Once per subject, uniform over the four |
| Neutral labels (unnamed arms) | Once per subject: which model is "Advisor 1" |
| Which photographs | Drawn per subject from the bank, stratified by cell |
| Order of arrival | Per photograph, balanced within each cell and across the session |
| Order of photographs | Shuffled after the plan is built |
| Payment | One photograph uniformly, then one of its three reports uniformly |

Arm balance is enforced inside each cell rather than globally: with five
photographs per cell the odd one alternates across cells, so a session comes out
exactly ten and ten, and each cell comes out three-two or two-three. A cell whose
orders were lopsided would weaken exactly the comparison that identifies the order
effect.

## Why the interface refuses certain things

**The slider must be moved.** A slider resting at 50 records 50 whether that is a
belief or an untouched control. The readout stays blank until the subject moves it.

**No going back once the photographs begin.** A subject who has seen the second
answer cannot un-see it, so a "back" into the one-answer screen would produce a
single-signal report contaminated by the pair. The back button stays visible and
disabled rather than disappearing, so its absence is legible rather than confusing.

**No feedback between photographs.** Truths are revealed only in the debrief. A
subject who learned outcomes as they went would be updating their beliefs about the
advisors mid-session, and the eight marginals would no longer describe one
information structure.

**Earlier reports stay visible as advice arrives.** The first update shows the
prior; the final update shows the prior and the report after one advisor. These
are read-only and belong only to the current photograph. The slider must still
be touched for each new report. The initial screen renders no advisor verdicts.

## What the payment screen has to do

The binarized scoring rule remains `1 - (r - x)^2` for a fixed prize. All three
reports are equally eligible, so the prior has the same reporting incentive as
the two updates. Numeric win probabilities and the live scoring demonstration
are removed from participant screens, including the final payment screen.

The instructions emphasize that the best strategy is to report one's actual
probability. A collapsed details box explains how the rule balances the two
possible outcomes and gives a truthful-report example. It is also available
during each trial. The comprehension check covers reporting before advice,
random advisor order, equal payment eligibility, truthful reporting, delayed age
feedback, and the assigned accuracy disclosure.

## Copy

Written to state what is withheld rather than to leave it unsaid. In the unnamed
arms the screen says we are not telling you which two systems; in the accuracy arms
it says what the accuracy figure does and does not cover. Withholding that a subject
can see is withholding; withholding they cannot see reads as deception once the
debrief arrives.
