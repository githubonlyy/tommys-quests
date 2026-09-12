# Tommy's Quests · המסע של טומי

Tablet-first homework game for a third grader (כיתה ג').

- **Live:** https://githubonlyy.github.io/tommys-quests/
- **Source:** [githubonlyy/kids-quests](https://github.com/githubonlyy/kids-quests) — not here

## This repo is not where the app is built

One engine now serves all three children. The source moved to `kids-quests` in
September 2026, and the `app/` tree that used to live here was deleted on
2026-09-12 rather than left to rot into a second, wrong answer.

What remains is the published site: GitHub Pages serves the `gh-pages` branch,
and `kids-quests` CI force-pushes each new build to it. The URL, the home-screen
icon and the saved progress in `localStorage` (`tommys-quests-v1`) are unchanged —
keeping them is the reason this repo still exists.

To change anything about the app — subjects, questions, rewards, the avatar,
Tommy's own content under `src/profiles/tommy/` — work in `kids-quests`. A push
to its `master` rebuilds and redeploys all three children.

The history here is intact: every commit up to the migration is still in this
repo, and the old source is recoverable from it.
