// Motor de vectorización por zonas.
//
// 1. Se escala la imagen (también hacia arriba, para obtener bordes con precisión sub-píxel).
// 2. La paleta se calcula SOLO con píxeles "planos" (zonas de color puro). Los píxeles de
//    borde suavizado son mezclas de dos colores y no deben crear colores propios.
// 3. Cada píxel de borde se explica como mezcla de dos colores de su entorno: se asigna al
//    color dominante y se guarda cuánto tiene del otro. Así se conoce la posición REAL del borde.
// 4. Se separan las zonas (componentes conectados) y se funden las diminutas.
// 5. Cada zona se contornea con "marching squares" sobre su campo de pertenencia (con valores
//    parciales en los bordes) y el contorno se convierte en una curva.

import { hexToRgb, isValidHex, normalizeHex, rgbToHex } from './color.js'

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

// Lee los píxeles. Escala hacia abajo si es grande y hacia arriba (máx. 3x) si es pequeña.
export function readPixels(image, maxSize) {
  const scale = Math.min(3, maxSize / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No se pudo preparar el canvas.')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, width, height)
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}

// ---------- Color en espacio Lab ----------

const SRGB_LINEAR = new Float32Array(256)
for (let i = 0; i < 256; i += 1) {
  const c = i / 255
  SRGB_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function rgbToLab(r, g, b, out, offset) {
  const R = SRGB_LINEAR[r]
  const G = SRGB_LINEAR[g]
  const B = SRGB_LINEAR[b]
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  out[offset] = 116 * fy - 16
  out[offset + 1] = 500 * (fx - fy)
  out[offset + 2] = 200 * (fy - fz)
}

const dist2 = (a, ai, b, bi) => (a[ai] - b[bi]) ** 2 + (a[ai + 1] - b[bi + 1]) ** 2 + (a[ai + 2] - b[bi + 2]) ** 2

// ---------- Limpieza de ruido ----------

// Ruido de compresión (bloques JPEG, grano): por cada píxel se promedian solo los vecinos de su fila y
// columna cuyo color es casi igual (diferencia menor que `tol` en Lab). En degradados suaves los
// escalones de 8x8 desaparecen; los bordes reales (diferencia grande) no se tocan.
const DENOISE = [
  { radius: 9, tol: 7, iterations: 2 },
  { radius: 7, tol: 6, iterations: 2 },
  { radius: 6, tol: 5, iterations: 2 },
  { radius: 4, tol: 4, iterations: 1 },
  null
]

function denoise(data, lab, valid, W, H, config) {
  const N = W * H
  const tol2 = config.tol * config.tol
  const solid = new Uint8Array(N)
  for (let i = 0; i < N; i += 1) solid[i] = valid[i] && data[i * 4 + 3] >= 250 ? 1 : 0

  // Protegidos: píxeles junto a un cambio fuerte de color a 2 px (ojos, cejas, dientes, bordes finos).
  const protect = new Uint8Array(N)
  const strong = (config.tol * 1.6) ** 2
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x
      if (!solid[i]) continue
      const far = (j) => solid[j] && dist2(lab, i * 3, lab, j * 3) > strong
      if ((x > 1 && far(i - 2)) || (x < W - 2 && far(i + 2)) || (y > 1 && far(i - 2 * W)) || (y < H - 2 && far(i + 2 * W))) protect[i] = 1
    }
  }

  let rgb = new Float32Array(N * 3)
  for (let i = 0; i < N; i += 1) {
    rgb[i * 3] = data[i * 4]
    rgb[i * 3 + 1] = data[i * 4 + 1]
    rgb[i * 3 + 2] = data[i * 4 + 2]
  }
  let out = new Float32Array(N * 3)
  const radius = config.radius

  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    for (let axis = 0; axis < 2; axis += 1) {
      const horizontal = axis === 0
      const stride = horizontal ? 1 : W

      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const i = y * W + x
          const i3 = i * 3

          if (!solid[i] || protect[i]) {
            out[i3] = rgb[i3]
            out[i3 + 1] = rgb[i3 + 1]
            out[i3 + 2] = rgb[i3 + 2]
            continue
          }

          const pos = horizontal ? x : y
          const size = horizontal ? W : H
          const from = Math.max(-radius, -pos)
          const to = Math.min(radius, size - 1 - pos)
          let r = 0
          let g = 0
          let b = 0
          let n = 0

          for (let o = from; o <= to; o += 1) {
            const j = i + o * stride
            if (!solid[j] || dist2(lab, i3, lab, j * 3) > tol2) continue
            r += rgb[j * 3]
            g += rgb[j * 3 + 1]
            b += rgb[j * 3 + 2]
            n += 1
          }

          out[i3] = r / n
          out[i3 + 1] = g / n
          out[i3 + 2] = b / n
        }
      }

      const swap = rgb
      rgb = out
      out = swap
    }
  }

  for (let i = 0; i < N; i += 1) {
    if (!solid[i] || protect[i]) continue
    data[i * 4] = Math.round(rgb[i * 3])
    data[i * 4 + 1] = Math.round(rgb[i * 3 + 1])
    data[i * 4 + 2] = Math.round(rgb[i * 3 + 2])
    rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], lab, i * 3)
  }
}

// ---------- Píxeles planos y paleta ----------

// Un píxel es "plano" si es casi idéntico a sus vecinos; los de borde (mezclas) no lo son.
function computeFlat(data, lab, valid, W, H, limit) {
  const flat = new Uint8Array(W * H)
  const lim = limit * limit

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x
      if (!valid[i] || data[i * 4 + 3] < 250) continue

      let ok = true
      const test = (j) => {
        if (!valid[j] || dist2(lab, i * 3, lab, j * 3) > lim) ok = false
      }
      if (x < W - 1) test(i + 1)
      if (ok && x > 0) test(i - 1)
      if (ok && y < H - 1) test(i + W)
      if (ok && y > 0) test(i - W)
      flat[i] = ok ? 1 : 0
    }
  }

  return flat
}

