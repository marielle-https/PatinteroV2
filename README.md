# Patintero

A browser version of the Filipino street game. Dodge the taggers on each line and reach the glowing finish line. Clear all 5 levels to win.

**Stack:** HTML5, CSS3, Bootstrap 5 (CDN, CSS only) and vanilla JavaScript. No build step.

## Controls
- Desktop: Arrow keys / WASD (4 directions). `P` or `Esc` pauses.
- Touch: on-screen joystick. Pause button at top right. The game auto-pauses on tab switch or window blur.

## Rules
Level N has N taggers, one per line from the bottom. They slide along their line toward you. Touching one ends the match; reaching level N's finish line clears it. Score per level = 100 × level + a speed bonus (up to 300). The leaderboard (top 10, localStorage) ranks by levels cleared, then score.

## Structure
`index.html` · `assets/css/styles.css` · `assets/js/game.js` (state machine, input, loop, scoring, screens) · `assets/images/`

## Testing
Manual checklist: menu navigation, countdown, movement and bounds, tag → game over, crossing → next level, pause/resume/restart/menu, resize mid-game, window blur while holding a key, repeated Play/Restart (no duplicate loops), corrupted `localStorage`. See the status notes in the project hand-off for what was actually run.

## Known limitations
No audio. Sprite assets are from the original repo. Not yet verified in a real browser by the author of this refactor.
