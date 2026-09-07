# One engine, three children — merging the kids' apps

Design, 2026-09-07.

## The problem

Three children, three learning apps, three git repos:

| child | age | repo | live at |
|---|---|---|---|
| טומי | 8 | `githubonlyy/tommys-quests` | `githubonlyy.github.io/tommys-quests/` |
| מלאני | 6 | `githubonlyy/melanies-quests` | `githubonlyy.github.io/melanies-quests/` |
| מיכאל | 3.5 | `githubonlyy/michaels-quests` | `githubonlyy.github.io/michaels-quests/` |

They were forked from one another and have drifted. טומי's app now has 101
source files under `app/src`; each sibling has 63. Every engine feature costs
three implementations, and in practice that means it gets one — his — while the
other two fall further behind.

The drift is not theoretical. Measured this month:

- A coloring-page defect found in מלאני's app had already been copied
  byte-for-byte into טומי's. Fixing the set of thirteen defects took a fix pass,
  a verification pass that found two regressions, a repair pass, and then two
  separate ports. One bug, three repos, four rounds.
- טומי's avatar read as a girl for weeks because his TTS voice preference and his
  Hebrew strings were forked copies of מלאני's.
- מיכאל's drawing screen still tells a 3.5-year-old boy `ציירי משהו קודם` and
  `הוסיפי אותי` — feminine imperatives inherited from his sister's app.
- The three copies of `pageInk.js` differ only in line endings, so `diff` reports
  every line as changed and real drift hides inside the noise.

The apps differ in **data** — name, gender, subjects, difficulty, wardrobe,
themes. We have been paying for those differences as if they were differences in
**code**.

## Goals

1. One implementation of every engine feature, for all three children.
2. Each child keeps their own URL, their own home-screen icon, and their saved
   progress — coins, level, trophies, drawings. They notice nothing.
3. Gender, name, age and difficulty become profile data that the engine reads,
   not source files that get forked.
4. The three apps cannot silently drift apart again — a test fails first.

## Non-goals

- Not a shared "who is playing" screen. Each child keeps the sense that the app
  is theirs; that is most of the motivation for a 3.5-year-old.
- Not a rewrite. The engine is טומי's current code, moved, not rebuilt.
- Not a change to any child's teaching content. Subjects, question banks and
  lesson cards move as they are.

## Decisions already made

**Each child keeps their own link and icon, and their saves survive.**
All three apps are served from the same origin, `githubonlyy.github.io`.
localStorage is scoped per origin, not per path, so the three apps already share
one storage namespace and are separated only by their key prefixes
(`tommys-quests-*`, `melanies-quests-*`, `michaels-quests-*`). If each profile
declares its existing prefix, there is nothing to migrate — the saves are already
at the keys the merged app will read.

**The three existing repos stay alive as deploy targets.** They own the Pages
URLs. Deleting them deletes the kids' links. What they lose is their source.

**One engine covers 3.5 to 8.** מיכאל does work through his משימות, so the
learning loop itself fits him; what differs is content difficulty and the number
of things on screen. That is a profile, not a fork.

## Architecture

### Repository

A new **private** repo, `kids-quests`, seeded from טומי's history so nothing is
lost and no child's app is privileged as "the real one".

```
kids-quests/
  app/
    src/
      engine/              screens, match, arcade, avatar, world, components,
                           context, i18n, data (engine-level), match widgets
      profiles/
        tommy/  melanie/  michael/
    vite.config.js         resolves @profile by --mode
  .github/workflows/ci.yml one build matrix, three deploys
  docs/
```

Private, because the profiles hold the children's names, their question banks
and their family coloring photos, and a private repo keeps those out of a
browsable public tree.

This does **not** make the photos private. The built site is public either way,
and Vite emits the source filename into the asset name — today
`אבא-ומלאני-בדובאי-CUn7HUhi.png` is served from a public URL and publishes a
child's name and where she travelled. The fix for that is neutral filenames, not
repo visibility. Called out here so it is not mistaken for solved.

