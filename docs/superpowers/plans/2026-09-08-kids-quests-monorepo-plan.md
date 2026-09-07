# Implementation plan — merging the three kids' apps

Executes [the design](../specs/2026-09-07-kids-quests-monorepo-design.md).
Written 2026-09-08.

## How to use this

Six steps. Each one ends with all three apps working, shippable, and behaving
exactly as they do today — you can stop after any step. Each step is written to
be runnable in a fresh session with no memory of this conversation.

The constraint that governs everything: **the move changes nothing a child can
see.** Two exceptions are approved and named where they occur.

Paths in this plan are absolute because the work spans four repositories.

---

## Step 0 — Clean the slate

Nothing here is about the merge. It is the precondition that makes the merge
verifiable.

### 0.1 Land the outstanding coloring-page work

All three repos have uncommitted work from the coloring-page fixes. Commit and
push each, and confirm CI goes green and the site deploys:

- `c:/Users/liorg/AI/Personal/Tommy_Academia`
- `c:/Users/liorg/AI/Personal/Melanie_Academia`
- `c:/Users/liorg/AI/Personal/Micheal_Academia`

Melanie's and Michael's trees also contain uninstructed edits from an earlier
agent run — `.github/workflows/ci.yml`, `app/.oxlintrc.json`, and in Melanie's
case `app/src/match/speak.js` plus a new `voice.test.js`. Review those on their
own merits before committing. The CI action bumps are safe: `checkout@v7`,
`setup-node@v7`, `upload-pages-artifact@v5`, `deploy-pages@v5` all exist. The
`speak.js` rewrite was audited and correctly selects a female Hebrew voice for
מלאני.

### 0.2 Normalise line endings

