# One engine, three children — merging the kids' apps

Design, 2026-09-07. Revised 2026-09-08: the move is behaviour-preserving.

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

## The shape of this work

There are two phases and they must not be confused.

**The move** consolidates three repos into one and changes nothing else. Every
app comes out of it behaving exactly as it does today — same screens, same
strings, same games, same saves, same URL. If a child could tell the move
happened, the move was done wrong.

**Convergence** comes afterwards, as ordinary feature work, and is out of scope
for this document beyond naming what it will retire. Because the apps then share
one engine, a change lands in all three at once.

## Goals

1. One implementation of every engine feature, for all three children.
2. **No app's behaviour changes during the move.** This is the hard constraint
   the plan is built around, not an aspiration.
3. Each child keeps their own URL, their own home-screen icon, and their saved
   progress — coins, level, trophies, drawings.
4. Gender, name, age and difficulty become profile data that the engine reads,
   not source files that get forked.
5. The three apps cannot silently drift apart again — a test fails first.

## Non-goals

- **No feature is added, removed or changed during the move.** Differences that
  exist today survive it intact, including the ones we intend to retire later.
- Not a shared "who is playing" screen. Each child keeps the sense that the app
  is theirs; that is most of the motivation for a 3.5-year-old.
- Not a rewrite. The engine is טומי's current code, moved, not rebuilt.
- Not a change to any child's teaching content.

## What may differ per child, permanently

Exactly two things:

1. **Teaching level** — subjects, question banks, lesson cards, and the pacing
   around them. A 3.5-year-old and an 8-year-old do not get the same משימות.
2. **Which arcade games appear** — some of the 26 are not for a 3.5-year-old.