### What a profile contains

```
profiles/<kid>/
  profile.json         identity, stage, storage, deploy target, pacing
  subjects.js          the child's EVENTS + CATEGORIES
  questions/*.json     their question banks
  lessons.json         their lesson cards
  wardrobe.json        their wardrobe
  avatar/              their body-part set (dress.jsx for מלאני, outfit.jsx for the boys)
  themes.js
  shop.json
  trophies.js
  coloring-pages/      their own drop folder, with its README
```

`profile.json`:

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
  "capabilities": { }
}
```

The engine imports its profile through a Vite alias resolved from the build
mode, so `vite build --mode melanie` produces her app and there is no runtime
branch anywhere on "which child is this".

### Gender as data

This is the change that pays for the merge on its own.

Today מלאני's feminine Hebrew and טומי's masculine Hebrew live in separate
source files. That is why his avatar spoke in a woman's voice, and why מיכאל is
still addressed as a girl in his own drawing screen. In the merged engine every
user-facing string carries both forms and the profile selects one:

```js
'draw.empty': { m: 'הדף ריק — צייר משהו קודם!', f: 'הדף ריק — ציירי משהו קודם!' }
```

The TTS voice preference reads the same field instead of being hand-tuned per
repo: `gender: 'f'` selects a female Hebrew voice (Carmit), `gender: 'm'` a male
one (Asaf, Avri), each falling back to a neutral voice before falling back to
any voice at all rather than going silent.

A test then asserts that no bare gendered Hebrew imperative survives anywhere
under `engine/`. The bug class becomes impossible rather than merely fixed.

### Capability flags

Some differences are features one child has and another does not — not content,
and not difficulty:

| capability | טומי | מלאני | מיכאל | what it is |
|---|---|---|---|---|
| `funTab` | on | off | off | World and Arcade merged into one grouped tab |
| `playClock` | on | off | off | play time earned by finishing different subjects |
| `lessonCards` | on | off | off | a teaching card before each subject |
| `musicPicker` | on | off | off | eight chiptune tracks to choose from |
| `dance` | off | on | off | מלאני's dance screen |
| `boardRotation` | on | off | on | which subjects appear on the board today |
| `arcadeTier` | `full` | `full` | `simple` | which of the 26 games are offered |

Every one of these lives in the engine and is switched on by the profile.
Nothing is deleted and nothing is duplicated. The "off" column is the migration
plan: those flip to `on` in step 4 and step 5, one push at a time.

`arcadeTier` is what lets מיכאל's app stay a 3.5-year-old's app while being the
same code that will grow with him. When he is 6, it is a one-line change.

One difference resists being a flag and needs a closer look in step 5: מיכאל's
drawing screen is a smaller variant of the same file (773 lines against 885),
differing in layout and tap-target size rather than in features — all three apps
offer the same four tools. Those differences should become profile-driven sizing
in the shared screen; if they turn out not to, that is a finding worth recording
rather than a reason to keep two copies of the file.

### Migration hazard: per-theme sprite keys

The four original arcade games have different ids in different apps. טומי's
themes define `theme.arcade.coinrush / flappy / bricks / moles`; both siblings
define `catch / flappy / breaker / whack`. A game ported without its key crashes on open
— this has already happened once, when Drive read `theme.arcade.catch` in
טומי's app. The engine uses טומי's ids; each profile's `themes.js` is renamed to
match when that profile moves in, and the existing theme-skin test is extended to
cover every game the engine can render.

### What never enters the engine

The child's name, their grammatical gender, their storage prefix, their subjects
and question banks, their lesson content, their wardrobe and avatar parts, their
themes, shop and trophies, and their coloring pages.

If a change wants to put one of those in `engine/`, that is the signal the
boundary is wrong, not a reason to make an exception.

## Build and deploy

One workflow, a matrix over the three profiles. Each leg runs the full suite for
that profile, builds `vite build --mode <kid>`, and pushes `dist/` to that
child's repo using an SSH deploy key scoped to that repo alone — three keys,
each useless anywhere else, each rotatable independently. No broad personal
access token.

CI already pins `actions/checkout@v7`, `actions/setup-node@v7`,
`actions/upload-pages-artifact@v5` and `actions/deploy-pages@v5`; all four tags
are confirmed to exist. The lint gate moves from `--max-warnings 200` to the
current warning count, so any new warning fails rather than sitting in 170
warnings of headroom where it can never fire.

### Rejected alternative

A public `kids-quests` that each child's own CI clones and builds needs no
secrets at all. Rejected because it puts the children's names, banks and family
photos in a browsable public tree for the sake of avoiding three deploy keys.

## Migration plan

Each step ends with all three apps working and shippable. You can stop after any
of them.

**Step 0 — clean the slate.** Commit and push the outstanding coloring-page work
in all three repos, and add `.gitattributes` normalising line endings. Until
this lands, diffs between the three copies are noise and the merge cannot be
verified.

**Step 1 — plumbing, no behaviour change.** Create `kids-quests` from טומי's
history. Move his source to `engine/` and `profiles/tommy/`. Prove he still
builds, still deploys to `tommys-quests`, still opens at the same URL with his
save intact. This is where the deploy keys get proven, on the app whose progress
matters most, before anything else moves.

**Step 2 — teach the engine gender.** Every user-facing string gains both forms;
the voice preference reads the profile. טומי's app must come out behaviourally
identical: same strings, same voice. The gendered-string test lands here.

**Step 3 — מלאני moves in, unchanged.** Add `profiles/melanie` with her existing
content and her capability flags all off. Her app builds from the monorepo and
deploys to her URL looking exactly as it does today. This is the riskiest step
and it stays deliberately boring: same app, new build path.

**Step 4 — מלאני's capabilities, in small pushes.** The merged fun tab, then the
play clock, then the 22 additional games, then lesson cards and the music
picker. Each push is one visible change on her tablet, and one revert away from
the app she had.

**Step 5 — מיכאל moves in and is tuned for 3.5.** Same two-phase shape: content
first, unchanged; then capabilities, with `arcadeTier: 'simple'`, fewer drawing
tools and shorter rounds. His inherited feminine strings are fixed by step 2
automatically, since his profile says `gender: 'm'`.

**Step 6 — retire the old source.** Delete `app/src` from the three repos. They
keep their names, their Pages settings, their URLs and their deployed output.

## Testing

The suite runs three times, once per profile, plus cross-profile invariants that
are the real payoff:

- no child's name appears anywhere under `engine/`
- every profile defines every required `profile.json` field
- the three storage prefixes are unique, and unchanged from today's values —
  this is what guarantees the saves survive
- every engine string defines both a masculine and a feminine form
- every capability flag a profile sets is one the engine knows
- every theme defines a sprite skin for every game the engine can render
- every profile's question banks match the widgets their subjects declare

The first, third and fourth of those would each have caught a bug that actually
shipped to a tablet this year.

## Risks

**Step 4 changes מלאני's app substantially.** Mitigated by shipping it in four
or five separate pushes rather than one, each individually revertable.

**Deploy keys are new machinery.** Mitigated by proving them in step 1 on טומי's
app alone, before either sibling depends on them.

**A profile could quietly grow into a second engine.** If `capabilities` starts
carrying behaviour rather than switches, the boundary has failed. The flag list
in this document is the reference; adding a flag should feel like a decision.

**The merge is a lot of movement at once in step 1.** Mitigated by it being pure
file movement with no behaviour change, verifiable by diffing the built bundle
against the current deployment.

## What this does not solve

The coloring-page pipeline still has two known defects at the time of writing: a
light or textured desk is mistaken for the paper, keying up to 31% of the sheet
solid black, and a full-bleed band thinner than 15% of the page height is
cropped away entirely. Both are in `pageInk.js`, both are in all three apps, and
both are fixed once after the merge instead of three times before it.
