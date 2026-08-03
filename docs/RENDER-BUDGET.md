# The render budget — measured, on a real browser, against the real bytes

`docs/ecosystem/23-tessera.md` §13, "What I could not verify":

> **Browser rendering performance for a densely built parcel.** No prototype exists. The object
> caps in §6.2 are reasoned from tile counts, not measured. **This is the riskiest unmeasured
> number in the document**, and measuring it should be the first thing phase 1 does — if 640
> sprites in a Plot does not hold 60 fps on a mid laptop, the caps change and several other numbers
> move with them.

This is that measurement. Reproduce it with `pnpm measure`; the raw rows are in
`docs/render-budget.json`, which the run writes.

---

## The answer, first

**640 sprites in a Plot holds 60 fps, with the cap fully spent and the whole claim on screen, on a
4×-CPU-throttled machine. §6.2's Plot cap survives.**

But that is not the interesting half. **Two of the four caps do not survive, and the reason they do
not is that the cap is the wrong unit.**

| Tier | Cap | Draws when the whole claim is on screen | 1× | 4× (mid laptop) | Verdict |
| --- | --- | --- | --- | --- | --- |
| Homestead | 160 | 160 + 256 = 416 | 120 fps | 120 fps | holds, easily |
| Plot | 640 | 640 + 1,024 = 1,664 | **120 fps** | **63 fps** | **holds** |
| Court | 2,560 | 2,560 + 4,096 = 6,656 | 60 fps | **20 fps** | **fails on a mid laptop** |
| Quarter | 10,240 | 10,240 + 16,384 = 26,624 | **17 fps** | **5 fps** | **fails outright, by ~5×** |

**And yet the recommendation is that §6.2 should not change.** The caps are not what a renderer
spends. What a renderer spends is *draws in a frame*, and what puts draws in a frame is the camera,
not the deed. The correct fix is in the client — a zoom floor — and it is implemented.

---

## The number the caps should have been stated against

One tile of the 2:1 dimetric lattice covers **16,384 world px²** — the determinant of the basis
`[[128, −128], [64, 64]]`, derived in `src/render/iso.ts` and checked in `test/iso.test.ts`. So a
viewport of `W × H` at zoom `z` holds

```
    W · H / (16384 · z²)
```

tiles, **whatever tier owns the ground under it**. At 1440×900 and zoom 1 that is **79 tiles**. A
Plot is 1,024 tiles, so at full zoom its 640-object cap can put at most ~49 objects in a frame
however hard its owner tries.

A per-parcel cap therefore binds the renderer at exactly one zoom — the one where the whole claim
fits — and binds nothing at all either side of it. Zoomed in, the viewport is the limit. Zoomed
out, the limit is how many *parcels* are in frame, which no per-parcel cap bounds.

`zoomToFit` at 1440×900, for the four tiers: **0.352** Homestead, **0.176** Plot, **0.088** Court,
**0.044** Quarter.

---

## What is real in this measurement, and what is not

**Real.** A real Chromium (not a simulation of one), painting through a real GPU — verified, not
assumed: the run reads WebGL's unmasked renderer string out of the page and records it. It read
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)`. The **real renderer** is
imported and bundled from `src/render/`, not rewritten to be fast. The **real sprite bytes** are
the 512×512 FLUX 2 Pro generations in `micro-tessera-assets/assets/objects/` and the 256×128
projected tiles in `assets/tiles/`, served over HTTP and decoded by the browser's own PNG decoder.
Frame timing is `requestAnimationFrame`'s own timestamps, so `fps` counts frames the compositor
presented.

**Not real, named rather than smoothed over.**

- **The object sprites are not yet cut out to alpha.** `cutout.py` exists in
  `micro-tessera-assets` and has not been run over set 3, so the PNGs on disk are RGB on the pinned
  `#12100f` ground. Alpha is keyed *in the browser at load time*, once, producing exactly the RGBA
  texture production will decode. What is **not** measured is the decode cost of the real cut-out
  PNG — which differs in file size and therefore in *load* time, not in *frame* time.
- **55 distinct object sprites existed at measurement time, not 96.** They are cycled. A GPU
  texture cache is friendlier to 55 textures than to 96 — so `plot-fitted-96-textures` re-runs the
  same scene with 96 genuinely distinct bitmaps to bound that effect. **It found none:** 3.0 ms
  against 2.7 ms at 1×, 11.9 against 11.7 at 4×. Texture-cache pressure is not a factor at these
  counts, and this is one fewer thing to worry about than expected.
- **The ground is measured on isolated parcels**, where it stops at the claim boundary. In a
  continuous ward it does not. See "What this measurement does not yet cover", below — it is the
  one open number, and it is stated rather than filled in.
