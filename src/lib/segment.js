import { colorDistance, hexToRgb, nearestIndex, rgbToHex } from './color.js'

// ---------- Carga de imágenes ----------

let imageCache = { src: '', promise: null }

export function loadImage(src) {
  if (imageCache.src === src && imageCache.promise) return imageCache.promise

  const promise = new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    image.src = src
  })

  imageCache = { src, promise }
  promise.catch(() => {
    if (imageCache.promise === promise) imageCache = { src: '', promise: null }
  })
  return promise
}

export function readPixels(image, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No se pudo preparar el canvas.')

  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, width, height)
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}

// ---------- Paleta dominante ----------

// Agrupa los píxeles en cubos, promedia el color real de cada cubo y refina
// los centros con unas iteraciones tipo k-means.
function buildPalette(pixels, maxColors) {
  const { data } = pixels
  const buckets = new Map()
  let total = 0

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 30) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 }

    bucket.count += 1
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
    total += 1
  }

  if (!total) return []

  const entries = [...buckets.values()]
    .map((bucket) => ({ count: bucket.count, r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count }))
    .sort((a, b) => b.count - a.count)

  const minDistance = maxColors > 8 ? 30 : 42
  let centers = []

  for (const entry of entries) {
    if (centers.length >= maxColors) break
    if (centers.every((center) => colorDistance(center, entry) >= minDistance)) {
      centers.push({ r: entry.r, g: entry.g, b: entry.b })
    }
  }

  let weights = []

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, w: 0 }))

    for (const entry of entries) {
      const sum = sums[nearestIndex(entry, centers)]
      sum.r += entry.r * entry.count
      sum.g += entry.g * entry.count
      sum.b += entry.b * entry.count
      sum.w += entry.count
    }

    weights = sums.map((sum) => sum.w)
    centers = sums.map((sum, index) => (sum.w ? { r: sum.r / sum.w, g: sum.g / sum.w, b: sum.b / sum.w } : centers[index]))
  }

  let result = centers.map((center, index) => ({ hex: rgbToHex(center.r, center.g, center.b), weight: weights[index] }))
  result.sort((a, b) => b.weight - a.weight)

  const significant = result.filter((item) => item.weight / total >= 0.003)
  if (significant.length >= 2) result = significant

  return [...new Set(result.map((item) => item.hex))]
}

// Elimina líneas de 1px (bordes suavizados entre colores) sin tocar trazos gruesos.
function despeckle(label, width, height, k) {
  const out = label.slice()
  const counts = new Int16Array(k)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      const own = label[i]
      if (own < 0) continue

      counts.fill(0)
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const l = label[ny * width + nx]
          if (l >= 0) counts[l] += 1
        }
      }

      let best = own
      let bestCount = counts[own]
      for (let c = 0; c < k; c += 1) {
        if (counts[c] > bestCount) {
          bestCount = counts[c]
          best = c
        }
      }

      if (best !== own && counts[own] <= 3 && bestCount >= 5) out[i] = best
    }
  }

  return out
}

// ---------- Trazado de contornos ----------

function pointLineDistance(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSq = dx * dx + dy * dy
  if (!lengthSq) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function rdp(points, epsilon) {
  if (points.length < 3) return points

  const first = points[0]
  const last = points[points.length - 1]
  let index = -1
  let maxDistance = 0

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = pointLineDistance(points[i], first, last)
    if (distance > maxDistance) {
      maxDistance = distance
      index = i
    }
  }

  if (maxDistance <= epsilon) return [first, last]

  const left = rdp(points.slice(0, index + 1), epsilon)
  const right = rdp(points.slice(index), epsilon)
  return left.slice(0, -1).concat(right)
}

function simplifyLoop(points, epsilon) {
  if (points.length <= 4 || epsilon <= 0) return points

  let far = 0
  let farDistance = -1
  for (let i = 1; i < points.length; i += 1) {
    const d = (points[i][0] - points[0][0]) ** 2 + (points[i][1] - points[0][1]) ** 2
    if (d > farDistance) {
      farDistance = d
      far = i
    }
  }

  const a = rdp(points.slice(0, far + 1), epsilon)
  const b = rdp(points.slice(far).concat([points[0]]), epsilon)
  return a.slice(0, -1).concat(b.slice(0, -1))
}

// Corta las esquinas una distancia máxima `cap` (las rectas largas se mantienen rectas).
function softenCorners(points, cap) {
  if (cap <= 0 || points.length < 3) return points

  const out = []
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    const length = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (!length) continue

    const cut = Math.min(length * 0.3, cap)
    const t = cut / length
    out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    out.push([q[0] - (q[0] - p[0]) * t, q[1] - (q[1] - p[1]) * t])
  }

  return out
}

