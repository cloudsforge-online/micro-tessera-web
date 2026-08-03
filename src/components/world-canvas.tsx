/**
 * The canvas the world is drawn on, and the React boundary around it.
 *
 * ── React does not own a pixel of this ────────────────────────────────────────────────────────
 *
 * The tree renders ONE `<canvas>` and never re-renders it. Camera changes, sprite arrivals and
 * scene changes are pushed into the renderer through a ref and drawn on the next animation frame;
 * none of them is React state, because a pan gesture at 60 fps through `useState` is 60 reconciles
 * a second of a tree whose output is a single element that did not change.
 *
 * What IS React state is everything a person can read: the frame statistics, the degraded flag,
 * and the list of sprites that would not load. Those change at human speed and belong in the
 * document, where a test can address them by role and name — which is the whole reason the
 * diagnostics are rendered as text rather than painted into the canvas. A canvas is opaque to a
 * screen reader and to `happy-dom` alike, and a client whose only output was pixels would be a
 * client with no testable surface at all.
 *
 * ── The canvas has an accessible name and a text alternative ──────────────────────────────────
 *
 * `role="img"` with an `aria-label` that says what is on it, plus a live region beside it that
 * says how many objects are in view. That is not sufficient — a 2D world is not accessible to a
 * screen reader and this client does not pretend otherwise — but "canvas with no name" is the
 * version that tells a non-visual user nothing at all, and the parcel and object data is all
 * available as text on the other screens.
 */
import { useEffect, useRef, useState } from 'react'
import { WorldRenderer, type FrameStats } from '../render/renderer.ts'
import { zoomToFit, type Camera } from '../render/iso.ts'
import type { Scene } from '../render/scene.ts'
import type { SpriteCache } from '../lib/sprites.ts'

export interface WorldCanvasProps {
  readonly scene: Scene
  readonly sprites: SpriteCache
  /** Tiles across the thing being looked at, used for the initial fit. */
  readonly side: number
  /** Where the camera starts, in tile coordinates. */
  readonly centre: { tx: number; ty: number }
  /** An accessible name for the canvas: what place this is. */
  readonly label: string
}

const MIN_ZOOM = 0.02
const MAX_ZOOM = 2

export function WorldCanvas({ scene, sprites, side, centre, label }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<WorldRenderer | null>(null)
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 })
  const [stats, setStats] = useState<FrameStats | null>(null)
  const [missing, setMissing] = useState<readonly string[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const parent = canvas.parentElement
    const width = parent?.clientWidth || 960
    const height = parent?.clientHeight || 540
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const renderer = new WorldRenderer(ctx, {
      makeCanvas: (w, h) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        return c
      },
      dpr,
    })
    renderer.setScene(scene)
    rendererRef.current = renderer

    // Start fitted to the thing being looked at, clamped: a 16×16 Homestead fitted to a desktop
    // viewport would be zoom 3.5, and a sprite authored at 512 upscaled to 1800 is a blur.
    cameraRef.current = {
      x: (centre.tx - centre.ty) * 128,
      y: (centre.tx + centre.ty) * 64,
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomToFit(side, { width, height }))),
    }

    let raf = 0
    let live = true
    const loop = (): void => {
      if (!live) return
      const frame = renderer.draw(cameraRef.current, { width, height }, sprites)
      // Only when something a person can see changed. Setting state every frame would put a React
      // render in the animation loop, which is the exact cost this component is arranged to avoid.
      setStats((prev) =>
        prev === null ||
        prev.sprites !== frame.sprites ||
        prev.visible !== frame.visible ||
        prev.degraded !== frame.degraded
          ? frame
          : prev,
      )
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    /* -- pan and zoom, on the DOM rather than through React ---------------------------------- */

    let dragging = false
    let lastX = 0
    let lastY = 0
    const down = (e: PointerEvent): void => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent): void => {
      if (!dragging) return
      const camera = cameraRef.current
      cameraRef.current = {
        ...camera,
        x: camera.x - (e.clientX - lastX) / camera.zoom,
        y: camera.y - (e.clientY - lastY) / camera.zoom,
      }
      lastX = e.clientX
      lastY = e.clientY
    }
    const up = (e: PointerEvent): void => {
      dragging = false
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    }
    const wheel = (e: WheelEvent): void => {
      e.preventDefault()
      const camera = cameraRef.current
      const factor = Math.exp(-e.deltaY / 400)
      cameraRef.current = {
        ...camera,
        zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor)),
      }
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    // `passive: false` because the handler calls preventDefault: without it the browser scrolls
    // the page as well as zooming the world, and the page under a full-height canvas has nowhere
    // to scroll to, so the gesture reads as "sometimes nothing happens".
    canvas.addEventListener('wheel', wheel, { passive: false })

    return () => {
      live = false
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('wheel', wheel)
      rendererRef.current = null
    }
  }, [scene, sprites, side, centre.tx, centre.ty])

  useEffect(() => {
    setMissing(sprites.missing)
  }, [sprites, stats])

  return (
    <div className="tw-world">
      <div className="tw-world__stage">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className="tw-world__canvas"
          data-testid="world-canvas"
        />
      </div>

      {/*
        A live region, not a decoration. It is the ONLY textual account of what the canvas is
        showing, so it is what a `happy-dom` test and a screen reader both read — and it is why
        this component can be tested at all without a GPU.
      */}
      <p className="tw-world__stats" role="status">
        {stats === null
          ? 'The world has not drawn a frame yet.'
          : stats.degraded
            ? `${stats.visible} objects in view — too many to draw at this zoom, so the ground is ` +
              `shown without them. Zoom in to see what is standing here.`
            : `${stats.sprites} of ${stats.visible} objects in view.`}
      </p>

      {missing.length > 0 && (
        // An absence with a name. There is no fallback sprite by design (see lib/sprites.ts), so
        // the alternative to saying this is a hole in the world nobody can account for.
        <p className="tw-world__missing" role="alert">
          {missing.length} sprite{missing.length === 1 ? '' : 's'} could not be loaded:{' '}
          {missing.slice(0, 3).join(', ')}
          {missing.length > 3 ? ` and ${missing.length - 3} more` : ''}. Those objects are not
          drawn — nothing has been substituted for them.
        </p>
      )}
    </div>
  )
}
