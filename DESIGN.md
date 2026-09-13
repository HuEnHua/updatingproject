# Design notes — Build 1

## What the session has to produce

Eight distributions: four single-signal (`G`, `B`, `g`, `b`) and four cell
(`Gg`, `Gb`, `Bg`, `Bb`). One subject-photograph pair produces one report in a
single-signal marginal and one in a cell marginal, and no subject ever reveals a
whole profile — which is why the test is a population statement.

## Randomization

| What | How |
| --- | --- |
| Disclosure arm | Once per subject, uniform over the four |
| Neutral labels (unnamed arms) | Once per subject: which model is "Advisor 1" |
| Which photographs | Drawn per subject from the bank, stratified by cell |
| Order of arrival | Per photograph, balanced within each cell and across the session |
| Order of photographs | Shuffled after the plan is built |
| Payment | One photograph, then one of its two reports |

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

**The first report is not shown during the second.** Off by default, and
configurable. Re-displaying it turns the second report into an edit of the first.

## What the payment screen has to do

The binarized scoring rule is incentive compatible without assumptions on risk
preferences, but only if the subject believes the mechanism. Rather than assert
that, the payment screen hands them the slider and shows both conditional win
chances moving as they drag. The comprehension check then tests the two cases that
matter: that a confident wrong answer wins nothing, and that a belief of 70 is best
reported as 70 rather than rounded out to 100 or pulled in to 50.

## Copy

Written to state what is withheld rather than to leave it unsaid. In the unnamed
arms the screen says we are not telling you which two systems; in the accuracy arms
it says what the accuracy figure does and does not cover. Withholding that a subject
can see is withholding; withholding they cannot see reads as deception once the
debrief arrives.