// k-means en Lab sobre un histograma de colores (ponderado por número de píxeles).
function buildPaletteLab(data, maxColors, mask, photo = false) {
  const buckets = new Map()
  let total = 0

  for (let i = 0; i < data.length; i += 4) {
    if (!mask[i >> 2]) continue

    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += data[i]
    bucket.g += data[i + 1]
    bucket.b += data[i + 2]
    buckets.set(key, bucket)
    total += 1
  }

  if (!total) return null

  const entries = [...buckets.values()]
  const E = entries.length
  const lab = new Float32Array(E * 3)
  const weight = new Float32Array(E)

  entries.forEach((entry, index) => {
    rgbToLab(Math.round(entry.r / entry.count), Math.round(entry.g / entry.count), Math.round(entry.b / entry.count), lab, index * 3)
    weight[index] = entry.count
  })

  // Inicialización voraz: el siguiente centro es el color que más error ponderado reduce.
  const k = Math.min(maxColors, E)
  const centers = new Float32Array(k * 3)
  const minD = new Float32Array(E).fill(Infinity)
  let count = 0
  let pick = 0

  for (let i = 1; i < E; i += 1) if (weight[i] > weight[pick]) pick = i

  while (count < k) {
    centers.set(lab.subarray(pick * 3, pick * 3 + 3), count * 3)
    count += 1

    let best = -1
    let bestScore = 0
    for (let i = 0; i < E; i += 1) {
      const d = dist2(lab, i * 3, centers, (count - 1) * 3)
      if (d < minD[i]) minD[i] = d
      const score = minD[i] * weight[i]
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }

    if (best < 0) break
    pick = best
  }

  const centerCount = count
  const assign = new Int32Array(E)

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const sums = new Float64Array(centerCount * 4)

    for (let i = 0; i < E; i += 1) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centerCount; c += 1) {
        const d = dist2(lab, i * 3, centers, c * 3)
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      assign[i] = best
      sums[best * 4] += lab[i * 3] * weight[i]
      sums[best * 4 + 1] += lab[i * 3 + 1] * weight[i]
      sums[best * 4 + 2] += lab[i * 3 + 2] * weight[i]
      sums[best * 4 + 3] += weight[i]
    }

    for (let c = 0; c < centerCount; c += 1) {
      const w = sums[c * 4 + 3]
      if (!w) continue
      centers[c * 3] = sums[c * 4] / w
      centers[c * 3 + 1] = sums[c * 4 + 1] / w
      centers[c * 3 + 2] = sums[c * 4 + 2] / w
    }
  }

  // Fusión de colores casi idénticos (ΔE < 8) y descarte de colores insignificantes.
  let list = []
  const weights = new Float64Array(centerCount)
  for (let i = 0; i < E; i += 1) weights[assign[i]] += weight[i]
  for (let c = 0; c < centerCount; c += 1) {
    if (weights[c] > 0) list.push({ l: centers[c * 3], a: centers[c * 3 + 1], b: centers[c * 3 + 2], w: weights[c] })
  }

  let merged = true
  while (merged && list.length > 1) {
    merged = false
    outer: for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const d = Math.hypot(list[i].l - list[j].l, list[i].a - list[j].a, list[i].b - list[j].b)
        if (d < (photo ? 6 : 8)) {
          const w = list[i].w + list[j].w
          list[i] = {
            l: (list[i].l * list[i].w + list[j].l * list[j].w) / w,
            a: (list[i].a * list[i].w + list[j].a * list[j].w) / w,
            b: (list[i].b * list[i].w + list[j].b * list[j].w) / w,
            w
          }
          list.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }

  const significant = list.filter((item) => item.w / total >= (photo ? 0.0003 : 0.0008))
  if (significant.length >= 2) list = significant

  const result = new Float32Array(list.length * 3)
  list.forEach((item, index) => result.set([item.l, item.a, item.b], index * 3))
  return result
}