function compressCollinear(points) {
  const out = []
  const n = points.length

  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n]
    const cur = points[i]
    const next = points[(i + 1) % n]
    const cross = (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0])
    if (cross !== 0) out.push(cur)
  }

  return out
}

const fmt = (value) => String(Math.round(value * 10) / 10)

// Devuelve el path SVG (con huecos, fill-rule evenodd) que rodea exactamente los píxeles de una zona.
function traceRegion(list, id, regionId, W, H, epsilon, cap) {
  const sx = []
  const sy = []
  const ex = []
  const ey = []
  const outs = new Map()
  const stride = W + 1

  const add = (x1, y1, x2, y2) => {
    const e = sx.length
    sx.push(x1)
    sy.push(y1)
    ex.push(x2)
    ey.push(y2)
    const key = y1 * stride + x1
    const bucket = outs.get(key)
    if (bucket) bucket.push(e)
    else outs.set(key, [e])
  }

  for (const p of list) {
    const x = p % W
    const y = (p - x) / W
    if (y === 0 || regionId[p - W] !== id) add(x, y, x + 1, y)
    if (x === W - 1 || regionId[p + 1] !== id) add(x + 1, y, x + 1, y + 1)
    if (y === H - 1 || regionId[p + W] !== id) add(x + 1, y + 1, x, y + 1)
    if (x === 0 || regionId[p - 1] !== id) add(x, y + 1, x, y)
  }

  const used = new Uint8Array(sx.length)
  const parts = []

  for (let start = 0; start < sx.length; start += 1) {
    if (used[start]) continue

    const loop = []
    let e = start

    for (let guard = 0; guard < sx.length + 2; guard += 1) {
      used[e] = 1
      loop.push([sx[e], sy[e]])

      const candidates = (outs.get(ey[e] * stride + ex[e]) || []).filter((c) => !used[c] || c === start)
      if (!candidates.length) break

      let next = candidates[0]
      if (candidates.length > 1) {
        const dx = ex[e] - sx[e]
        const dy = ey[e] - sy[e]
        let bestCross = -Infinity
        for (const c of candidates) {
          const cross = dx * (ey[c] - sy[c]) - dy * (ex[c] - sx[c])
          if (cross > bestCross) {
            bestCross = cross
            next = c
          }
        }
      }

      if (next === start) break
      e = next
    }

    let points = compressCollinear(loop)
    if (points.length < 3) continue

    points = simplifyLoop(points, epsilon)
    points = softenCorners(points, cap)
    if (points.length < 3) continue

    parts.push(`M${points.map((point) => `${fmt(point[0])} ${fmt(point[1])}`).join('L')}Z`)
  }

  return parts.join('')
}

// ---------- Segmentación principal ----------

const DETAIL_AREA = [0.004, 0.002, 0.001, 0.0004, 0.00012]
const DETAIL_PASSES = [2, 1, 1, 1, 0]
const SMOOTH_EPSILON = [0, 0.7, 1, 1.4]
const SMOOTH_CAP = [0, 0, 1.5, 2.6]

