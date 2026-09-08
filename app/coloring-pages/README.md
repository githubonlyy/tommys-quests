# דפי צביעה של המשפחה — family coloring pages

Every image in this folder becomes a page he can color, listed under
**המשפחה שלי 💕** in the drawing screen next to the built-in pages. No manifest,
no code change: drop the file in, commit, push.

```text
app/coloring-pages/
  סבתא.png              →  tile "סבתא"
  הכלב-שלנו.jpg         →  tile "הכלב שלנו"
  רובוט.svg             →  tile "רובוט"
  2026/טירה.png         →  tile "טירה"        (subfolders work)
```

Subfolders are scanned, and extension case is irrelevant — `scan.JPG` is a page
like any other.

## File types

| | |
| --- | --- |
| **Photo / scan of a printed page** | `.png` `.jpg` `.jpeg` `.jfif` `.pjpeg` `.pjp` `.webp` `.gif` `.bmp` `.apng` `.avif` `.ico` — goes through the ink pipeline below. |
| **Already-keyed art** | `.svg`, or any raster file that already has a transparent background — passed through untouched: no crop, no flat-field, no keying. |

If you have the choice, export already-keyed art. It is the cleanest input and
costs nothing at load time.

Anything else is **not silently dropped**. Every file in this folder that did not
become a page is named in a `console.warn` at startup, with the reason:

```text
[coloring-pages] "IMG_4127.HEIC" is not a coloring page: HEIC is the iPhone
camera default and no browser can decode it — export it as JPEG …
```

HEIC, HEIF, TIFF, PSD, PDF, AI, EPS and camera RAW each get their own named fix.
`.md`, `.txt`, `.json`, `.yml`, `.ini` and dotfiles are folder paperwork — never
a page, never a warning, and never bundled into the site (this README included).

**HEIC still has to be converted.** It is the iPhone camera default and no
browser decodes it. Export it as JPEG (Photos → export), or set the camera to
*תואם ביותר* / Most Compatible so it shoots JPEG in the first place. Do **not**
just rename it to `.jpg` — that one gets a tile, the decode then fails on the
tablet, and the app buzzes, says **"הדף הזה לא נטען"** and drops him back to the
blank sheet.

## Naming

The **filename is the page name**, shown under the tile and read aloud when he
picks it, so name it in Hebrew.

- `_` and `-` become spaces: `הכלב-שלנו.jpg` → "הכלב שלנו". Real spaces are
  left alone.
- The extension is part of the page id, so `סבתא.png` and `סבתא.jpg` are two
  separate pages and both are selectable. Same name in two different subfolders:
  also two pages.
- When two files would show the *same* text on their tiles, the tile falls back
  to the full filename (`סבתא.png` vs `סבתא.jpg`), and to a counter if even that
  matches. He still hears the plain name read aloud.
- Pages are sorted by name with a Hebrew collator, so numbering the stems is the
  only way to force an order.
- Page ids are a function of the file alone, never of the order the folder came
  back in, so adding a picture never renames the ones already there. That
  matters: the app remembers the page he had open by id, and an id that moved
  would reopen a different picture.

## Photographing a printed page

The pipeline is `../src/world/draw/pageInk.js`: crop the table away, divide out
the lighting so cream paper flattens to white, then key paper to transparent and
ink to black. The result floats above his canvas — he paints underneath and the
lines stay crisp.

Shoot for it:

- **Fill the frame with the paper.** The crop always keeps at least the middle
  ~30% of each axis (`TRIM_MAX` = 0.35 a side), so a table margin wider than
  about a third of the frame leaves a strip inside the crop. Table *beside* the
  page is wiped row by row, but a band left entirely **above or below** the page
  keys solid black across the top or bottom of his sheet.
- **Don't shoot it from across the room.** Under 8% of the frame being paper
  (`TRIM_MIN_PAPER`) there is nothing to crop to, so the picture is kept whole.
  The table is keyed away rather than turning black — but the drawing then sits
  small in the middle of a big transparent sheet, and it stays that size on the
  tablet.
- **A light table is fine now, up to a point.** The crop tells page from table by
  brightness, and a table brighter than about 70% of the paper cannot be told
  from it at all (`TRIM_PAPER_FRAC` = 0.72). Below that it is cropped away, grain
  and all — a grey or light wooden table no longer defeats the crop the way it
  used to. A near-white table under the page is the one to avoid: nothing is
  cropped, and the sheet arrives with the whole tabletop still around it.
- **Even light, no hard shadow.** The flat-field handles a smooth gradient
  easily (255 → 200 across the sheet: nothing lost). The *crop* is the fussy
  part — it runs on the raw photo, before flat-fielding, and anything under 72%
  of the brightest paper is not paper to it. A shadow that drops one side to
  ~150 gets that side cut off the page. Keep the whole sheet within roughly 70%
  of its brightest corner.
