# Simple Fishing 1.4.0

Fishing actor tokens and a single-window timing minigame for D&D 5e on Foundry VTT 14. No extra modules required.

## Install or update

1. Close Foundry.
2. Extract the ZIP and place the **simple-fishing** folder in **Data/modules/**. When updating, replace the existing folder.
3. Confirm the manifest is at **Data/modules/simple-fishing/module.json**.
4. Restart Foundry and enable **Simple Fishing** in Manage Modules.
5. **Every player must refresh their browser page** to load the updated interaction code. Use Ctrl+Shift+R if the old version remains cached.

Manual installation only: this package has no hosted manifest or automatic update URL.

## Add a fishing spot

1. Open **Token Controls** on the left toolbar (the character/token icon).
2. Click the **fish button — Add Fishing Spot**.
3. Click the map. Escape cancels placement.
4. A small **Fishing Spot** window opens with name, catches remaining, difficulty, **Bite DC** (default 10), and **Delete spot when empty**.
5. Click **Save**.

The module creates a reusable **Fishing Spot** NPC actor automatically. Each placed token has its own catch count. You can also drag this actor from the Actors sidebar onto a scene; its fishing setup opens automatically.

Players **single-click the Fishing Spot token** to fish. Native single/double-click handlers are installed during initialization, before tokens are drawn; a board capture handler also supports clicks through empty HUD/interface overlays. The token grants observer access and has a separate board click handler so players do not need control of the spot. GM double-click opens the clean fishing setup, with Save, Test fishing, and Delete spot. The standard NPC sheet and tile editor are not part of this flow.

Move or delete the spot with the normal token controls, or use Delete spot in the fishing setup. Delete when empty removes that placed token after its final catch; it keeps the reusable actor. A missed Reel click leaves the count unchanged. Failed bite rolls use up one catch; a natural 1 removes the spot immediately.

## Add rewards

Open **Configure Settings → Module Settings → Simple Fishing → Fishing Rewards**.

There are three drop areas, each with a list underneath:

- **Common / Easy**
- **Uncommon / Medium**
- **Rare / Hard**

Drag your own Items or RollTables from a sidebar or compendium into a drop area. Entries appear immediately and save automatically. Click × to remove one.

Nothing is prefilled. The module creates no reward tables and supplies no automatic Fish reward. Add at least one entry for the difficulty you plan to use. If a list is empty, the cast reports this without spending bait.

One list entry is chosen at random per bite. An Item entry grants one copy of that item on success. A RollTable entry rolls that table and awards its Item results. Use world/compendium Item results in your tables when you want items in inventory. Text-only results produce a result message. Multiple returned Items are awarded together as one successful catch.

Tables use Foundry's recursive `roll()`, not `draw()`: the module does not mark results drawn. Spot counts manage supply. Enable table replacement and reset any previously drawn entries for reusable rewards.

There are no per-spot reward lists or override reward boxes. Each spot uses the module list matching its difficulty.

## Fish

Players **single-click a Fishing Spot token** while using their normal Token Controls.

The selected character must have **Fishing Tackle** in their inventory with quantity above zero. Use the standard item named Fishing Tackle, or one with the D&D identifier `fishing-tackle`. Renamed items retaining that identifier also work. The tackle is reusable: it is never consumed by casting and is excluded from bait choices. It does not need to be equipped.

Casting is blocked without tackle, including requests sent outside the normal UI. The GM client checks again immediately before a bite roll, so removing the tackle while waiting also blocks the attempt without spending bait.

The fishing window lets them choose an owned character and either:

- **No bait** — nothing is removed from inventory.
- Any other inventory item with quantity above zero — one is used on the cast.

Click **Cast**. The GM client rolls **1d20** against that spot's **Bite DC**, default 10. The dice result is whispered to the player and GM.

- **Below the DC (except natural 1):** the window shows **No bite** and one fish leaves the area, reducing remaining catches by 1. No catch game opens and no reward is awarded. Delete when empty applies if this reaches zero.
- **Natural 1:** the message says **“The fish were scared away!”** and the placed spot is deleted, regardless of Delete when empty.
- **Natural 20:** add **1 remaining catch**, then open the catch game. A successful Reel still uses one catch, so success leaves the spot at its count before the critical roll. A missed Reel retains the bonus catch. The bonus respects the maximum count of 99,999.
- **At or above the DC:** the same window changes to the moving fish game.

Selected bait is spent on the cast even if no fish bites; No bait consumes nothing. There is no skill modifier on this roll.

Once a fish bites, click **Reel** once while the fish's center is inside the green zone. Players get 15 seconds and one click per cast. Easy catches have a wider zone and slower fish; hard catches have a narrower zone and faster fish. Each character's Dexterity and Wisdom also change the game:

- **Dexterity modifier:** each +1 increases the full back-and-forth sweep duration by 10%, slowing the fish. Negative modifiers speed it up. Sweep duration stays between 50% and 200% of the difficulty's base duration.
- **Wisdom modifier:** each +1 adds 2 percentage points to the green-zone width; negative modifiers reduce it.
- **No bait:** multiplies the character-adjusted green-zone width by 0.65, making it 35% narrower. It does not change the bite DC or reward tier.
- The final green zone stays between 5% and 50% of the bar to keep attempts playable.

Base values with DEX +0, WIS +0, and bait: Common 30% / 2.4 seconds per sweep; Uncommon 20% / 1.8 seconds; Rare 12% / 1.3 seconds. For example, Common with DEX +4 and WIS +3 has a 36% zone and 3.36-second sweep; without bait, the same character has a 23.4% zone.

The game shows the character's DEX/WIS modifiers and a no-bait reminder. Stats are read from the chosen character on the GM client for each attempt, using prepared modifiers (including character effects), with an ability-score fallback. The d20 bite roll remains unmodified.

A successful Item reward is automatically added to the chosen character's inventory with quantity 1. The same window shows the result and allows another cast. Quantity-one bait items are deleted; stacks decrease by one. Used bait is lost on misses or cancelled started attempts. No-bait attempts never consume inventory items.

## Optional GM choice for unusual bait

**GM chooses each catch** is off by default to keep fishing quick. Enable it in Fishing Rewards when you want to react to unusual bait.

The GM receives one small prompt showing the bait, difficulty, and a Catch field. Type a catch name, or drag an Item onto that field. A typed name becomes a loot item if caught; a dropped Item grants a copy. Leave the field blank to use the configured difficulty list. Click **Roll for a bite** to spend the selected bait and roll the d20. The catch game opens only if the bite roll succeeds. Cancelling before the roll spends no bait.

The player stays in the same fishing window while waiting.

## Updating from 1.0.0 or 1.1.0

Replace the existing module folder and restart Foundry. Your reward lists are retained.

Fishing Spot actors/tokens from 1.0.0 remain usable. Existing fishing tiles from 1.1.0 are converted to actor tokens when the primary GM opens their scene. Conversion preserves the name, remaining catches, difficulty, and delete-when-empty setting. It removes the old tile only after a token exists and records its source to avoid duplicates on retries. Other tiles are untouched.

The fish button now lives under Token Controls. There is no fishing button under Tile Controls.

## 1.4.0 character difficulty and fishing tackle

Fishing Tackle is required and reusable. DEX changes fish speed, WIS changes green-zone width, and no bait narrows the zone. The selected character's stats are enforced by the GM client. No extra equipment or reward configuration is required.

## 1.3.1 bite outcomes

Failed bite rolls reduce remaining catches by 1. Natural 1 scares away all fish and deletes the placed spot. Natural 20 adds 1 remaining catch before the timing game. Regression tests cover all three outcomes, including duplicate-cast protection and depletion.

## 1.3.0 window fix and bite roll

The fishing UI no longer assigns to ApplicationV2's read-only `state` property. It uses a separate `fishingState` property. The regression test now includes the read-only framework getter and reproduces the prior TypeError before the fix.

A GM-authoritative d20 bite roll now gates entry to the timing game. Each spot has a Bite DC of 1–20, default 10. A failed bite roll spends selected bait and reduces stock by one, without awarding rewards or opening the catch game. A natural 1 removes the spot; a natural 20 adds a catch before the game. Meeting the DC starts the catch game normally.

## 1.2.1 interaction fix

- Native token click/permission handlers now install during initialization/setup rather than after initial drawing.
- Player fishing clicks are allowed without giving ownership, dragging, or HUD access.
- The board handler accepts empty interface/HUD overlays instead of requiring the raw canvas as its event target.
- Floating windows and actual controls still block board clicks.
- Listeners install on both world readiness and scene readiness, and are removed cleanly on scene changes.

## Limits and recovery

- An active GM must remain connected. Only the primary active GM processes attempts.
- One attempt per spot and one attempt per character at a time.
- Players need normal permission to create chat messages; requests use private GM whispers.
- Player clicks use the spot token's bounds. Avoid overlapping it with character tokens.
- There is no distance restriction: visible fishing tokens on the current scene can be used.
- Pending GM approval expires after 3 minutes. Started sessions expire after 45 seconds on the GM side to allow network delivery time.
- Closing the fishing window cancels the cast. Bait already used is not refunded.
- Finish casts before refreshing or changing the primary GM. Sessions are in memory; the GM should restore bait manually if interrupted by a refresh or disconnection.
- Avoid editing stock during an active cast. A missing/empty spot cannot award rewards.
- Rewards/results are whispered to the player and processing GM.
- This is a casual minigame, not an anti-cheat system. Reward and stock writes run on the GM client.
- English labels only.

## Developer API and tests

```js
// Place an actor token using the same tool as the toolbar button.
game.modules.get("simple-fishing").api.placeSpot();

// Open reward lists.
game.modules.get("simple-fishing").api.settings();

// Open fishing for a selected Fishing Spot token, for GM testing.
const token = canvas.tokens.controlled[0];
if (token) game.modules.get("simple-fishing").api.fish(token);
```

Run `node --test dev-tests/fishing.test.mjs` with Node 22+ from this folder.

Syntax checks and mocked integration tests, including a read-only ApplicationV2 state getter, cover stat effects, no-bait penalties, tackle requirements/reuse, bite-roll failures/successes and the token toolbar registration, actor creation, native player clicks bound before initial drawing, clicks through HUD overlays, rejection of window/control clicks, clean setup windows and old-tile conversion, no-bait casts, item bait consumption, empty reward lists, Item and RollTable rewards, GM custom catches, ownership checks, concurrent attempts, duplicate reel requests, misses, stock depletion, deletion and rollback after failed stock writes.

This build targets Foundry VTT 14's documented APIs. It has not been loaded in a licensed Foundry instance or tested with real multiplayer clients. Future major versions are permitted by the manifest but are not guaranteed compatible. Test in a spare world first.

API references:

- https://foundryvtt.com/api/v14/functions/hookEvents.getSceneControlButtons.html
- https://foundryvtt.com/api/v14/classes/foundry.applications.sheets.TileConfig.html
- https://foundryvtt.com/api/v14/classes/foundry.applications.api.ApplicationV2.html