- **One machine.** An Apple M1 Pro, 10 cores. That is not "a mid laptop", so every scenario is run
  twice: unthrottled, and at **4× CPU throttling**, which is the multiplier Lighthouse uses to
  approximate a mid-range machine from a development one. **The 4× column is the one the verdict
  is taken from.**

---

## The cost model

Cost per `drawImage` under 4× throttling, measured at two very different scales:

| Scene | Draws | CPU p50 | µs per draw |
| --- | --- | --- | --- |
| `plot-fitted` | 1,664 | 11.7 ms | **7.0** |
| `court-fitted` | 6,656 | 47.4 ms | **7.1** |

**Flat across a fourfold range.** So the renderer is draw-call bound, not fill bound, and the budget
is a simple division: a 16.6 ms frame affords **2,371 draws** at 4×.

`DRAW_BUDGET` is set to **2,000**, leaving about 15% of the frame for React, the shared bar, the
wallet strip and everything else on the same thread.

It is a **total** — ground plus sprites — and that correction came out of the measurement. Ground
is one draw per tile and there are more tiles than objects (a Plot is 1,024 ground tiles against a
640-object cap), so a budget counting only sprites counts the smaller half. The first version of
this constant was `SPRITE_BUDGET = 2400`: wrong in two ways at once, counting the wrong thing and
set from a guess about a machine nobody had run.

---

## The zoom floor, and why the third decimal place matters

`SPRITE_MIN_ZOOM` and `GROUND_MIN_ZOOM` are **0.17**.

They were 0.18, chosen on readability grounds — at that zoom a 512-pixel sprite is 92 device pixels
and a chair is a smudge. The measurement showed 0.18 is **wrong by a hair and therefore completely
wrong**: a Plot fits a 1440×900 viewport at **0.1758**, so a floor of 0.18 would have refused to
draw a single object on the one screen the Plot tier exists for — a player looking at their own
fully-built Plot, seeing bare ground.

Nothing about 0.18 looks wrong until something lands 1.2% below it. That is the difference between
a reasoned constant and a measured one, in one number.

The floor lands just under the Plot's fit, which means **a Plot is the largest claim you ever see
whole**. A Court or a Quarter is something you walk, not something you look at. §6.4 already puts
the overview on a different screen; the renderer now agrees with it, arithmetically.

---

## The full run

Machine: Apple M1 Pro, 10 cores, 34 GB, macOS. Chrome via `playwright-core`, GPU verified as ANGLE
Metal. 40 sampled frames per cell after 15 discarded. `cpu` is time inside `renderer.draw`;
`frame` is the interval between presented frames. Measured 2026-08-03.

### 1440×900 @ dpr 2, unthrottled

| Scenario | Sprites | Ground | Zoom | CPU p50 | Frame p50 | Frame p95 | fps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `plot-full-zoom` | 119 | 111 | 1.0000 | 0.7 | 8.3 | 9.2 | **120** |
| `plot-fitted` | 640 | 1024 | 0.1758 | 2.7 | 8.3 | 9.3 | **120** |
| `court-fitted` | 2560 | 4096 | 0.0879 | 11.8 | 16.6 | 17.0 | **60** |
| `quarter-fitted` | 10240 | 16384 | 0.0439 | 47.0 | 57.7 | 66.6 | **17** |
| `ward-quarter-density` | 550 | 753 | 0.3500 | 3.8 | 8.3 | 9.3 | **120** |
| `ward-fitted` | 40960 | 65536 | 0.0220 | 210.0 | 208.5 | 241.5 | **5** |
| `plot-fitted-96-textures` | 640 | 1024 | 0.1758 | 3.0 | 8.3 | 9.3 | **120** |

### 1440×900 @ dpr 2, 4× CPU throttle — **the verdict column**

| Scenario | Sprites | Ground | Zoom | CPU p50 | Frame p50 | Frame p95 | fps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `plot-full-zoom` | 119 | 111 | 1.0000 | 2.5 | 8.3 | 9.3 | **120** |
| `plot-fitted` | 640 | 1024 | 0.1758 | 11.7 | 15.8 | 17.5 | **63** |
| `court-fitted` | 2560 | 4096 | 0.0879 | 47.4 | 50.0 | 50.9 | **20** |
| `quarter-fitted` | 10240 | 16384 | 0.0439 | 195.4 | 199.8 | 217.6 | **5** |
| `ward-quarter-density` | 550 | 753 | 0.3500 | 14.9 | 16.7 | 17.6 | **60** |
| `ward-fitted` | 40960 | 65536 | 0.0220 | 862.6 | 865.9 | 933.3 | **1** |
| `plot-fitted-96-textures` | 640 | 1024 | 0.1758 | 11.9 | 16.2 | 17.5 | **62** |

### 390×844 @ dpr 3 (a phone), unthrottled