// Clasifica todos los píxeles.
//  - Planos: al color Lab más cercano.
//  - Borde: se explican como mezcla de dos colores presentes alrededor (o el más cercano globalmente):
//    se proyecta el píxel sobre el segmento A–B (en RGB, donde ocurre el suavizado) y se asigna al
//    extremo dominante; `partner`/`tp` guardan el otro color y cuánto contiene (0–0.5).
function classify(data, lab, valid, flat, centersLab, W, H) {
  const N = W * H
  const k = centersLab.length / 3
  const label = new Int16Array(N).fill(-1)
  const partner = new Int16Array(N).fill(-1)
  const tp = new Float32Array(N)
  const unexplained = []

  const nearestLab = (i) => {
    let best = 0
    let bestD = Infinity
    for (let c = 0; c < k; c += 1) {
      const d = dist2(lab, i * 3, centersLab, c * 3)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    return best
  }

  // 1) planos
  const sums = new Float64Array(k * 4)
  for (let i = 0; i < N; i += 1) {
    if (!flat[i]) continue
    const c = nearestLab(i)
    label[i] = c
    sums[c * 4] += data[i * 4]
    sums[c * 4 + 1] += data[i * 4 + 1]
    sums[c * 4 + 2] += data[i * 4 + 2]
    sums[c * 4 + 3] += 1
  }

  // Color RGB real de cada grupo = promedio de sus píxeles planos.
  const rgb = new Float32Array(k * 3)
  for (let c = 0; c < k; c += 1) {
    const w = sums[c * 4 + 3]
    if (w) {
      rgb[c * 3] = sums[c * 4] / w
      rgb[c * 3 + 1] = sums[c * 4 + 1] / w
      rgb[c * 3 + 2] = sums[c * 4 + 2] / w
    } else {
      rgb[c * 3] = rgb[c * 3 + 1] = rgb[c * 3 + 2] = 128
    }
  }

  // 2) bordes
  const stamp = new Int32Array(k)
  let mark = 0
  const R = 3

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x
      if (!valid[i] || flat[i]) continue

      mark += 1
      const cand = []
      for (let dy = -R; dy <= R; dy += 1) {
        const ny = y + dy
        if (ny < 0 || ny >= H) continue
        for (let dx = -R; dx <= R; dx += 1) {
          const nx = x + dx
          if (nx < 0 || nx >= W) continue
          const j = ny * W + nx
          if (!flat[j]) continue
          const l = label[j]
          if (stamp[l] !== mark) {
            stamp[l] = mark
            cand.push(l)
          }
        }
      }

      const near = nearestLab(i)
      if (stamp[near] !== mark) cand.push(near)
      const local = cand.length

      const r = data[i * 4]
      const g = data[i * 4 + 1]
      const b = data[i * 4 + 2]

      // Píxel semitransparente (borde de la silueta): el color no es una mezcla de dos colores
      // sino "color + transparencia". Se toma el color vecino más parecido y el alfa como cobertura.
      const alpha = data[i * 4 + 3]
      if (alpha < 250) {
        let pick = near
        let pickD = Infinity
        for (let u = 0; u < local; u += 1) {
          const A = cand[u]
          const d = Math.hypot(r - rgb[A * 3], g - rgb[A * 3 + 1], b - rgb[A * 3 + 2])
          if (d < pickD) {
            pickD = d
            pick = A
          }
        }
        label[i] = pick
        partner[i] = -2
        tp[i] = 1 - alpha / 255
        continue
      }

      let bestRes = Infinity
      let bestA = near
      let bestB = near
      let bestT = 0

      for (let u = 0; u < cand.length; u += 1) {
        const A = cand[u]
        const ar = rgb[A * 3]
        const ag = rgb[A * 3 + 1]
        const ab = rgb[A * 3 + 2]

        for (let v = u; v < cand.length; v += 1) {
          const B = cand[v]
          let t = 0
          let res

          if (B === A) {
            res = Math.hypot(r - ar, g - ag, b - ab)
          } else {
            const dr = rgb[B * 3] - ar
            const dg = rgb[B * 3 + 1] - ag
            const db = rgb[B * 3 + 2] - ab
            const dd = dr * dr + dg * dg + db * db
            t = dd ? ((r - ar) * dr + (g - ag) * dg + (b - ab) * db) / dd : 0
            t = t < 0 ? 0 : t > 1 ? 1 : t
            res = Math.hypot(r - (ar + t * dr), g - (ag + t * dg), b - (ab + t * db))
            // Se prefieren los pares formados por colores realmente presentes en el entorno.
            if (u >= local || v >= local) res += 5
          }

          if (res < bestRes) {
            bestRes = res
            bestA = A
            bestB = B
            bestT = t
          }
        }
      }

      if (bestA === bestB) {
        label[i] = bestA
      } else if (bestT < 0.5) {
        label[i] = bestA
        partner[i] = bestB
        tp[i] = bestT
      } else {
        label[i] = bestB
        partner[i] = bestA
        tp[i] = 1 - bestT
      }

      if (bestRes > 34) unexplained.push(i)
    }
  }

  return { label, partner, tp, rgb, unexplained }
}

// Colores que ningún par de colores explica (detalles finos de otro color): candidatos a paleta.
function extraColors(data, unexplained, centersLab, validCount, limit) {
  if (unexplained.length < Math.max(12, validCount * 0.0015)) return []

  const buckets = new Map()
  for (const i of unexplained) {
    const key = ((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4)
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += data[i * 4]
    bucket.g += data[i * 4 + 1]
    bucket.b += data[i * 4 + 2]
    buckets.set(key, bucket)
  }

  const picks = []
  const probe = new Float32Array(3)
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count)

  for (const bucket of sorted) {
    if (picks.length >= limit || bucket.count < Math.max(8, validCount * 0.0012)) break

    const r = Math.round(bucket.r / bucket.count)
    const g = Math.round(bucket.g / bucket.count)
    const b = Math.round(bucket.b / bucket.count)
    rgbToLab(r, g, b, probe, 0)

    let far = true
    for (let c = 0; c < centersLab.length / 3; c += 1) if (dist2(probe, 0, centersLab, c * 3) < 14 * 14) far = false
    for (const pick of picks) if (dist2(probe, 0, pick.lab, 0) < 14 * 14) far = false

    if (far) picks.push({ lab: Float32Array.from(probe) })
  }

  return picks.map((pick) => pick.lab)
}

// Elimina píxeles aislados y líneas de 1px sin tocar trazos gruesos.
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

// ---------- Contornos suaves ----------

function boxBlur(src, dst, w, h, radius, horizontal) {
  const size = radius * 2 + 1
  const outer = horizontal ? h : w
  const inner = horizontal ? w : h
  const stride = horizontal ? 1 : w
  const lineStride = horizontal ? w : 1

  for (let line = 0; line < outer; line += 1) {
    const base = line * lineStride
    let sum = 0

    for (let i = -radius; i <= radius; i += 1) {
      if (i >= 0 && i < inner) sum += src[base + i * stride]
    }

    for (let i = 0; i < inner; i += 1) {
      dst[base + i * stride] = sum / size
      const add = i + radius + 1
      const remove = i - radius
      if (add < inner) sum += src[base + add * stride]
      if (remove >= 0) sum -= src[base + remove * stride]
    }
  }
}

