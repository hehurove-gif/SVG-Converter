import { hexToRgb } from './color.js'

// Detección de degradados: zonas contiguas con colores casi iguales que se ordenan en línea
// (como las bandas de un degradado cuantizado) se unen en una sola zona con degradado lineal.

const SRGB = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function labOf(hex) {
  const { r, g, b } = hexToRgb(hex)
  const R = SRGB(r)
  const G = SRGB(g)
  const B = SRGB(b)
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047)
  const fy = f(0.2126729 * R + 0.7151522 * G + 0.072175 * B)
  const fz = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// Devuelve [{ head, members, from, to, angle }]. `view` trae los colores actuales (fills) y zonas ocultas.
export function detectGradients(seg, view, isFollower, edit) {
  const regions = seg.regions.filter((r) => !view.hidden[r.id] && !isFollower(r, edit) && !edit.grads?.[r.id] && !(edit.joins && edit.joins[r.id]))
  const byId = new Map(regions.map((r) => [r.id, r]))
  const lab = new Map(regions.map((r) => [r.id, labOf(view.fills[r.id])]))

  // Grafo: vecinas con colores parecidos.
  const parent = new Map(regions.map((r) => [r.id, r.id]))
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  for (const r of regions) {
    for (const [nid, shared] of r.nb || []) {
      if (!byId.has(nid) || shared < 4) continue
      if (dist(lab.get(r.id), lab.get(nid)) <= 17) parent.set(find(r.id), find(nid))
    }
  }

  const groups = new Map()
  for (const r of regions) {
    const root = find(r.id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(r)
  }

  const W = seg.width
  const found = []

  for (const members of groups.values()) {
    if (members.length < 3) continue

    const total = members.reduce((s, r) => s + r.area, 0)
    const mean = [0, 0, 0]
    for (const r of members) for (let k = 0; k < 3; k += 1) mean[k] += (lab.get(r.id)[k] * r.area) / total

    // Eje principal del color (iteración de potencias sobre la covarianza).
    const cov = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ]
    for (const r of members) {
      const d = lab.get(r.id).map((v, k) => v - mean[k])
      for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) cov[i][j] += (d[i] * d[j] * r.area) / total
    }
    let u = [1, 0.3, 0.3]
    for (let it = 0; it < 30; it += 1) {
      const n = [0, 1, 2].map((i) => cov[i][0] * u[0] + cov[i][1] * u[1] + cov[i][2] * u[2])
      const len = Math.hypot(...n) || 1
      u = n.map((v) => v / len)
    }

    let residual = 0
    let tMin = Infinity
    let tMax = -Infinity
    let lo = null
    let hi = null
    const t = new Map()
    for (const r of members) {
      const d = lab.get(r.id).map((v, k) => v - mean[k])
      const proj = d[0] * u[0] + d[1] * u[1] + d[2] * u[2]
      const perp = Math.hypot(d[0] - proj * u[0], d[1] - proj * u[1], d[2] - proj * u[2])
      residual += (perp * r.area) / total
      t.set(r.id, proj)
      if (proj < tMin) {
        tMin = proj
        lo = r
      }
      if (proj > tMax) {
        tMax = proj
        hi = r
      }
    }
    if (residual > 7 || tMax - tMin < 12) continue

    // El color debe cambiar de forma ordenada en el espacio: regresión plano t ~ a·x + b·y.
    let sw = 0
    let mx = 0
    let my = 0
    let mt = 0
    const pts = []
    for (const r of members) {
      for (const p of r.samples) {
        const x = p % W
        const y = (p - x) / W
        const w = r.area / r.samples.length
        pts.push([x, y, t.get(r.id), w])
        sw += w
        mx += x * w
        my += y * w
        mt += t.get(r.id) * w
      }
    }
    mx /= sw
    my /= sw
    mt /= sw
    let sxx = 0
    let syy = 0
    let sxy = 0
    let sxt = 0
    let syt = 0
    let stt = 0
    for (const [x, y, tv, w] of pts) {
      sxx += (x - mx) ** 2 * w
      syy += (y - my) ** 2 * w
      sxy += (x - mx) * (y - my) * w
      sxt += (x - mx) * (tv - mt) * w
      syt += (y - my) * (tv - mt) * w
      stt += (tv - mt) ** 2 * w
    }
    const det = sxx * syy - sxy * sxy
    if (!det || !stt) continue
    const a = (sxt * syy - syt * sxy) / det
    const b = (syt * sxx - sxt * sxy) / det
    const r2 = (a * sxt + b * syt) / stt
    if (r2 < 0.55) continue

    const head = members.reduce((best, r) => (r.area > best.area ? r : best), members[0])
    found.push({
      head: head.id,
      members: members.filter((r) => r.id !== head.id).map((r) => r.id),
      from: view.fills[lo.id],
      to: view.fills[hi.id],
      angle: Math.round((((Math.atan2(b, a) * 180) / Math.PI) % 360 + 360) % 360)
    })
  }

  return found
}
