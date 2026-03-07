# Arcade Polish Plan

All changes in `arcade_games.html`. Grouped into 5 steps, each independently shippable.

---

## Step 1: Breakout — Power-up System

Add power-ups that drop from destroyed bricks with a ~15% chance.

**Power-up types (4):**
| Type | Color | Effect | Duration |
|------|-------|--------|----------|
| `wide` | green | Paddle width 90→140px | 8 seconds |
| `multi` | cyan | Spawn 2 extra balls | Until lost |
| `fire` | red | Ball pierces through bricks (no bounce) | 5 seconds |
| `life` | white | +1 life | Instant |

**Implementation:**
- Add `this.powerups = []` array to Breakout constructor
- On brick destroy, `Math.random() < 0.15` → spawn a power-up at brick center
- Power-ups fall at 2px/frame, drawn as small circles with a letter (W/M/F/+)
- Collision check with paddle each frame (simple AABB)
- `wide`: set `this.paddleW = 140`, `setTimeout` to revert after 8s
- `multi`: push 2 extra ball objects into `this.balls[]` — requires refactoring single ball (`bx/by/bvx/bvy`) into a `this.balls` array
- `fire`: set `this.fireBall = true`, ball doesn't reverse on brick hit, just destroys. Timer reverts.
- `life`: `this.lives++`, update HUD
- Active power-up indicator: draw small icons in top-right corner showing active timed effects

**Ball array refactor (required for multi-ball):**
- Replace `this.bx, this.by, this.bvx, this.bvy, this.ballR, this.launched` with `this.balls = [{ x, y, vx, vy, r: 5, launched: false }]`
- Update `update()` to iterate `this.balls`, remove balls that fall below H+20
- `this.launched` becomes `this.balls[0].launched` for primary ball
- Game over when all balls lost AND lives <= 0
- Losing all balls = lose 1 life, respawn primary ball

---

## Step 2: Breakout — Enhanced Brick Types

Replace the current simple `hits: 1 or 2` system with distinct brick types.

**Brick types (5):**
| Type | Visual | Hits | Points | Behavior |
|------|--------|------|--------|----------|
| `normal` | Solid fill, current colors | 1 | 10×level | Standard |
| `tough` | White border (existing) | 2 | 20×level | Current multi-hit |
| `armored` | Double white border + darker shade | 3 | 30×level | New, appears level 3+ |
| `explosive` | Orange pulsing glow | 1 | 15×level | Destroys adjacent bricks on break |
| `indestructible` | Dark gray, X pattern | ∞ | 0 | Cannot be destroyed, ball bounces off. Level clears when all destructible bricks gone. Appears level 4+ |

**Implementation:**
- Add `type` field to brick objects in `buildLevel()`
- Levels 1-2: normal + tough only (current behavior)
- Level 3+: introduce armored (top 2 rows)
- Level 4+: add 3-4 indestructible bricks in pattern, plus 2-3 explosive bricks randomly
- `explosive` on destroy: find all bricks within 50px radius, destroy them (chain reaction possible), spawn extra particles
- `indestructible`: skip in win-check (`this.bricks.filter(b => b.type !== 'indestructible').length === 0`)
- Draw variations: armored gets double border, explosive gets subtle pulsing glow (use `Math.sin(Date.now() / 200)` for alpha), indestructible gets cross-hatch pattern

---

## Step 3: Breakout — Enhanced Particle Effects

Upgrade the current simple square particles to a richer system.

**Changes:**
- **Brick break**: Increase from 8 to 14 particles. Mix shapes: squares + small triangles. Add slight rotation to each particle. Vary sizes (2-5px).
- **Screen shake**: On brick break, apply a 3-frame screen shake (±2px translate on canvas). Store `this.shakeFrames = 0`, when > 0 apply `ctx.translate(rand, rand)` in draw and decrement.
- **Ball trail**: Draw a fading trail behind the ball — store last 6 positions, draw circles with decreasing opacity (0.3 → 0.05) and size.
- **Paddle hit spark**: When ball hits paddle, spawn 4 small accent-colored sparks upward.
- **Combo counter**: Track consecutive bricks hit without paddle touch. Display floating "×2", "×3" etc. at hit location. Combo multiplier applies to score (capped at ×5).

**Implementation:**
- Extend particle objects with `size` and `shape` ('rect' | 'tri') fields
- Add `this.ballTrail = []` — push `{x, y}` each frame, keep last 6
- Add `this.comboCount = 0`, reset on paddle hit, increment on brick hit
- Floating text array `this.floatingText = []` with `{text, x, y, life}`, drawn and faded each frame

---

## Step 4: Missile Command — Enhanced Missiles & Explosions

**Bigger/varied incoming missiles:**
- Levels 1-3: standard missiles (current, radius 2.5)
- Level 4+: introduce "heavy missiles" (radius 4, slower, takes 2 explosion hits to destroy, worth 50×level points). Visually: larger dot + thicker trail, slightly different red shade.
- Level 6+: introduce "MIRV missiles" — at y=200, split into 3 smaller warheads targeting different cities. Visual: brief flash at split point.

**Enhanced explosions:**
- Player explosions: add expanding ring effect (stroke circle at 1.5× explosion radius, fading)
- Chain reaction bonus: if an explosion destroys a missile whose own explosion then catches another missile, show "CHAIN ×N" floating text and award bonus points
- Shockwave visual: brief radial lines emanating from explosion center (6 lines, fade over 10 frames)

**Implementation:**
- Add `type` field to missiles: `'normal'`, `'heavy'`, `'mirv'`
- Heavy missiles: `hits: 2` property, decrement on explosion catch, only destroy when hits <= 0
- MIRV: in update, check if `m.type === 'mirv' && m.y >= 200 && !m.split`. Set `m.split = true`, spawn 3 new normal missiles targeting random alive cities, remove parent.
- Explosion ring: in `draw()`, for each explosion also draw a stroke circle at `r * 1.3` with lower opacity
- Add `this.chainCount` tracking, `this.floatingText = []` for bonus displays

---

## Step 5: Both Games — Progressive Difficulty & Speed

**Breakout speed scaling:**
- Current: `speed = 4 + this.level * 0.5` — this is fine but cap at 8
- Add ball speed increase per 5 bricks broken within a level: `+0.1` per 5 bricks (max +1.0)
- Paddle shrinks slightly per level: `paddleW = Math.max(60, 90 - (this.level - 1) * 4)`

**Missile Command scaling:**
- Current spawn rate scales well. Add:
- Missile speed cap increase: `speed = 0.8 + this.level * 0.2` (up from 0.15)
- Multiple missiles per spawn after level 5: spawn 2 at once
- Ammo economy: start with `10 + level * 2` ammo per level (capped at 25)
- Bonus round every 3 levels: 5 seconds of rapid spawning but double points, visual indicator "BONUS WAVE"

**Implementation (both games):**
- Breakout `resetBall()`: cap speed at 8. Add `this.bricksThisLevel` counter.
- Breakout `buildLevel()`: set `this.paddleW = Math.max(60, 90 - (this.level-1) * 4)`
- MissileCommand: adjust speed formula, add `this.bonusWave` flag, double spawn rate for 300 frames then revert

---

## Execution Order

Steps 1 and 2 depend on each other slightly (brick types determine power-up drops), so do Step 2 first, then Step 1. Steps 3-5 are independent of each other but should come after 1-2. Recommended order: **2 → 1 → 3 → 4 → 5**.
