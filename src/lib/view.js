import { adjustHex, mixHex } from './color.js'

// Estado base de edición de una vectorización.
export function initialEdit(seg) {
  const fills = {}
  for (const region of seg.regions) fills[region.id] = seg.palette[region.label]
  return { fills, hidden: {}, pinned: {}, grads: {}, adjust: { h: 0, s: 0, l: 0 } }
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

  const adjust = edit.adjust || { h: 0, s: 0, l: 0 }
  const grads = {}
  for (const id of Object.keys(edit.grads || {})) {
    const g = edit.grads[id]
    if (fills[id] && !hidden[id]) grads[id] = { from: adjustHex(fills[id], adjust), to: adjustHex(g.to, adjust), angle: g.angle }
  }
  if (adjust.h || adjust.s || adjust.l) {
    for (const id of Object.keys(fills)) fills[id] = adjustHex(fills[id], adjust)
  }

  return { fills, hidden, grads }
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