// Marching squares: devuelve los contornos (polilíneas cerradas) del campo `f` al nivel `thr`.
function marchingSquares(f, gw, gh, thr) {
  const ka = []
  const kb = []
  const ax = []
  const ay = []
  const bx = []
  const by = []

  for (let j = 0; j < gh - 1; j += 1) {
    for (let i = 0; i < gw - 1; i += 1) {
      const v00 = f[j * gw + i]
      const v10 = f[j * gw + i + 1]
      const v11 = f[(j + 1) * gw + i + 1]
      const v01 = f[(j + 1) * gw + i]
      const c = (v00 >= thr ? 8 : 0) | (v10 >= thr ? 4 : 0) | (v11 >= thr ? 2 : 0) | (v01 >= thr ? 1 : 0)
      if (c === 0 || c === 15) continue

      const top = () => [(j * gw + i) * 2, i + (thr - v00) / (v10 - v00), j]
      const right = () => [(j * gw + i + 1) * 2 + 1, i + 1, j + (thr - v10) / (v11 - v10)]
      const bottom = () => [((j + 1) * gw + i) * 2, i + (thr - v01) / (v11 - v01), j + 1]
      const left = () => [(j * gw + i) * 2 + 1, i, j + (thr - v00) / (v01 - v00)]

      const push = (p, q) => {
        ka.push(p[0])
        kb.push(q[0])
        ax.push(p[1])
        ay.push(p[2])
        bx.push(q[1])
        by.push(q[2])
      }

      const center = (v00 + v10 + v11 + v01) / 4 >= thr

      switch (c) {
        case 1:
        case 14:
          push(left(), bottom())
          break
        case 2:
        case 13:
          push(bottom(), right())
          break
        case 3:
        case 12:
          push(left(), right())
          break
        case 4:
        case 11:
          push(top(), right())
          break
        case 6:
        case 9:
          push(top(), bottom())
          break
        case 7:
        case 8:
          push(top(), left())
          break
        case 5:
          if (center) {
            push(top(), left())
            push(bottom(), right())
          } else {
            push(top(), right())
            push(left(), bottom())
          }
          break
        case 10:
          if (center) {
            push(top(), right())
            push(left(), bottom())
          } else {
            push(top(), left())
            push(bottom(), right())
          }
          break
        default:
          break
      }
    }
  }

  const byKey = new Map()
  const attach = (key, index) => {
    const bucket = byKey.get(key)
    if (bucket) bucket.push(index)
    else byKey.set(key, [index])
  }
  for (let s = 0; s < ka.length; s += 1) {
    attach(ka[s], s)
    attach(kb[s], s)
  }

  const used = new Uint8Array(ka.length)
  const loops = []

  for (let start = 0; start < ka.length; start += 1) {
    if (used[start]) continue

    used[start] = 1
    const points = [[ax[start], ay[start]], [bx[start], by[start]]]
    let exitKey = kb[start]
    let current = start

    for (let guard = 0; guard < ka.length + 2; guard += 1) {
      const next = (byKey.get(exitKey) || []).find((s) => s !== current && !used[s])
      if (next === undefined) break

      used[next] = 1
      if (ka[next] === exitKey) {
        points.push([bx[next], by[next]])
        exitKey = kb[next]
      } else {
        points.push([ax[next], ay[next]])
        exitKey = ka[next]
      }
      current = next
    }

    points.pop()
    if (points.length >= 3) loops.push(points)
  }

  return loops
}

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
  return rdp(points.slice(0, index + 1), epsilon).slice(0, -1).concat(rdp(points.slice(index), epsilon))
}

function simplifyLoop(points, epsilon) {
  if (points.length <= 4) return points

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

function polygonArea(points) {
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    area += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(area) / 2
}

const fmt = (value) => String(Math.round(value * 10) / 10)

// Polilínea cerrada -> curva: cada vértice se redondea con una curva cuadrática de radio
// limitado (`radius`), así las rectas largas siguen rectas y los tramos curvos salen suaves.
function loopToPath(points, radius) {
  const clean = points.filter((p, i) => {
    const q = points[(i + 1) % points.length]
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01
  })
  const n = clean.length
  if (n < 3) return ''

  if (radius <= 0) return `M${clean.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join('L')}Z`

  const entry = []
  const exit = []

  for (let i = 0; i < n; i += 1) {
    const p = clean[i]
    const prev = clean[(i - 1 + n) % n]
    const next = clean[(i + 1) % n]
    const t1 = Math.min(0.5, radius / Math.hypot(prev[0] - p[0], prev[1] - p[1]))
    const t2 = Math.min(0.5, radius / Math.hypot(next[0] - p[0], next[1] - p[1]))
    entry.push([p[0] + (prev[0] - p[0]) * t1, p[1] + (prev[1] - p[1]) * t1])
    exit.push([p[0] + (next[0] - p[0]) * t2, p[1] + (next[1] - p[1]) * t2])
  }

  let d = `M${fmt(entry[0][0])} ${fmt(entry[0][1])}Q${fmt(clean[0][0])} ${fmt(clean[0][1])} ${fmt(exit[0][0])} ${fmt(exit[0][1])}`
  for (let i = 1; i < n; i += 1) {
    d += `L${fmt(entry[i][0])} ${fmt(entry[i][1])}Q${fmt(clean[i][0])} ${fmt(clean[i][1])} ${fmt(exit[i][0])} ${fmt(exit[i][1])}`
  }
  return `${d}Z`
}

// Nivel de suavizado: cajas de blur (radio y pasadas), umbral del contorno, tolerancia y radio de curvas.
// Incluso "Sin suavizar" sigue el borde real con precisión sub-píxel (sin escalones).
const SMOOTH_LEVELS = [
  { blur: 0, passes: 0, threshold: 0.5, epsilon: 0.22, radius: 0 },
  { blur: 1, passes: 1, threshold: 0.5, epsilon: 0.3, radius: 2.5 },
  { blur: 1, passes: 2, threshold: 0.49, epsilon: 0.45, radius: 4 },
  { blur: 2, passes: 2, threshold: 0.48, epsilon: 0.75, radius: 6.5 }
]

// Campo de pertenencia de una zona: 1 dentro, 0 fuera y valores parciales en los píxeles de borde
// (según la mezcla de color medida). En los bordes de la imagen se prolonga por réplica para que
// el contorno no se retire del marco. Se devuelve ya suavizado (desenfoque de caja).
function regionField(list, id, zoneLabel, regionId, partner, tp, W, H, level) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const p of list) {
    const x = p % W
    const y = (p - x) / W
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const pad = level.blur * level.passes + 3
  const x0 = minX - pad
  const y0 = minY - pad
  const gw = maxX - minX + 1 + pad * 2
  const gh = maxY - minY + 1 + pad * 2
  const field = new Float32Array(gw * gh)
  const at = (x, y) => (y - y0) * gw + (x - x0)

  for (const p of list) {
    const x = p % W
    const y = (p - x) / W
    field[at(x, y)] = partner[p] !== -1 ? 1 - tp[p] : 1
  }

  // Vecinos de otra zona que contienen algo de este color (su "partner") aportan la fracción parcial.
  for (const p of list) {
    const x = p % W
    const y = (p - x) / W
    const around = [
      x > 0 ? p - 1 : -1,
      x < W - 1 ? p + 1 : -1,
      y > 0 ? p - W : -1,
      y < H - 1 ? p + W : -1
    ]

    for (const q of around) {
      if (q < 0 || regionId[q] === id || partner[q] !== zoneLabel) continue
      const qx = q % W
      const qy = (q - qx) / W
      const index = at(qx, qy)
      if (tp[q] > field[index]) field[index] = tp[q]
    }
  }

  // Réplica fuera del marco de la imagen (primero columnas, luego filas).
  if (x0 < 0 || y0 < 0 || x0 + gw > W || y0 + gh > H) {
    for (let j = 0; j < gh; j += 1) {
      const y = Math.min(H - 1, Math.max(0, y0 + j))
      for (let i = 0; i < gw; i += 1) {
        const x = x0 + i
        if (x >= 0 && x < W && y0 + j >= 0 && y0 + j < H) continue
        field[j * gw + i] = field[at(Math.min(W - 1, Math.max(0, x)), y)]
      }
    }
  }

  if (level.blur > 0) {
    const scratch = new Float32Array(gw * gh)
    for (let pass = 0; pass < level.passes; pass += 1) {
      boxBlur(field, scratch, gw, gh, level.blur, true)
      boxBlur(scratch, field, gw, gh, level.blur, false)
    }
  }

  return { field, gw, gh, x0, y0 }
}