Add `.gitattributes` to all three repos:

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.webp binary
*.ico binary
```

Then `git add --renormalize .` and commit. Until this lands, the three copies of
`pageInk.js` differ only in CRLF and `diff` reports every line as changed, which
hides real drift and makes every verification step in this plan unreliable.

**Verify:** `diff --strip-trailing-cr` and plain `diff` agree on
`app/src/world/draw/pageInk.js` across the three repos.

### 0.3 Fix the two known pageInk defects — optional, recommended here

Both are in all three apps and both are cheap to fix once, now, while the file
is still identical everywhere:

- a light or textured desk is mistaken for the paper, keying up to 31% of the
  sheet solid black — `paperLevel()` picks the modal grey, and a flat desk is one
  tall histogram bin while shaded paper spreads over ~40
- a full-bleed band thinner than 15% of the page height is cropped away entirely

Doing this before the move means fixing them three times. Doing it after means
one fix but a longer wait. Either is defensible; the design assumes after.

---

## Step 1 — Create the monorepo and move טומי in

### 1.1 By hand, before anything else

These need a human:

1. Create a **private** GitHub repo `githubonlyy/kids-quests`.
2. For each of the three target repos, generate a deploy key and install it:
   ```
   ssh-keygen -t ed25519 -C "kids-quests deploy -> tommys-quests" -f ./deploy_tommy -N ""
   ```
   Put the **public** half in `githubonlyy/tommys-quests` → Settings → Deploy
   keys, with **write access enabled**. Put the **private** half in
   `githubonlyy/kids-quests` → Settings → Secrets → Actions, as
   `DEPLOY_KEY_TOMMY`. Repeat for `DEPLOY_KEY_MELANIE` and `DEPLOY_KEY_MICHAEL`.
   Delete the local key files afterwards — they are secrets and must not reach
   any working tree.

Never commit a private key. Nothing in this plan should ever put one in a file
inside a repo.

### 1.2 Seed the repo from טומי's history

Push Tommy_Academia's full history to the new remote so nothing is lost:

```
git remote add mono git@github.com:githubonlyy/kids-quests.git
git push mono master
```

Then clone it fresh to `c:/Users/liorg/AI/Personal/kids-quests` and work there.
Leave Tommy_Academia on disk untouched until step 5 — it is the reference for
the behaviour diff.

### 1.3 Split טומי's source into engine and profile

Under `app/src/`, using `git mv` so history follows:

**Into `profiles/tommy/`:**

| from | to |
|---|---|
| `data/events.js` | `profiles/tommy/subjects.js` |
| `data/questions/` | `profiles/tommy/questions/` |
| `data/lessons.json` | `profiles/tommy/lessons.json` |
| `data/wardrobe.json` | `profiles/tommy/wardrobe.json` |
| `data/themes.js` | `profiles/tommy/themes.js` |
| `data/shop.json` | `profiles/tommy/shop.json` |
| `data/trophies.js` | `profiles/tommy/trophies.js` |
| `app/coloring-pages/` | `profiles/tommy/coloring-pages/` |
| `avatar/parts/outfit.jsx` | `profiles/tommy/avatar/outfit.jsx` |

**Into `engine/`:** everything else — `screens/`, `match/`, `arcade/`,
`components/`, `context/`, `i18n/`, `world/`, `avatar/` (minus the moved part),
`assets/`, `data/board.js`, `data/config.json`, `data/arcadeGames.js`,
`App.jsx`, `main.jsx`.

`data/config.json` splits: the pacing numbers (`dailyGoal`, `boardSize`,
`questionTimerSec`, `playTime`) move into `profile.json`; anything genuinely
engine-wide stays in `engine/data/config.json`.

`data/arcadeGames.js` stays in the engine as the full catalogue of 26. Which
games a child gets becomes the `arcade` array in their `profile.json`.

**Note on the avatar parts.** Only `outfit.jsx` is child-specific today
(מלאני has `dress.jsx` instead). `hair`, `head`, `hand`, `back`, `shoes`,
`body`, `pet` and `registry.js` are shared. If a sibling's copy of a "shared"
part turns out to differ when they move in, that is a finding to record, not a
reason to fork the file.

### 1.4 Write `profiles/tommy/profile.json`

Values must match what his app does today, exactly:

```json
{
  "id": "tommy",
  "name": "טומי",
  "gender": "m",
  "age": 8,
  "storagePrefix": "tommys-quests",
  "deployRepo": "githubonlyy/tommys-quests",
  "publicUrl": "https://githubonlyy.github.io/tommys-quests/",
  "dailyGoal": 4,
  "boardSize": 2,
  "questionTimerSec": 0,
  "playTime": { "minutesPerSession": 15, "matchesPerSession": 4, "maxSessionsPerDay": 3 },
  "arcade": ["soccer","goalie","basketball","tennis","bowling","runner","flappy",
             "jetpack","ninjaslice","skatepark","stack","space","race","boat",
             "coinrush","bricks","moles","snake","blocks","frog","slide","memory",
             "maze","hanoi","n2048","sudoku"],
  "legacy": { "funTab": true, "playClock": true, "lessonCards": true,
              "musicPicker": true, "boardRotation": true, "dance": false }
}
```

### 1.5 Wire the alias

`vite.config.js` resolves `@profile` from the build mode, defaulting to tommy:

```js
export default defineConfig(({ mode }) => {
  const kid = ['tommy', 'melanie', 'michael'].includes(mode) ? mode : 'tommy'
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@profile': path.resolve(__dirname, `src/profiles/${kid}`) } },
    test: { environment: 'node' },
  }
})
```

Vitest reads the same config, so `vitest run --mode melanie` runs the suite
against her profile. Tailwind v4 scans the module graph, so only the active
profile's class strings are bundled — which is what we want.

Engine code then does `import profile from '@profile/profile.json'` and
`import { EVENTS } from '@profile/subjects.js'`.

### 1.6 Replace the hardcoded storage keys

Ten keys, hardcoded across ten files. Add `engine/storage.js`:

```js
import profile from '@profile/profile.json'
export const storageKey = (name) => `${profile.storagePrefix}-${name}`
```

Then replace each literal. The full list, verified by grep:

| key | file |
|---|---|
| `tommys-quests-v1` | `context/PlayerContext.jsx` |
| `tommys-quests-theme` | `context/ThemeContext.jsx` |
| `tommys-quests-lang` | `context/LangContext.jsx` |
| `tommys-quests-music` | `match/music.js` |
| `tommys-quests-track` | `App.jsx` |
| `tommys-quests-muted` | `match/sounds.js` |
| `tommys-quests-speech` | `match/speak.js` |
| `tommys-quests-drawings` | `world/draw/gallery.js` |
| `tommys-quests-page-modes` | `world/draw/familyPages.js` |
| `tommys-quests-draw-page` | `world/Draw.jsx` |

**This is the step that protects his save.** After it, טומי's build must still
read and write exactly those ten strings. A typo here silently resets an
8-year-old's coins, level, trophies and drawings. Assert the ten resolved keys
in a test rather than trusting the edit.

### 1.7 Replace the hardcoded name

טומי's name appears in ten places outside `data/`. All become `profile.name`:

| file | what |
|---|---|
| `App.jsx:124` | the title, `המסע של טומי` / `TOMMY'S QUESTS` |
| `context/PlayerContext.jsx:61` | the default player name |
| `i18n/strings.js:141` | `coach.noMatches` |
| `screens/Closet.jsx:137` | `הארון של טומי 👕` |
| `arcade/Basketball.jsx:639` | aria-label |
| `arcade/NinjaSlice.jsx:547` | aria-label |
| `arcade/SkatePark.jsx:584` | aria-label |
| `arcade/Merge2048.jsx:453` | celebration text |
| `arcade/MiniSudoku.jsx:589` | celebration text |
| `arcade/SlidePuzzle.jsx:330` | celebration text |