Everything else is the same app. Every current difference beyond those two is a
temporary state, carried through the move by a flag that has an expiry.

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
  "arcade": ["coinrush", "flappy", "bricks", "moles", "..."],
  "legacy": { }
}
```

`arcade` is a permanent per-child list. `legacy` holds the temporary flags below
and is empty when the last of them is retired.

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

Note that this is the one place where "behaviour does not change" needs care.
מיכאל is addressed as a girl today, in his own app. Fixing that is a behaviour
change, and a wanted one — it ships as its own visible commit rather than hiding
inside the move.

### Legacy flags, and when each one dies

Every difference that is not teaching level or arcade selection is temporary.
These exist so the move can preserve today's apps exactly; each is retired
afterwards by turning it on everywhere and deleting the flag.

| flag | on today for | retired by |
|---|---|---|
| `funTab` | טומי | giving מלאני and מיכאל the merged World+Arcade tab |
| `playClock` | טומי | giving them play time earned by finishing subjects |
| `lessonCards` | טומי | giving them a teaching card before each subject |
| `musicPicker` | טומי | giving them the eight-track picker |
| `boardRotation` | טומי, מיכאל | giving מלאני the rotating board |
| `dance` | מלאני | giving the boys the dance screen |

Six flags, six deletions. When `legacy` is empty the apps differ only in
teaching level and arcade selection, which is the end state.

The flag list is the contract. Adding a seventh should feel like a decision and
should come with the sentence that retires it; a flag with no expiry is drift
wearing a different hat.

### Migration hazard: per-theme sprite keys

The four original arcade games have different ids in different apps. טומי's
themes define `theme.arcade.coinrush / flappy / bricks / moles`; both siblings
define `catch / flappy / breaker / whack`. A game rendered without its key
crashes on open — this has already happened once, when Drive read
`theme.arcade.catch` in טומי's app.

The engine uses טומי's ids. Each profile's `themes.js` is renamed to match when
that profile moves in, which is a rename of data with no visible effect: the
same emoji, titles and colours reach the same games. The theme-skin test is
extended to cover every game each profile's `arcade` list can render.

### One difference that resists being a flag

מיכאל's drawing screen is a smaller variant of the same file — 773 lines against
885 — differing in layout and tap-target size rather than in features. All three
apps offer the same four tools. Those differences should become profile-driven
sizing in the shared screen. If they turn out not to, that is a finding worth
recording rather than a reason to keep two copies of the file.

### What never enters the engine

The child's name, their grammatical gender, their storage prefix, their subjects
and question banks, their lesson content, their wardrobe and avatar parts, their
themes, shop and trophies, their arcade list, and their coloring pages.

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

## The move

Each step ends with all three apps working, shippable, and unchanged. You can
stop after any of them.

**Step 0 — clean the slate.** Commit and push the outstanding coloring-page work
in all three repos, and add `.gitattributes` normalising line endings. Until
this lands, diffs between the three copies are noise and the move cannot be
verified.

**Step 1 — plumbing.** Create `kids-quests` from טומי's history. Move his source
to `engine/` and `profiles/tommy/`. Prove he still builds, still deploys to
`tommys-quests`, still opens at the same URL with his save intact. This is where
the deploy keys get proven, on the app whose progress matters most, before
anything else moves.

**Step 2 — teach the engine gender.** Every user-facing string gains both forms;
the voice preference reads the profile. טומי's app must come out behaviourally
identical.

**Step 3 — מלאני moves in.** Add `profiles/melanie` with her existing content,
her arcade list of four, and her legacy flags set to match today. Her app builds
from the monorepo and deploys to her URL looking exactly as it does now.

**Step 4 — מיכאל moves in.** The same, tuned to nothing: his app also comes out
identical. The one intended difference is that his inherited feminine strings
become masculine, shipped as its own commit so it is visible rather than buried.

**Step 5 — retire the old source.** Delete `app/src` from the three repos. They
keep their names, their Pages settings, their URLs and their deployed output.

The move ends here. Nothing on any tablet has changed.

## After the move

Convergence is ordinary feature work, done in whatever order suits the children,
one flag at a time. Each is a single push that lands for whoever is missing it,
and deletes a flag:

מלאני and מיכאל get the merged fun tab, then the play clock, then lesson cards,
then the music picker. מלאני gets the rotating board. The boys get the dance
screen. Then `legacy` is empty.

Each of those is individually revertable, and each one is now written once
rather than three times — which is the entire point of the move.

## Testing

The suite runs three times, once per profile, plus cross-profile invariants:

- no child's name appears anywhere under `engine/`
- every profile defines every required `profile.json` field
- the three storage prefixes are unique, and unchanged from today's values —
  this is what guarantees the saves survive
- every engine string defines both a masculine and a feminine form
- every legacy flag a profile sets is one the engine knows
- every theme defines a sprite skin for every game in that profile's arcade list
- every profile's question banks match the widgets their subjects declare

The first, third and fourth of those would each have caught a bug that actually
shipped to a tablet this year.

### Proving the move changed nothing

The constraint deserves a check rather than a promise. For each child, build the
app from its old repo and from the monorepo and compare the two:

- the same set of user-facing strings, in the same places
- the same localStorage keys read and written
- the same screens, tabs and games reachable
- the same assets bundled

Any difference must be explainable, and for מיכאל exactly one is expected: the
feminine strings becoming masculine. An unexplained difference stops the step.

## Risks

**A "temporary" flag becomes permanent.** This is the failure mode that rebuilds
the drift inside one repo. Mitigated by every flag carrying its retirement in
this table, and by `legacy` being expected to reach empty.

**Deploy keys are new machinery.** Mitigated by proving them in step 1 on טומי's
app alone, before either sibling depends on them.

**Step 1 moves a lot of files at once.** Mitigated by it being pure file
movement with no behaviour change, verifiable by diffing the built bundle
against the current deployment.

## What this does not solve

The coloring-page pipeline still has two known defects at the time of writing: a
light or textured desk is mistaken for the paper, keying up to 31% of the sheet
solid black, and a full-bleed band thinner than 15% of the page height is
cropped away entirely. Both are in `pageInk.js`, both are in all three apps, and
both are fixed once after the move instead of three times before it.