// Contornos de todas las zonas como una partición: cada zona ocupa donde su campo es el mayor
// (frente al de las demás y al del vacío transparente). Así, en las uniones de 3 o más zonas
// no quedan huecos ni solapes y los bordes compartidos coinciden.
function traceRegions(zones, regionId, partner, tp, W, H, level) {
  const N = W * H
  const top1 = new Float32Array(N)
  const top2 = new Float32Array(N)
  const top1id = new Int32Array(N).fill(-1)
  const cache = new Map()
  let cached = 0

  const accumulate = (zone, f) => {
    for (let j = 0; j < f.gh; j += 1) {
      const y = f.y0 + j
      if (y < 0 || y >= H) continue
      for (let i = 0; i < f.gw; i += 1) {
        const x = f.x0 + i
        if (x < 0 || x >= W) continue
        const v = f.field[j * f.gw + i]
        if (v <= 0) continue
        const p = y * W + x
        if (v > top1[p]) {
          top2[p] = top1[p]
          top1[p] = v
          top1id[p] = zone.id
        } else if (v > top2[p]) {
          top2[p] = v
        }
      }
    }
  }

  const build = (zone) => regionField(zone.list, zone.id, zone.label, regionId, partner, tp, W, H, level)

  for (const zone of zones) {
    const f = build(zone)
    accumulate(zone, f)
    if (cached + f.field.length <= 6e6) {
      cache.set(zone.id, f)
      cached += f.field.length
    }
  }

  // Campo del vacío: píxeles transparentes (y la parte transparente de los semitransparentes).
  let voidField = null
  for (let p = 0; p < N; p += 1) {
    const v = regionId[p] < 0 ? 1 : partner[p] === -2 ? tp[p] : 0
    if (v > 0) {
      if (!voidField) voidField = new Float32Array(N)
      voidField[p] = v
    }
  }
  if (voidField && level.blur > 0) {
    const scratch = new Float32Array(N)
    for (let pass = 0; pass < level.passes; pass += 1) {
      boxBlur(voidField, scratch, W, H, level.blur, true)
      boxBlur(scratch, voidField, W, H, level.blur, false)
    }
  }

  const bias = (0.5 - level.threshold) * 2
  const result = new Map()

  for (const zone of zones) {
    const f = cache.get(zone.id) || build(zone)
    cache.delete(zone.id)
    const { field, gw, gh, x0, y0 } = f
    const d = new Float32Array(gw * gh)

    for (let j = 0; j < gh; j += 1) {
      const y = Math.min(H - 1, Math.max(0, y0 + j))
      for (let i = 0; i < gw; i += 1) {
        const own = field[j * gw + i]
        if (own <= 1e-4) {
          d[j * gw + i] = -1
          continue
        }
        const x = Math.min(W - 1, Math.max(0, x0 + i))
        const p = y * W + x
        let other = top1id[p] === zone.id ? top2[p] : top1[p]
        if (voidField && voidField[p] > other) other = voidField[p]
        d[j * gw + i] = own - other
      }
    }

    // Marco exterior fuera de la zona: cierra los contornos de zonas que tocan el borde de la imagen.
    for (let i = 0; i < gw; i += 1) {
      d[i] = -1
      d[(gh - 1) * gw + i] = -1
    }
    for (let j = 0; j < gh; j += 1) {
      d[j * gw] = -1
      d[j * gw + gw - 1] = -1
    }

    const parts = []
    for (const loop of marchingSquares(d, gw, gh, -bias)) {
      const points = simplifyLoop(loop.map((point) => [point[0] + x0 + 0.5, point[1] + y0 + 0.5]), level.epsilon)
      if (points.length < 3 || polygonArea(points) < 2) continue

      const path = loopToPath(points, level.radius)
      if (path) parts.push(path)
    }
    result.set(zone.id, parts.join(''))
  }

  return result
}