The `PlayerContext` default keeps its existing migration path — an older save
holding `TOMMY` still becomes the profile name on load.

`Closet.jsx` is hardcoded Hebrew that ignores the language toggle; that is a
pre-existing bug. Fix it here as part of the same edit, since the line is being
touched anyway and the fix is invisible in Hebrew.

### 1.8 Deploy workflow

One job for now, matrixed in step 3:

```yaml
- run: npm ci && npx oxlint src && npm test && npm run build -- --mode tommy
- uses: peaceiris/actions-gh-pages@v4
  with:
    deploy_key: ${{ secrets.DEPLOY_KEY_TOMMY }}
    external_repository: githubonlyy/tommys-quests
    publish_dir: app/dist
    publish_branch: gh-pages
```

Then in `tommys-quests` → Settings → Pages, switch the source from Actions to
the `gh-pages` branch. The URL does not change.

### Verify step 1

- `npm test` and `npm run build -- --mode tommy` pass
- the ten storage keys resolve to their exact current strings (asserted in a test)
- no occurrence of `טומי`, `tommys-quests` or `TOMMY` under `engine/`
- the deployed site at `githubonlyy.github.io/tommys-quests/` loads, and טומי's
  existing save is intact — coins, level, trophies, drawings, chosen theme
- the built asset list matches the previous deployment

**Stop condition:** if his save does not survive, revert Pages to the old source
and stop. Nothing else in this plan matters more than that.

---

## Step 2 — Teach the engine gender

Every user-facing Hebrew string in `engine/` gains masculine and feminine forms,
and the profile picks one. `i18n/strings.js` entries become
`{ m: '…', f: '…' }`, and the `t()` lookup resolves against `profile.gender`.
Function-valued strings keep their shape, with the function returning the pair.

`match/speak.js` reads `profile.gender` instead of its hand-tuned male-voice
preference: female-first for `f`, male-first for `m`, each falling back to a
neutral voice before falling back to any voice rather than going silent. The
existing `voice.test.js` cases stay valid — they assert the pool ordering, not
the child.

The five arcade games with `כל הכבוד טומי` style celebrations already move to
`profile.name` in step 1.7; here they also gain the gendered verb forms.

Add the guard test: no bare gendered Hebrew imperative may appear under
`engine/`. Seed it with the forms that have actually caused bugs — `ציירי`,
`צייר`, `הוסיפי`, `הוסף`, `בואי`, `בוא`, `נסי`, `נסה` — and require them to come
from a paired string.

### Verify step 2

- טומי's app is behaviourally identical: same strings, same voice, same screens
- the gendered-string test fails if a bare imperative is added
- `npm test` and the build pass

---

## Step 3 — מלאני moves in, unchanged

Add `profiles/melanie/` from `Melanie_Academia/app/src`: her `events.js` →
`subjects.js`, her `questions/`, `wardrobe.json`, `themes.js`, `shop.json`,
`trophies.js`, her `avatar/parts/dress.jsx`, and her `app/coloring-pages/`
including its four existing pages.

`profile.json`: `gender: "f"`, `age: 6`, `storagePrefix: "melanies-quests"`,
her URL and repo, her pacing, `arcade: ["coinrush","flappy","bricks","moles"]`,
and `legacy` with `funTab`, `playClock`, `lessonCards`, `musicPicker` and
`boardRotation` **false**, `dance` **true**.

### 3.1 Rename her theme sprite keys

