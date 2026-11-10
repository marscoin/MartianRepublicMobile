# Onboarding artwork

The onboarding wizard shows one image per step. Until final art exists, `screen/onboarding/art.js` points every step at a stand-in from `img/`. To replace one, put the file here and change its line in `art.js`.

## Format

- PNG or JPEG, portrait 4:5, 1600 x 2000 px, under 600 KB each.
- The image is cropped to the top third of the screen and fades to black (`#080A0C`) at the bottom. Keep the subject in the upper two thirds and let the lower third go dark.
- The back button and progress bar sit over the top 15%. Keep that area calm: sky, ceiling, shadow.
- No text, logos, flags or readable screens in the image. The app supplies all words.

## Look

Grounded near-future realism: what a working settlement on Mars would look like if photographed, not illustrated. Used equipment, dust on everything, practical lighting, people who look like they have a job to do. One warm colour (Mars orange, sodium light) against cold dark neutrals. Avoid cartoon astronauts, neon, glowing holograms, chrome, lens flares and symmetrical "epic" compositions.

A shared style line to append to every prompt:

> photorealistic, shot on a 35 mm cinema camera, natural practical lighting, fine dust in the air, muted colour with one warm orange accent, deep shadows falling to black at the bottom of the frame, hard science fiction, lived-in and functional, no text, no logos

## The seven images

| Key in `art.js` | Step | Prompt |
| --- | --- | --- |
| `horizon` | "You made it to Mars." | View through the scratched window of a descending lander: the curve of Mars at dawn, a thin blue line of atmosphere, a small cluster of settlement lights on the plain far below. |
| `vault` | "What you carry is yours." | A personal locker in a habitat corridor, door open, a worn pressure-suit glove and a small metal case on the shelf, one overhead work light, the corridor behind out of focus. |
| `key` | "Twelve words. Guard them." | Close view of a hand in a thin work glove writing in a paper notebook with a pencil on a metal workbench, a stamped steel tag beside it, warm task lamp, everything else dark. |
| `words` | "Write these down." | The same workbench from above: open notebook with blank ruled lines, pencil, a mug, red dust on the bench edge, a small porthole throwing a patch of orange light across the page. |
| `check` | "Which is your 5th word?" | A settlement clerk's counter seen from the applicant's side: a scuffed glass partition, a desk lamp, an out-of-focus figure in a utility jacket looking down at paperwork. |
| `ready` | "Your papers are in order." | An inner airlock door standing open onto a wide, busy habitat concourse, people in work clothes crossing in the distance, warm light spilling toward the camera from inside. |
| `next` | "Three things, in your own time." | A greenhouse dome at the edge of the settlement at dusk, rows of crops under grow lights, two people talking beside a rover, Mars hills and a pale sun low on the horizon. |

Generate each at 4:5, pick the take with the calmest top edge and the darkest bottom, and check it on a phone before committing: the headline must stay readable where the image fades out.
