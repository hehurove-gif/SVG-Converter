import { adjustHex, mixHex } from './color.js'

// Estado base de edición de una vectorización.
export function initialEdit(seg) {
  const fills = {}
  for (const region of seg.regions) fills[region.id] = seg.palette[region.label]
  return { fills, hidden: {}, pinned: {}, grads: {}, joins: {}, adjust: { h: 0, s: 0, l: 0 } }
}

// Una franja de mezcla "sigue" a sus vecinas salvo que el usuario la haya fijado a mano.
export const isFollower = (region, edit) => Boolean(region.mix && !edit.pinned?.[region.id])

// Colores finales por zona: franjas de mezcla seguidoras, degradados y ajuste global.
export function resolveView(seg, edit) {
  const fills = { ...edit.fills }
  const hidden = { ...edit.hidden }

  for (const region of seg.regions) {
    if (!isFollower(region, edit) || hidden[region.id]) continue
    const { a, b, t } = region.mix
    if (hidden[a] && hidden[b]) hidden[region.id] = true
    else if (hidden[a]) fills[region.id] = fills[b]
    else if (hidden[b]) fills[region.id] = fills[a]
    else fills[region.id] = mixHex(fills[a], fills[b], t)
  }

  // Zonas unidas (degradados detectados): la cabeza dibuja todas; las demás no se dibujan.
  const extra = {}
  const boxes = {}
  const byId = new Map(seg.regions.map((r) => [r.id, r]))
  for (const head of Object.keys(edit.joins || {})) {
    const base = byId.get(Number(head))
    if (!base) continue
    for (const m of edit.joins[head]) hidden[m] = true
    if (hidden[head]) continue
    const members = edit.joins[head].map((m) => byId.get(m)?.path).filter(Boolean)
    extra[head] = members
    boxes[head] = pathBox([base.path, ...members])
  }

  const adjust = edit.adjust || { h: 0, s: 0, l: 0 }
  const grads = {}
  for (const id of Object.keys(edit.grads || {})) {
    const g = edit.grads[id]
    if (fills[id] && !hidden[id]) grads[id] = { from: adjustHex(fills[id], adjust), to: adjustHex(g.to, adjust), angle: g.angle, box: boxes[id] || null }
  }
  if (adjust.h || adjust.s || adjust.l) {
    for (const id of Object.keys(fills)) fills[id] = adjustHex(fills[id], adjust)
  }

  return { fills, hidden, grads, extra }
}

// Caja que encierra todas las coordenadas absolutas de uno o varios trazados SVG (M/L/Q con pares x y).
export function pathBox(paths) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const path of paths) {
    const nums = path.match(/-?\d+(?:\.\d+)?/g) || []
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = Number(nums[i])
      const y = Number(nums[i + 1])
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null
}

// Fija el ajuste global dentro de los colores (para poder seguir editando colores sueltos sin desfases).
export function bake(edit) {
  const adjust = edit.adjust
  if (!adjust || (!adjust.h && !adjust.s && !adjust.l)) return edit
  const fills = {}
  for (const id of Object.keys(edit.fills)) fills[id] = adjustHex(edit.fills[id], adjust)
  const grads = {}
  for (const id of Object.keys(edit.grads || {})) grads[id] = { ...edit.grads[id], to: adjustHex(edit.grads[id].to, adjust) }
  return { ...edit, fills, grads, adjust: { h: 0, s: 0, l: 0 } }
}