| Scenario | Sprites | Ground | Zoom | CPU p50 | Frame p50 | Frame p95 | fps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `plot-full-zoom` | 51 | 37 | 1.0000 | 0.5 | 8.3 | 9.3 | **120** |
| `plot-fitted` | 640 | 1024 | 0.0476 | 2.9 | 8.3 | 9.2 | **120** |
| `court-fitted` | 2560 | 4096 | 0.0238 | 11.3 | 16.1 | 17.4 | **62** |
| `quarter-fitted` | 10240 | 16384 | 0.0119 | 45.8 | 50.1 | 58.4 | **20** |
| `ward-quarter-density` | 185 | 215 | 0.3500 | 2.3 | 8.3 | 9.2 | **120** |
| `ward-fitted` | 40960 | 65536 | 0.0060 | 199.2 | 200.0 | 209.0 | **5** |
| `plot-fitted-96-textures` | 640 | 1024 | 0.0476 | 2.8 | 8.3 | 9.1 | **120** |

### 390×844 @ dpr 3, 4× CPU throttle

| Scenario | Sprites | Ground | Zoom | CPU p50 | Frame p50 | Frame p95 | fps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `plot-full-zoom` | 51 | 37 | 1.0000 | 1.9 | 8.3 | 9.3 | **120** |
| `plot-fitted` | 640 | 1024 | 0.0476 | 12.4 | 16.2 | 17.6 | **62** |
| `court-fitted` | 2560 | 4096 | 0.0238 | 48.5 | 50.0 | 58.3 | **20** |
| `quarter-fitted` | 10240 | 16384 | 0.0119 | 193.0 | 198.7 | 225.5 | **5** |
| `ward-quarter-density` | 185 | 215 | 0.3500 | 8.5 | 8.4 | 16.6 | **119** |
| `ward-fitted` | 40960 | 65536 | 0.0060 | 831.5 | 835.3 | 917.0 | **1** |
| `plot-fitted-96-textures` | 640 | 1024 | 0.0476 | 11.4 | 10.0 | 17.2 | **100** |

The phone is not slower than the laptop, because the work is draw calls and the two viewports draw
the same scene. It **is** a different experience: at dpr 3 a Plot only fits at zoom 0.048, well
below the floor, so on a phone you pan a Plot rather than seeing it whole.

`ward-quarter-density` is the scenario closest to ordinary play — a continuous ward at the uniform
five-objects-per-eight-tiles density, camera at the zoom a person actually pans at. **120 fps
unthrottled, 60 fps at 4×.** That is the number that says this title is playable in a tab.

---

## Three things that went wrong on the way, because they are the useful part

**1. A "cache" 250 times larger than the thing it cached.** The renderer originally baked ground
into 16×16-tile chunk canvases. In world pixels a 16×16 block is **4096×2048 — 33.5 MB of backing
store per chunk**. A Plot needs four (134 MB); a visible ward needs 256, which is **8.6 GB**. The
first measurement run *did not finish*: it spent three quarters of an hour inside Chromium
allocating and discarding canvases. The cache is gone; ground is one `drawImage` per tile and the
count is bounded by the zoom floor.

**2. Headless Chromium rasterises on the CPU.** The first run that completed reported 47 ms for 230
draw calls — 200 µs each, which is not a number any GPU produces. It was SwiftShader. The harness
now passes `--enable-gpu --use-angle=metal` **and reads the renderer string back out of the page**,
recording it in the JSON. Requesting a flag and assuming it took is the shape of check this estate
keeps having to delete.

**3. A comment that said degradation was disabled, and disabled nothing.** Every fitted scenario in
the first run reported `drawn 0` under a header claiming the numbers were sound. The thresholds are
now `RendererOptions` fields the harness must pass. A knob that must be passed cannot be claimed to
have been passed.

---

## What this measurement does not yet cover

**Continuous ground.** Every scenario places an isolated parcel, so the ground stops at the claim
boundary. In a real ward it does not, and at zoom 0.17 a 1440×900 viewport spans about **2,700
tiles** — over `DRAW_BUDGET` before a single object is drawn. The renderer's degradation handles it
correctly (ground first, sprites dropped), but the *right* answer is a ground cache baked at
**display** scale rather than world scale — the same idea that failed above, done at the size the
screen actually needs, which at 0.17 is about 1 MB per chunk rather than 33.5 MB.

That is the next measurement, and it is stated here rather than implemented on a hunch. The last
time ground caching was designed rather than measured, it cost a 45-minute run.

**A GPU that is not an M1 Pro.** Draw-call cost is CPU-side dispatch, so the 4× throttle is a
reasonable proxy for a slower CPU. It is not a proxy for a slower GPU, and this run has no evidence
about one.

**A real device under thermal load, a real network, and a real ward with real content in it.** None
of those exist yet.