// ---------- Segmentación principal ----------

const DETAIL_AREA = [0.0012, 0.0005, 0.00022, 0.00008, 0.00002]
const DETAIL_PASSES = [2, 1, 1, 1, 0]

// Cuánto de la imagen cubren sus 16 colores más frecuentes (cuantizados). Logos e ilustraciones: casi todo.
// Fotos con degradados: poco.
function colorCoverage(data, valid, N, opaque) {
  const buckets = new Map()
  for (let i = 0; i < N; i += 1) {
    if (!valid[i] || data[i * 4 + 3] < 250) continue
    const key = ((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4)
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }
  const top = [...buckets.values()].sort((a, b) => b - a).slice(0, 16)
  return top.reduce((sum, c) => sum + c, 0) / opaque
}

// Por debajo de este porcentaje de píxeles planos la imagen se trata como foto (degradados, grano).
const PHOTO_TOP_COVERAGE = 0.6

// Ajustes sugeridos según el tipo de imagen: logos e ilustraciones (colores planos) o fotos.
export function analyzeImage(image) {
  const { width: W, height: H, data } = readPixels(image, 420)
  const N = W * H
  const valid = new Uint8Array(N)
  const lab = new Float32Array(N * 3)
  let opaque = 0

  for (let i = 0; i < N; i += 1) {
    if (data[i * 4 + 3] < 20) continue
    valid[i] = 1
    opaque += 1
    rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], lab, i * 3)
  }

  if (!opaque) return { photo: false, flatRatio: 1, params: { colors: 12, detail: 3, smooth: 2 } }

  const flatRatio = colorCoverage(data, valid, N, opaque)
  const photo = flatRatio < PHOTO_TOP_COVERAGE

  return {
    photo,
    flatRatio,
    params: photo ? { colors: 20, detail: 4, smooth: 1 } : { colors: 12, detail: 3, smooth: 2 }
  }
}

// Hasta `n` píxeles repartidos por la zona (sirven para reconocerla después de volver a vectorizar).
function sampleList(list, n) {
  if (list.length <= n) return list.slice()
  const out = []
  for (let i = 0; i < n; i += 1) out.push(list[Math.floor(((i + 0.5) * list.length) / n)])
  return out
}

// Divide la imagen en zonas: cada zona es un grupo conectado de píxeles del mismo color de paleta.
export function segmentImage(image, options = {}) {
  return segmentPixels(readPixels(image, options.maxSize || 560), options)
}