Her `themes.js` defines `theme.arcade.catch / flappy / breaker / whack`. The
engine's ids are `coinrush / flappy / bricks / moles`. Rename the keys, keeping
every value — the same emoji, titles and Hebrew blurbs reach the same games, so
nothing visible changes. A game rendered without its key crashes on open, which
has happened before, so extend the theme-skin test to cover every game in each
profile's `arcade` list.

### 3.2 Her dance screen

`world/Dance.jsx` and `world/dance/engine.js` move into `engine/`, gated on
`legacy.dance`. Her `dance.test.js` moves into the shared suite.

### 3.3 Her widgets

`BigTiles.jsx`, `CountObjects.jsx` and `TwoChoice.jsx` move into
`engine/match/widgets/`. They are engine code that only her subjects currently
use; מיכאל will use them too.

### 3.4 Extend the workflow

Matrix over tommy and melanie, each with its own deploy key and target repo.
Switch her repo's Pages source to `gh-pages`.

### Verify step 3

Build her app from `Melanie_Academia` and from the monorepo and compare:

- the same user-facing strings, in the same places
- the same ten localStorage keys, all `melanies-quests-*`
- the same screens, tabs and games reachable — her split World and Arcade tabs,
  her four games, her dance screen
- the same assets bundled, including her four coloring pages

**Any unexplained difference stops the step.** Zero differences are expected
here; she is a girl, and her app is already feminine.

---

## Step 4 — מיכאל moves in

The same shape as step 3. `gender: "m"`, `age: 3.5`,
`storagePrefix: "michaels-quests"`, `arcade` with his four games, `legacy` with
`boardRotation` **true** and everything else false. His `board.js` is already
engine code from step 1. Rename his theme sprite keys as in 3.1.

### 4.1 The one approved behaviour change

מיכאל is addressed as a girl in his own app today — `ציירי משהו קודם` around
line 403 of his `Draw.jsx`, and `הוסיפי אותי` at 476 and 580, inherited from his
sister's app. Step 2 fixes this automatically, because his profile says
`gender: "m"`.

Ship it as its own commit with its own message so it is visible in the history
rather than buried inside the move. It is the only difference the behaviour diff
should show for him.

### 4.2 His drawing screen

His `Draw.jsx` is 773 lines against the engine's 885 — layout and tap-target
size, not features; all three apps have the same four tools. Reconcile it into
the shared screen with the sizing driven by his profile. If some difference
genuinely resists that, record what and why rather than keeping a second copy of
the file.

### Verify step 4

The behaviour diff, as in step 3, with exactly one expected difference: the
three feminine strings becoming masculine.

---

## Step 5 — Retire the old source

Delete `app/` from `tommys-quests`, `melanies-quests` and `michaels-quests`,
leaving each repo holding its `gh-pages` branch and its README. Point each
README at `kids-quests`.

Archive the three local working copies rather than deleting them, until the
monorepo has run for a few weeks without incident.

### Verify step 5

All three sites still load, all three saves still intact, and a change to a
shared engine file reaches all three tablets from one commit. That last one is
the whole point — prove it deliberately with something small and visible.

---

## After the move

Convergence, one flag at a time, each a single revertable push:

1. `funTab` — מלאני and מיכאל get the merged World+Arcade tab
2. `playClock` — and play time earned by finishing different subjects
3. `lessonCards` — a teaching card before each subject
4. `musicPicker` — the eight-track picker
5. `boardRotation` — מלאני gets the rotating board
6. `dance` — the boys get the dance screen

Then `legacy` is empty, and the three apps differ only in teaching level and
which arcade games appear.

Also waiting: the two `pageInk` defects, if step 0.3 was skipped; the coloring
photo filenames that publish a child's name on a public URL; and the fact that
the 26 games are all eagerly imported, which is now a 258 kB gzipped bundle.

## Appendix — the invariant tests

These are the point of the merge, not decoration. Each one would have caught a
bug that actually reached a tablet this year.

| test | catches |
|---|---|
| no child name under `engine/` | טומי's name shipping in מלאני's build |
| storage prefixes unique and unchanged | a wiped save |
| every string has both genders | מיכאל being addressed as a girl |
| every legacy flag is known to the engine | a typo silently disabling a feature |
| every theme skins every game in the profile's arcade list | the crash-on-open Drive already had |
| question banks match the widgets their subjects declare | a mid-match crash |
| every profile defines every required field | a build that half-works |
