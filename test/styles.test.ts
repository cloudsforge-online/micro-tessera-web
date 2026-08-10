/**
 * WHAT src/styles.css IS ALLOWED TO CONTAIN.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE HEADER OF src/styles.css HAS CLAIMED SINCE IT WAS WRITTEN THAT `test/tokens.test.ts` PROVES
 * ITS TOKENS AND ITS CLASSES. NO SUCH FILE HAS EVER EXISTED HERE. This is that file, under the
 * name it actually has, plus the rule that closes the defect the claim was hiding.
 *
 * Three properties, each with a failure mode that is silent:
 *
 *   1. AN UNDEFINED CUSTOM PROPERTY INVALIDATES ITS WHOLE DECLARATION. `var(--cf-nope)` does not
 *      fall back to something sensible — `border: 1px solid var(--cf-nope)` removes the border, at
 *      computed-value time, in a file that reads correctly and a browser that reports nothing.
 *      `micro-mint-web/src/styles.css` references ten properties tokens.css does not declare,
 *      across 72 declarations, three of them with an undefined FALLBACK.
 *
 *   2. A CLASS THE DESIGN SYSTEM DOES NOT DECLARE FAILS EXACTLY AS QUIETLY. `.cf-btn--primary`
 *      does not exist; `.cf-btn--ember` is the one solid call to action. A control asking for the
 *      first renders with the browser's own chrome on a dark substrate and nothing reports it.
 *      `micro-explorer-web/test/tokens.test.ts` is where this half of the check comes from.
 *
 *   3. A LITERAL LENGTH CANNOT FOLLOW THE SCALE. `--cf-text-md` was raised from 0.82rem to 1rem
 *      when the body step was fixed — the note is beside it in tokens.css — and every literal in
 *      the estate stayed where it was. Measured 2026-08-10, the "Tessera's own screens" half of
 *      src/styles.css spent fifteen literal `font-size`s against nineteen tokenised ones, so this
 *      client's own screens were set at 11.2–17.6px underneath chrome the design system sets at
 *      14–16px. THE LAST TEST IN THIS FILE IS THE ONE THAT KEEPS THE NEXT ONE OUT.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/**
 * The stylesheet with its comments stripped.
 *
 * The same lesson as the nginx grep and `withoutComments` in test/content.test.ts: the header of
 * src/styles.css QUOTES the literals and the invented class names it forbids, in order to explain
 * why they are forbidden. A scan over the raw text matches the explanation and fails a correct
 * file — a check that can only be satisfied by deleting its own rationale.
 */
