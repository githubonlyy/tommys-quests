# Tommy's Quests — MVP Design Spec

**Date:** 2026-08-22
**Status:** Approved (brainstorm session with Lior)
**Source docs:** [PRD.md](../../../PRD.md), [mockup.md](../../../mockup.md)

## Summary

Tablet-first web app gamifying 3rd-grade homework (Math, English, Hebrew, Geography) in "Brawl Stars" style. Coins earned by playing quiz matches, redeemable for real-world rewards only. MVP = Phase 1 of PRD: frontend only, localStorage persistence, hardcoded question banks.

## Locked Decisions

| Topic | Decision |
|---|---|
| Language | Mixed: English for short game words (PLAY!, SHOP, EPIC, LVL, WIN); Hebrew for instructions, questions, descriptions. RTL on Hebrew blocks; overall layout LTR (sidebar left). |
| Gameplay | Hybrid engine: one shared quiz engine + per-subject answer widget. |
| Match format | 10 questions/match. 20s soft timer per question (expiry = wrong, never ends match). Win = 7+ correct, Draw = 5–6, Loss = <5. |
| Economy | Full coins on first play per event per day (reset 05:00). Replays = XP only ("PRACTICE" badge). |
| Stack | Vite + React 18 + Tailwind CSS + lucide-react. No router; tab state. localStorage persistence. |

## Architecture

```
app/
  src/
    App.jsx                    // shell: sidebar, header, tab switch
    context/PlayerContext.jsx  // coins, xp, level, dailyPlays, battleLog, purchases
    screens/
      EventBoard.jsx
      Shop.jsx
      CoachStats.jsx
    match/
      MatchEngine.jsx          // question loop, timer, scoring, results
      widgets/
        NumberPad.jsx          // math
        LetterTiles.jsx        // english
        WordTap.jsx            // hebrew
        MapGrid.jsx            // geography
    data/
      questions/{math,english,hebrew,geography}.json
      shop.json
      config.json              // PIN default, coin tuning, daily reset hour
```

**State:** single PlayerContext, persisted to localStorage key `tommys-quests-v1` on every change. Holds: `coins`, `xp`, `level`, `dailyPlays` (eventId → date of last paid play), `battleLog` (last 100: timestamp, subject, result, correct count, avgTimePerQ, coinsEarned, practice flag), `purchases`.

**Data flow:** EventBoard → MatchEngine (reads question JSON, samples 10) → one result action → context updates coins/xp/log atomically → localStorage sync. Shop reads/deducts coins. CoachStats reads log only.

## Match Engine

Flow: mission modal → fullscreen match → 10 questions → results → board.

Per question: question card, subject widget, 20s countdown bar, instant feedback (green flash + coins on correct; red shake + show correct answer 2s on wrong).

Widgets:
- **Math (Vault Heist):** number pad 0–9 + backspace + OK. ×/÷ up to 100, +/− up to 1000.
- **English (Alien Decode):** letter tiles, spell word from Hebrew hint/emoji. Beginner vocab.
- **Hebrew (Ancient Scroll):** sentence displayed RTL, tap the verb/noun.
- **Geography (Map Maker):** simple Israel map SVG, tap correct city/region.

Results screen: WIN/DRAW/LOSS, coin tally animation, confetti on win, AGAIN? (practice) + EXIT.

## Economy

- 10 coins per correct; +5 speed bonus if answered <10s
- +50 win bonus; max ≈200/match, ≈800/day (4 events)
- XP: 10/correct, always (paid and practice). Level N→N+1 costs 200+100×N XP. Level-up celebration screen.
- Shop: buy deducts instantly, success toast, purchase logged. Parent fulfills in real life. Buy disabled when short (locked overlay per mockup).
- Prices seed: Rare 500 / Epic 1200 / Legendary 5000 (shop.json, hand-editable).

## Coach Stats (Parent)

- PIN gate: 4-digit, default 1234, changeable in coach screen, stored in localStorage. 3 wrong tries → 60s lockout.
- Metrics: win rate, avg time/task, total wins, per-subject accuracy breakdown.
- Battle log table (from mockup) + purchases list.

## Edge Cases

- Corrupt/missing localStorage → reset to defaults + warning toast.
- Mid-match refresh → match abandoned, no coins (anti-cheat).
- Double-tap protection on buy buttons.
- Coin balance can never go negative; buys re-check funds at click.

## Question Banks

~40 questions per subject, static JSON, 3rd-grade-Israel level, Hebrew included. Authored by Claude, reviewed/edited by parent directly in JSON files.

## Testing

- Vitest: scoring rules, win/draw/loss thresholds, daily-reset logic, economy math, level curve.
- Manual play-test for UI/UX on tablet.

## Out of Scope (Phase 2)

Firebase/Supabase auth + cloud store, tamper-proof balance, parent task editor UI, purchase approval flow.