// Parte pura del análisis (corre en un Web Worker): recibe los píxeles ya leídos.
// `fixedColors` (lista de #RRGGBB) obliga a usar exactamente esos colores; `onProgress(texto)` avisa de la etapa.
export function segmentPixels(pixels, { colors = 12, detail = 3, smooth = 2, fixedColors = null, onProgress = null } = {}) {
  const { width: W, height: H, data } = pixels
  const N = W * H
  const sc = Math.max(1, Math.max(W, H) / 560)
  const stage = (text) => onProgress && onProgress(text)
  stage('Preparando la imagen')

  const empty = { width: W, height: H, palette: [], regions: [], transparentRatio: 1, borderOpaque: 0, stats: { flatRatio: 0, photo: false } }

  const valid = new Uint8Array(N)
  const lab = new Float32Array(N * 3)
  let opaque = 0

  for (let i = 0; i < N; i += 1) {
    if (data[i * 4 + 3] < 20) continue
    valid[i] = 1
    opaque += 1
    rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], lab, i * 3)
  }

  if (!opaque) return empty
  const transparentRatio = 1 - opaque / N

  if (DENOISE[detail - 1]) {
    stage('Limpiando ruido')
    const cfg = DENOISE[detail - 1]
    denoise(data, lab, valid, W, H, { ...cfg, radius: Math.round(cfg.radius * sc) })
  }
  stage('Detectando colores')

  // Paleta a partir de píxeles planos (si casi no hay, de todos).
  let flat = computeFlat(data, lab, valid, W, H, 4)
  let flatCount = 0
  for (let i = 0; i < N; i += 1) flatCount += flat[i]
  const flatRatio = colorCoverage(data, valid, N, opaque)
  const photo = flatRatio < PHOTO_TOP_COVERAGE

  // En fotos casi no hay píxeles planos (todo es degradado): se aceptan más para que los detalles
  // pequeños (dientes, brillos) también aporten color a la paleta.
  if (photo) {
    flat = computeFlat(data, lab, valid, W, H, 7)
    flatCount = 0
    for (let i = 0; i < N; i += 1) flatCount += flat[i]
  }
  if (flatCount < Math.max(200, opaque * 0.02)) {
    flat = valid
    flatCount = opaque
  }

  const fixed = (fixedColors || []).filter((hex) => isValidHex(hex)).map((hex) => normalizeHex(hex))
  let centers
  if (fixed.length) {
    centers = new Float32Array(fixed.length * 3)
    fixed.forEach((hex, index) => {
      const c = hexToRgb(hex)
      rgbToLab(c.r, c.g, c.b, centers, index * 3)
    })
  } else {
    centers = buildPaletteLab(data, colors, flat, photo)
  }
  if (!centers) return empty
  stage('Clasificando píxeles')

  // Clasificación; si quedan detalles finos que ninguna mezcla explica, se añaden sus colores.
  let result = classify(data, lab, valid, flat, centers, W, H)
  const extras = fixed.length ? [] : extraColors(data, result.unexplained, centers, opaque, Math.max(1, Math.round(colors * 0.25)))

  if (extras.length) {
    const grown = new Float32Array(centers.length + extras.length * 3)
    grown.set(centers)
    extras.forEach((color, index) => grown.set(color, centers.length + index * 3))
    centers = grown
    result = classify(data, lab, valid, flat, centers, W, H)
  }

  const k = centers.length / 3
  let { label } = result
  const { partner, tp, rgb } = result

  // Los grupos sin píxeles planos (añadidos por detalle fino) toman el promedio de sus píxeles.
  const fallback = new Float64Array(k * 4)
  for (let i = 0; i < N; i += 1) {
    const l = label[i]
    if (l < 0) continue
    fallback[l * 4] += data[i * 4]
    fallback[l * 4 + 1] += data[i * 4 + 1]
    fallback[l * 4 + 2] += data[i * 4 + 2]
    fallback[l * 4 + 3] += 1
  }

  const palette = []
  for (let c = 0; c < k; c += 1) {
    const hasFlat = rgb[c * 3] !== 128 || rgb[c * 3 + 1] !== 128 || rgb[c * 3 + 2] !== 128
    const w = fallback[c * 4 + 3]
    palette.push(
      hasFlat || !w
        ? rgbToHex(rgb[c * 3], rgb[c * 3 + 1], rgb[c * 3 + 2])
        : rgbToHex(fallback[c * 4] / w, fallback[c * 4 + 1] / w, fallback[c * 4 + 2] / w)
    )
  }

  // Con colores fijos, la paleta es exactamente la pedida.
  fixed.forEach((hex, index) => {
    if (index < palette.length) palette[index] = hex
  })

  stage('Separando zonas')
  for (let pass = 0; pass < DETAIL_PASSES[detail - 1]; pass += 1) {
    const cleaned = despeckle(label, W, H, k)
    for (let i = 0; i < N; i += 1) {
      if (cleaned[i] !== label[i] && partner[i] !== -2) {
        partner[i] = -1
        tp[i] = 0
      }
    }
    label = cleaned
  }

  // Componentes conectados (4 vecinos) por color de paleta.
  const regionId = new Int32Array(N).fill(-1)
  const regions = []
  const stack = new Int32Array(N)

  for (let s = 0; s < N; s += 1) {
    if (label[s] < 0 || regionId[s] >= 0) continue

    const id = regions.length
    const lab0 = label[s]
    const list = []
    let sp = 0
    stack[sp++] = s
    regionId[s] = id

    while (sp) {
      const p = stack[--sp]
      list.push(p)
      const x = p % W

      if (x > 0 && regionId[p - 1] < 0 && label[p - 1] === lab0) {
        regionId[p - 1] = id
        stack[sp++] = p - 1
      }
      if (x < W - 1 && regionId[p + 1] < 0 && label[p + 1] === lab0) {
        regionId[p + 1] = id
        stack[sp++] = p + 1
      }
      if (p >= W && regionId[p - W] < 0 && label[p - W] === lab0) {
        regionId[p - W] = id
        stack[sp++] = p - W
      }
      if (p + W < N && regionId[p + W] < 0 && label[p + W] === lab0) {
        regionId[p + W] = id
        stack[sp++] = p + W
      }
    }

    regions.push({ id, label: lab0, list, alive: true })
  }

  // Funde las zonas diminutas con la vecina con la que comparten más borde.
  const minPixels = Math.max(5, Math.round(N * DETAIL_AREA[detail - 1]))
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
      label[p] = target.label
      if (partner[p] !== -2) {
        partner[p] = -1
        tp[p] = 0
      }
      target.list.push(p)
    }
    r.alive = false
    r.list = []
  }

  // Hilos finos cuyo color es una mezcla de sus dos vecinas (restos del suavizado de bordes):
  // no son zonas reales, se absorben en la vecina dominante.
  const centersRgb = palette.map((hex) => hexToRgb(hex))
  const thin = regions
    .filter((r) => r.alive && r.list.length && r.list.length < N * 0.004)
    .sort((a, b) => a.list.length - b.list.length)

  for (const r of thin) {
    if (!r.alive) continue

    const neighbors = new Map()
    let boundary = 0

    for (const p of r.list) {
      const x = p % W
      let edge = false
      const look = (q) => {
        const rid = q < 0 ? -1 : regionId[q]
        if (rid === r.id) return
        edge = true
        if (rid >= 0) neighbors.set(rid, (neighbors.get(rid) || 0) + 1)
      }
      look(x > 0 ? p - 1 : -1)
      look(x < W - 1 ? p + 1 : -1)
      look(p >= W ? p - W : -1)
      look(p + W < N ? p + W : -1)
      if (edge) boundary += 1
    }

    if (r.list.length / Math.max(1, boundary) > 1.7) continue

    const byLabel = new Map()
    for (const [rid, c] of neighbors) {
      const lab1 = regions[rid].label
      byLabel.set(lab1, (byLabel.get(lab1) || 0) + c)
    }
    if (byLabel.size < 2) continue

    const top = [...byLabel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map((entry) => entry[0])
    const A = centersRgb[top[0]]
    const B = centersRgb[top[1]]
    const C = centersRgb[r.label]
    const dr = B.r - A.r
    const dg = B.g - A.g
    const db = B.b - A.b
    const dd = dr * dr + dg * dg + db * db
    if (!dd) continue

    const t = ((C.r - A.r) * dr + (C.g - A.g) * dg + (C.b - A.b) * db) / dd
    const residual = Math.hypot(C.r - (A.r + t * dr), C.g - (A.g + t * dg), C.b - (A.b + t * db))
    if (t < 0.1 || t > 0.9 || residual > 16 || r.label === top[0] || r.label === top[1]) continue

    let best = -1
    let bestCount = -1
    for (const [rid, c] of neighbors) {
      if ((regions[rid].label === top[0] || regions[rid].label === top[1]) && c > bestCount) {
        bestCount = c
        best = rid
      }
    }
    if (best < 0) continue

    const target = regions[best]
    for (const p of r.list) {
      regionId[p] = best
      label[p] = target.label
      if (partner[p] !== -2) {
        partner[p] = -1
        tp[p] = 0
      }
      target.list.push(p)
    }
    r.alive = false
    r.list = []
  }

  const borderPixels = new Map()
  let borderOpaque = 0
  const touch = (p) => {
    if (regionId[p] >= 0) {
      borderPixels.set(regionId[p], (borderPixels.get(regionId[p]) || 0) + 1)
      borderOpaque += 1
    }
  }

  for (let x = 0; x < W; x += 1) {
    touch(x)
    touch((H - 1) * W + x)
  }
  for (let y = 1; y < H - 1; y += 1) {
    touch(y * W)
    touch(y * W + W - 1)
  }

  // Vecindad entre zonas (para fusionar y para reconocer franjas de mezcla).
  const adjacency = new Map()
  const link = (a, b) => {
    if (a < 0 || b < 0 || a === b) return
    let m = adjacency.get(a)
    if (!m) adjacency.set(a, (m = new Map()))
    m.set(b, (m.get(b) || 0) + 1)
    m = adjacency.get(b)
    if (!m) adjacency.set(b, (m = new Map()))
    m.set(a, (m.get(a) || 0) + 1)
  }
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = y * W + x
      if (x < W - 1) link(regionId[p], regionId[p + 1])
      if (y < H - 1) link(regionId[p], regionId[p + W])
    }
  }

  // Franjas de mezcla: zonas pequeñas y alargadas cuyo color es una mezcla de dos vecinas distintas
  // (el suavizado del borde original). Al recolorear las vecinas, estas franjas siguen su color.
  const centersMix = palette.map((hex) => hexToRgb(hex))
  const mixInfo = new Map()
  for (const r of regions) {
    if (!r.alive || !r.list.length || r.list.length > N * 0.02) continue
    const neighbors = adjacency.get(r.id)
    if (!neighbors || neighbors.size < 2) continue

    let boundary = 0
    for (const c of neighbors.values()) boundary += c
    if (r.list.length / Math.max(1, boundary) > 3.5) continue

    const ranked = [...neighbors.entries()].sort((a, b) => b[1] - a[1])
    const [ida, ca] = ranked[0]
    const [idb, cb] = ranked[1]
    if ((ca + cb) / boundary < 0.75) continue

    const la = regions[ida].label
    const lb = regions[idb].label
    if (la === lb || r.label === la || r.label === lb) continue

    const A = centersMix[la]
    const B = centersMix[lb]
    const C = centersMix[r.label]
    const dr = B.r - A.r
    const dg = B.g - A.g
    const db = B.b - A.b
    const dd = dr * dr + dg * dg + db * db
    if (dd < 900) continue

    const t = ((C.r - A.r) * dr + (C.g - A.g) * dg + (C.b - A.b) * db) / dd
    const residual = Math.hypot(C.r - (A.r + t * dr), C.g - (A.g + t * dg), C.b - (A.b + t * db))
    if (t < 0.12 || t > 0.88 || residual > 14) continue

    mixInfo.set(r.id, { a: ida, b: idb, t: Math.round(t * 100) / 100 })
  }
  // Una franja no puede seguir a otra franja.
  for (const [id, info] of [...mixInfo]) {
    if (mixInfo.has(info.a) || mixInfo.has(info.b)) mixInfo.delete(id)
  }

  stage('Trazando contornos')
  const base = SMOOTH_LEVELS[smooth]
  const level = sc > 1 ? { ...base, blur: base.blur > 0 ? Math.max(1, Math.round(base.blur * sc)) : 0, epsilon: base.epsilon * sc, radius: base.radius * sc } : base

  const alive = regions.filter((r) => r.alive && r.list.length)
  const paths = traceRegions(alive, regionId, partner, tp, W, H, level)

  const output = alive
    .map((r) => ({
      id: r.id,
      label: r.label,
      area: r.list.length,
      samples: sampleList(r.list, 25),
      mix: mixInfo.get(r.id) || null,
      nb: [...(adjacency.get(r.id) || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      borderPx: borderPixels.get(r.id) || 0,
      path: paths.get(r.id)
    }))
    .filter((r) => r.path)
    .sort((a, b) => b.area - a.area)

  return { width: W, height: H, palette, regions: output, regionMap: regionId, transparentRatio, borderOpaque, stats: { flatRatio, photo } }
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

// Definición SVG de un degradado lineal por zona (ángulo en grados, sobre la caja de la zona).
export function gradientDef(id, g) {
  const rad = (g.angle * Math.PI) / 180
  const dx = Math.cos(rad) / 2
  const dy = Math.sin(rad) / 2
  const f = (v) => (0.5 + v).toFixed(3)
  const e = (v) => (0.5 - v).toFixed(3)
  return `<linearGradient id="g${id}" x1="${e(dx)}" y1="${e(dy)}" x2="${f(dx)}" y2="${f(dy)}"><stop offset="0" stop-color="${g.from}"/><stop offset="1" stop-color="${g.to}"/></linearGradient>`
}

// Genera el archivo SVG final con los colores editados y sin las zonas eliminadas.
export function buildSvg(seg, fills, hidden, size, grads = {}) {
  const outW = size?.width || seg.width
  const outH = size?.height || seg.height
  const defs = []
  const paths = seg.regions
    .filter((r) => !hidden[r.id])
    .map((r) => {
      const fill = fills[r.id]
      if (grads[r.id]) {
        defs.push(gradientDef(r.id, grads[r.id]))
        return `<path d="${r.path}" fill="url(#g${r.id})" stroke="url(#g${r.id})"/>`
      }
      return `<path d="${r.path}" fill="${fill}" stroke="${fill}"/>`
    })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${seg.width} ${seg.height}" width="${outW}" height="${outH}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}<g fill-rule="evenodd" stroke-width="0.6" stroke-linejoin="round">${paths.join('')}</g></svg>`
}

export { hexToRgb }