- **Square-on.** Perspective is never corrected; a keystoned page stays
  keystoned, and the table triangles in the corners are cleaned up per row.
- **Full-bleed art** (ink running off the edge of the paper) is recognised —
  when the paper reaches the edge of the photo, the crop drops to a 15%-a-side
  cap so it eats table instead of artwork, and it always leaves at least a
  quarter of whatever strip is there (`TRIM_BLEED_KEEP`), so a thin border or a
  title bar is thinned rather than deleted. Expect up to 15% of a thick one to
  go anyway.

What now works that used to not, so stop avoiding it:

- **Pencil.** The cuts adapt to the page's own histogram. Graphite at gray 200
  on white paper, or 190 on cream, keys fully solid.
- **Large filled areas.** A 300px grey block on a 1000px page comes out solid
  black throughout — no white hole, no ring.
- **Cream, yellowed or slightly grey paper.** Flattens to transparent.

What still comes out badly:

- **Very pale marks.** ~7% below the paper level (say gray 235 on 252) keys at
  about a third alpha: visible, but faint — and a page like that is faint again
  after he taps דף שקוף.
- **A hard shadow edge across the sheet.** Keys as a faint grey line where the
  shadow starts, even when both sides of it flatten correctly.
- **Photographs of people, pets, landscapes.** This is a line-art keyer, not a
  cartoonizer: a soft tonal blob comes out as a black ring with a hole in it.
  Colour is discarded outright — blue lines key to black like everything else.

Thresholds worth tuning if a whole batch keys badly: `PAPER_CUT`, `INK_CUT`,
`TRIM_MAX`, `TRIM_MIN_PAPER`, `BLUR_DIVISOR` in `pageInk.js`. They are exported
and unit tested.

## Size

**~2000px on the long side is plenty.** Every page is downscaled to 1400px
(700px for a picker thumbnail) *before* any processing, so resolution above that
is thrown away.

Oversized files cost twice: they are bundled into the site and downloaded by the
tablet, and opening the page picker keys *every* family page. That work is queued
one page at a time off the render path, so it does not freeze the tablet — it
just makes him wait. Six full pages and 48 thumbnails stay cached after that.

## The button on the page — דף שקוף / קווים כהים

A family page puts one extra button in the top bar (built-in pages don't have
it). It is labelled by what the **tap will do**, not by what he is looking at:

- **דף שקוף** (ghost icon) — tap it and the lines fade to 22%, for tracing: he
  draws over the faint guide and ends up with his own lines.
- **קווים כהים** (pencil icon, highlighted) — showing while the page is faded.
  Tap to bring the dark lines back.

That is the whole explanation he needs: *"רואה את הכפתור? לחיצה אחת והקווים
נהיים חיוורים כדי שתוכל לצייר עליהם, לחיצה שנייה והם חוזרים."*

The faded state never sticks. Every time a page becomes the current one — picked
from the shelf, or restored when the board reopens — it starts with dark lines,
so one stray tap can't leave a page nearly invisible tomorrow.

The choice is remembered per page in localStorage (`tommys-quests-page-modes`),
and so is the page he last had open (`tommys-quests-draw-page`), so closing and
reopening the board does not drop him back to a blank sheet.

## When it doesn't work

| What you see | What it means |
| --- | --- |
| No tile for a file you added | It was skipped — the browser console names it and says why at startup. |
| Buzz, **"הדף הזה לא נטען"**, back to the blank sheet | The browser could not decode the file at all: HEIC renamed to `.jpg`, a truncated download. |
| Page is always washed out, even after tapping קווים כהים | Keying failed and the app is showing the untouched photo faintly so he still has something to trace. Reshoot it. |
| Black band along the top or bottom | Too much table in the frame — see the crop cap above. |
| The drawing sits tiny in the middle of the sheet | The paper was under 8% of the photo, or the table was nearly as bright as it, so nothing was cropped. |

## Publishing it

```powershell
git add app/coloring-pages/
git commit -m "Add coloring page: סבתא"
git push
```

Pushing to `master` runs `.github/workflows/ci.yml` (lint, test, build) and
deploys to GitHub Pages. Give it a couple of minutes, then hard-refresh the app
on the tablet. The live site is
**<https://githubonlyy.github.io/tommys-quests/>**, built from
`github.com/githubonlyy/tommys-quests`. Nothing reaches him until you push.

## Privacy — read this before you name a file

**That repo is public and the site sits at a guessable GitHub Pages URL.**
Everything here is published twice: the image is browsable in the repo, and it
is bundled into the deployed site. The **filename travels with it** — into the
repo listing, into the commit message, into the built site's asset list, and
onto the tile in the app.

So name the *picture*, not the people, the place or the date: `סבתא.png`,
`טירה.png`, `רובוט.svg`. That is what he sees under the tile anyway, and a
neutral name reads just as well. Commit line art and drawings — not photographs
of the kids.