const CSS = readFileSync(at('src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * The design system's two stylesheets, resolved the way the bundle resolves them.
 *
 * Through the export map rather than by walking to a sibling checkout: these are the specifiers
 * src/main.tsx imports, so this reads the bytes that will be served. micro-ui commits `dist/`
 * deliberately — no consumer builds it — and its own `src/dist.test.ts` recompiles on every run
 * and fails if a committed byte differs from the source, so this cannot be a stale copy.
 */
const require_ = createRequire(import.meta.url)
const TOKENS = readFileSync(require_.resolve('@cloudsforge/ui/tokens.css'), 'utf8')
const UI = readFileSync(require_.resolve('@cloudsforge/ui/ui.css'), 'utf8')

/** Every `--cf-*` tokens.css defines. */
const defined = new Set([...TOKENS.matchAll(/^\s*(--cf-[a-z0-9-]+)\s*:/gm)].map((m) => m[1] ?? ''))

/** Every `cf-` class ui.css declares a rule for. */
const declared = new Set([...UI.matchAll(/\.(cf-[a-z0-9_-]+)/g)].map((m) => m[1] ?? ''))

/** Every `--cf-*` this stylesheet READS. */
const referenced = [
  ...new Set([...CSS.matchAll(/var\((--cf-[a-z0-9-]+)/g)].map((m) => m[1] ?? '')),
].sort()

/** Every `cf-` class this bundle puts in a `className` or in a selector of its own. */
function classesUsed(): string[] {
  const found = new Set<string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (extname(entry.name) === '.tsx' || extname(entry.name) === '.ts') {
        // Comments off first, and for the same reason CSS has them stripped above: shell.tsx's
        // own note about the skip link says the landmark id is `cf-main` now, in backticks, and a
        // scan that reads prose reports a class the design system does not declare and is right
        // about nothing. A guard that fires on its own explanation trains people to delete the
        // explanation. `//` is only treated as a comment when it is not the `://` of a URL.
        const src = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
        for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
          for (const cls of `${m[1] ?? ''} ${m[2] ?? ''}`.split(/[^A-Za-z0-9_-]+/)) {
            if (cls.startsWith('cf-')) found.add(cls)
          }
        }
        // …and every backtick template anywhere in the file, because react-router's `NavLink`
        // takes `className` as a FUNCTION of the active state — `className={({ isActive }) =>
        // `cf-subnav__link${…}`}` — and the literal is nowhere near the `className=` that leads to
        // it. A scan anchored on `className=` misses exactly the classes that carry current-state,
        // which are the ones a rename in the design system would strand.
        for (const m of src.matchAll(/`([^`]*)`/g)) {
          // Split on anything a class name cannot contain — not just whitespace and `${}`. The
          // interpolated branch reads `? ' cf-subnav__link--current' : ''`, so a looser split
          // leaves the quote glued to the name and the class goes unseen.
          for (const cls of (m[1] ?? '').split(/[^A-Za-z0-9_-]+/)) {
            if (cls.startsWith('cf-')) found.add(cls)
          }
        }
      }
    }
  }
  walk(at('src'))
  // …and any `cf-` class this stylesheet tries to restyle, which is the same mistake with the
  // arrow pointing the other way.
  for (const m of CSS.matchAll(/\.(cf-[a-z0-9_-]+)/g)) found.add(m[1] ?? '')
  return [...found].sort()
}

describe('the design system this file is checked against is really there', () => {
  it('reads a tokens file with tokens in it', () => {
    assert.ok(defined.size >= 60, `found ${defined.size} definitions in tokens.css`)
  })

  it('reads a stylesheet with classes in it', () => {
    assert.ok(declared.size >= 20, `found ${declared.size} cf- classes in ui.css`)
  })

  it('and this stylesheet really does read a fair number of tokens', () => {
    // So that nothing below can pass on an empty match, which is how a check written against a
    // file that moved goes quiet instead of red.
    assert.ok(referenced.length >= 20, `found ${referenced.length} token references`)
  })
})

describe('the stylesheet names only tokens and classes that exist', () => {
  it('every custom property it reads is declared by the design system', () => {
    const missing = referenced.filter((name) => !defined.has(name))
    assert.deepEqual(
      missing,
      [],
      `src/styles.css reads ${missing.join(', ')}, which tokens.css does not define. ` +
        'An undefined custom property invalidates the whole declaration.',
    )
  })

  it('every cf- class this bundle names is declared by the design system', () => {
    const used = classesUsed()
    // Four: `.cf-btn` and `.cf-num` in src/components/states.tsx, and the two the sub-nav's links
    // carry in src/components/shell.tsx. The header of src/styles.css listed seven —
    // `.cf-btn--ember`, `.cf-input`, `.cf-input--mono`, `.cf-select` and `.cf-sr` besides — and
    // this bundle names none of those five anywhere. The list was aspirational; this is what the
    // bundle actually does.
    assert.ok(used.length >= 4, `found ${used.length} cf- classes, which is too few to be right`)
    for (const expected of ['cf-btn', 'cf-num', 'cf-subnav__link', 'cf-subnav__link--current']) {
      assert.ok(used.includes(expected), `.${expected} is no longer used; this list is out of date`)
    }
    const missing = used.filter((cls) => !declared.has(cls))
    assert.deepEqual(
      missing,
      [],
      `this bundle uses ${missing.join(', ')}, which ui.css does not declare. ` +
        'A class the design system does not have fails as silently as a token it does not have.',
    )
  })

  it('uses no var() fallback, because a fallback is where a literal hides', () => {
    const fallbacks = [...CSS.matchAll(/var\(--cf-[a-z0-9-]+\s*,/g)].map((m) => m[0])
    assert.deepEqual(fallbacks, [], `src/styles.css uses a var() fallback: ${fallbacks.join(', ')}`)
  })
})

describe('the strip of sections is the design system\u2019s, and no local copy survives', () => {
  /*
   * PINNED IN BOTH DIRECTIONS, after the pattern explorer-web/test/tokens.test.ts set for a class
   * that moved into the design system. Asserting only that `.cf-subnav*` exists would pass with
   * `.tw-nav*` still sitting in this file, shadowing it or fighting it depending on order; and
   * asserting only that `.tw-nav*` is gone would pass if the shared classes were renamed upstream
   * and this surface rendered a strip with no rules at all. Both halves, or neither is worth much.
   */
  it('ui.css declares every class the shared strip needs', () => {
    for (const cls of ['cf-subnav', 'cf-subnav__inner', 'cf-subnav__link', 'cf-subnav__link--current']) {
      assert.ok(declared.has(cls), `@cloudsforge/ui no longer declares .${cls}`)
    }
  })

  it('and it is the shared strip that scrolls, rather than breaking its labels', () => {
    // The defect the shared component exists to close, read off the bytes this bundle serves
    // rather than assumed: nine of the ten copies in the estate had neither of these.
    const rule = /\.cf-subnav__inner\s*\{([^}]*)\}/.exec(UI)?.[1] ?? ''
    assert.match(rule, /overflow-x:\s*auto/)
    assert.match(/\.cf-subnav__link\s*\{([^}]*)\}/.exec(UI)?.[1] ?? '', /white-space:\s*nowrap/)
  })

  it('no .tw-nav rule is left behind in this stylesheet', () => {
    const survivors = [...new Set([...CSS.matchAll(/\.tw-nav[a-z0-9_-]*/g)].map((m) => m[0]))]
    assert.deepEqual(
      survivors,
      [],
      `src/styles.css still declares ${survivors.join(', ')}. The strip is SubNav from ` +
        '@cloudsforge/ui now; a local copy beside it is the drift this change removed.',
    )
  })

  it('and this stylesheet lays nothing of its own back over the shared strip', () => {
    /*
     * NOT a blanket ban on `is-active`: `.tw-map__lane.is-active` and `.tw-city-tab.is-active` are
     * this client's own components and keep their own modifier name. What may not come back is a
     * LOCAL RULE ON A SHARED SELECTOR — `.cf-subnav__link { … }` here would fight ui.css from a
     * second file with no note explaining why, which is how the ten copies started. The contrast
     * argument the deleted `.tw-nav__link.is-active` carried is answered by the shared rule itself
     * (`color: var(--cf-fg)`, full-strength foreground, above the 4.5:1 text step on either
     * scheme); see the note where the block used to be. If it ever stops being answered, change
     * ui.css and this assertion together, rather than quietly overriding here.
     */
    const local = [...new Set([...CSS.matchAll(/\.cf-subnav[a-z0-9_-]*/g)].map((m) => m[0]))]
    assert.deepEqual(
      local,
      [],
      `src/styles.css declares a rule on ${local.join(', ')}, which the design system owns.`,
    )
  })
})

describe('the type scale is used, and no literal font-size gets back in', () => {
  /**
   * The two `font-size` declarations that are allowed not to be a token, by the selector that
   * carries them.
   *
   * Both are `0.85em` on a span that sits INSIDE running text whose size varies with its host:
   * `.tw-muted` inside a percentage on the wards screen and inside an option label on land,
   * `.tw-mono` inside table cells and inside `.tw-wallet__value`, which is `--cf-text-lg`. `em`
   * means "85% of whatever this is in", which is the point — for `.tw-mono` it is the standard
   * optical correction for monospace, whose glyphs read larger than a sans at the same nominal
   * size. A step of the scale would fix each to one context and deform it in every other.
   *
   * They are enumerated rather than waved through by unit, so a THIRD `em` size has to be argued
   * for here rather than slipped in behind these two.
   */
  const RELATIVE = ['.tw-muted', '.tw-mono']

  /** Every `font-size` declaration in the file, with the selector of the rule it sits in. */
  function fontSizes(): Array<{ selector: string; value: string }> {
    const out: Array<{ selector: string; value: string }> = []
    for (const rule of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = (rule[1] ?? '').trim().replace(/\s+/g, ' ')
      for (const decl of (rule[2] ?? '').matchAll(/font-size\s*:\s*([^;}]+)/g)) {
        out.push({ selector, value: (decl[1] ?? '').trim() })
      }
    }
    return out
  }

  it('finds a real number of them, so this cannot pass on an empty match', () => {
    assert.ok(fontSizes().length >= 30, `found ${fontSizes().length} font-size declarations`)
  })

  it('spends no literal font-size', () => {
    /*
     * THE RULE THAT WOULD HAVE CAUGHT THE DEFECT, AND THE ONE THAT KEEPS THE NEXT ONE OUT.
     *
     * Measured 2026-08-10: fifteen literal `font-size` declarations in the second half of this
     * stylesheet against nineteen tokenised ones in the first — 0.7rem to 1.1rem, so 11.2px to
     * 17.6px, none of which moved when `--cf-text-md` went from 0.82rem to 1rem. A literal cannot
     * follow the scale; that is the whole of it.
     */
    const literals = fontSizes().filter(
      (d) => !d.value.includes('var(--cf-text') && !RELATIVE.includes(d.selector),
    )
    assert.deepEqual(
      literals.map((d) => `${d.selector} { font-size: ${d.value} }`),
      [],
      'src/styles.css sets a font-size the type scale cannot reach. Use the nearest --cf-text step.',
    )
  })

  it('the two relative sizes are still exactly the two that are argued for', () => {
    // Pinned in the other direction as well: if one of them becomes a token, or is deleted with
    // its class, this test says so rather than quietly permitting a selector that no longer exists.
    const relative = fontSizes()
      .filter((d) => !d.value.includes('var(--cf-text'))
      .map((d) => d.selector)
      .sort()
    assert.deepEqual(relative, [...RELATIVE].sort())
  })

  it('names only steps that exist, and invents none', () => {
    const steps = new Set(
      [...CSS.matchAll(/font-size:\s*var\((--cf-text-[a-z0-9]+)\)/g)].map((m) => m[1] ?? ''),
    )
    for (const step of steps) {
      assert.ok(defined.has(step), `src/styles.css names ${step}, which the type scale does not have`)
    }
    assert.ok(steps.size >= 4, `found ${steps.size} distinct steps, which is too few to be right`)
  })
})

describe('the spacing scale is used too, which is the other half of the same drift', () => {
  /**
   * The lengths that are LAYOUT rather than rhythm, and are left as literals on purpose. Each is
   * also commented in src/styles.css; this list is what makes adding a fourth deliberate.
   *
   * `.tw-visually-hidden`'s `margin: -1px` is the clip-rect idiom — a 1px box pulled 1px out of
   * flow — and the scale has no negative step. Tokenising it would break the technique, not
   * tokenise it.
   */
  it('spends no literal gap, margin or padding outside the clip-rect idiom', () => {
    const properties =
      '(?:gap|row-gap|column-gap|margin|padding)(?:-(?:top|bottom|left|right|inline|block|inline-start|inline-end|block-start|block-end))?'
    const offenders: string[] = []
    for (const rule of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = (rule[1] ?? '').trim().replace(/\s+/g, ' ')
      if (selector === '.tw-visually-hidden') continue
      for (const decl of (rule[2] ?? '').matchAll(new RegExp(`(${properties})\\s*:\\s*([^;}]+)`, 'g'))) {
        const value = (decl[2] ?? '').trim()
        if (value.includes('var(--cf-space')) continue
        // `0`, `auto` and `inherit` are not lengths the scale has an opinion about.
        if (!/-?\d*\.?\d+(rem|em|px|ch|vh|vw|%)/.test(value)) continue
        offenders.push(`${selector} { ${decl[1]}: ${value} }`)
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'src/styles.css sets a length the spacing scale cannot reach. Use the nearest --cf-space step.',
    )
  })
})