// Divide la imagen en zonas: cada zona es un grupo conectado de píxeles del mismo color de paleta.
export function segmentImage(image, { colors = 8, detail = 3, smooth = 2, maxSize = 480 } = {}) {
  const pixels = readPixels(image, maxSize)
  const { width: W, height: H, data } = pixels
  const N = W * H
  const palette = buildPalette(pixels, colors)

  if (!palette.length) {
    return { width: W, height: H, palette: [], regions: [], transparentRatio: 1, borderOpaque: 0 }
  }

  const centers = palette.map(hexToRgb)
  let label = new Int16Array(N).fill(-1)
  let transparent = 0

  for (let i = 0; i < N; i += 1) {
    if (data[i * 4 + 3] < 30) {
      transparent += 1
      continue
    }
    label[i] = nearestIndex({ r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] }, centers)
  }

  for (let pass = 0; pass < DETAIL_PASSES[detail - 1]; pass += 1) {
    label = despeckle(label, W, H, palette.length)
  }

  // Componentes conectados (4 vecinos) por color de paleta.
  const regionId = new Int32Array(N).fill(-1)
  const regions = []
  const stack = new Int32Array(N)

  for (let s = 0; s < N; s += 1) {
    if (label[s] < 0 || regionId[s] >= 0) continue

    const id = regions.length
    const lab = label[s]
    const list = []
    let sp = 0
    stack[sp++] = s
    regionId[s] = id

    while (sp) {
      const p = stack[--sp]
      list.push(p)
      const x = p % W

      if (x > 0 && regionId[p - 1] < 0 && label[p - 1] === lab) {
        regionId[p - 1] = id
        stack[sp++] = p - 1
      }
      if (x < W - 1 && regionId[p + 1] < 0 && label[p + 1] === lab) {
        regionId[p + 1] = id
        stack[sp++] = p + 1
      }
      if (p >= W && regionId[p - W] < 0 && label[p - W] === lab) {
        regionId[p - W] = id
        stack[sp++] = p - W
      }
      if (p + W < N && regionId[p + W] < 0 && label[p + W] === lab) {
        regionId[p + W] = id
        stack[sp++] = p + W
      }
    }

    regions.push({ id, label: lab, list, alive: true })
  }

  // Funde las zonas diminutas con la vecina con la que comparten más borde.
  const minPixels = Math.max(4, Math.round(N * DETAIL_AREA[detail - 1]))
  const small = regions.filter((r) => r.list.length < minPixels).sort((a, b) => a.list.length - b.list.length)

  for (const r of small) {
    if (!r.alive || r.list.length >= minPixels) continue

    const counts = new Map()
    const count = (q) => {
      const rid = regionId[q]
      if (rid >= 0 && rid !== r.id) counts.set(rid, (counts.get(rid) || 0) + 1)
    }

    for (const p of r.list) {
      const x = p % W
      if (x > 0) count(p - 1)
      if (x < W - 1) count(p + 1)
      if (p >= W) count(p - W)
      if (p + W < N) count(p + W)
    }

    if (!counts.size) continue

    let best = -1
    let bestCount = -1
    for (const [rid, c] of counts) {
      if (c > bestCount) {
        bestCount = c
        best = rid
      }
    }

    const target = regions[best]
    for (const p of r.list) {
      regionId[p] = best
      target.list.push(p)
    }
    r.alive = false
    r.list = []
  }

  const epsilon = SMOOTH_EPSILON[smooth]
  const cap = SMOOTH_CAP[smooth]
  const borderPixels = new Map()
  let borderOpaque = 0

  for (let x = 0; x < W; x += 1) {
    for (const p of [x, (H - 1) * W + x]) {
      if (regionId[p] >= 0) {
        borderPixels.set(regionId[p], (borderPixels.get(regionId[p]) || 0) + 1)
        borderOpaque += 1
      }
    }
  }
  for (let y = 1; y < H - 1; y += 1) {
    for (const p of [y * W, y * W + W - 1]) {
      if (regionId[p] >= 0) {
        borderPixels.set(regionId[p], (borderPixels.get(regionId[p]) || 0) + 1)
        borderOpaque += 1
      }
    }
  }

  const output = regions
    .filter((r) => r.alive && r.list.length)
    .map((r) => ({
      id: r.id,
      label: r.label,
      area: r.list.length,
      borderPx: borderPixels.get(r.id) || 0,
      path: traceRegion(r.list, r.id, regionId, W, H, epsilon, cap)
    }))
    .filter((r) => r.path)
    .sort((a, b) => b.area - a.area)

  return { width: W, height: H, palette, regions: output, transparentRatio: transparent / N, borderOpaque }
}

// Zonas que forman el fondo: el color que más rodea los bordes de la imagen.
export function detectBackground(seg) {
  if (!seg || !seg.borderOpaque) return []

  const weights = new Map()
  for (const r of seg.regions) {
    if (r.borderPx > 0) weights.set(r.label, (weights.get(r.label) || 0) + r.borderPx)
  }

  let best = -1
  let bestWeight = 0
  for (const [lab, weight] of weights) {
    if (weight > bestWeight) {
      bestWeight = weight
      best = lab
    }
  }

  if (best < 0 || bestWeight / seg.borderOpaque < 0.25) return []
  return seg.regions.filter((r) => r.label === best && r.borderPx > 0).map((r) => r.id)
}

// Genera el archivo SVG final con los colores editados y sin las zonas eliminadas.
export function buildSvg(seg, fills, hidden, size) {
  const outW = size?.width || seg.width
  const outH = size?.height || seg.height
  const paths = seg.regions
    .filter((r) => !hidden[r.id])
    .map((r) => {
      const fill = fills[r.id]
      return `<path d="${r.path}" fill="${fill}" stroke="${fill}"/>`
    })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${seg.width} ${seg.height}" width="${outW}" height="${outH}"><g fill-rule="evenodd" stroke-width="0.6" stroke-linejoin="round">${paths.join('')}</g></svg>`
}
