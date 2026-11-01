import { useEffect, useMemo, useRef, useState } from 'react'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp', 'image/x-icon']

const palettePresets = {
  vivid: ['#0F172A', '#2563EB', '#F59E0B', '#10B981', '#EF4444', '#F8FAFC'],
  pastel: ['#FDE68A', '#F9A8D4', '#BFDBFE', '#86EFAC', '#C4B5FD', '#FFFFFF'],
  mono: ['#111827', '#374151', '#6B7280', '#D1D5DB', '#F3F4F6', '#FFFFFF'],
  neon: ['#22D3EE', '#A78BFA', '#F472B6', '#FACC15', '#34D399', '#0F172A']
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// Acepta "#RGB", "#RRGGBB" (con o sin "#"). Devuelve `fallback` si no es válido.
function normalizeHex(hex, fallback = '#000000') {
  const clean = String(hex ?? '')
    .trim()
    .replace(/^#/, '')
    .replace(/[^0-9a-fA-F]/g, '')

  if (clean.length === 3) {
    return `#${clean.split('').map((char) => char + char).join('')}`.toUpperCase()
  }

  if (clean.length === 6) {
    return `#${clean}`.toUpperCase()
  }

  return fallback
}

function isValidHex(value) {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value ?? '').trim())
}

function hexToRgb(hex) {
  const value = normalizeHex(hex).replace('#', '')
  const number = Number.parseInt(value, 16)
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 }
}

function rgbToHex(r, g, b) {
  const toHex = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

function nearestIndex(rgb, candidates) {
  let best = 0
  let min = Number.POSITIVE_INFINITY

  for (let i = 0; i < candidates.length; i += 1) {
    const distance = colorDistance(rgb, candidates[i])
    if (distance < min) {
      min = distance
      best = i
    }
  }

  return best
}

function readableText(hex) {
  const { r, g, b } = hexToRgb(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#0F172A' : '#FFFFFF'
}

function formatPercent(value) {
  if (value > 0 && value < 1) return '<1'
  return String(Math.round(value))
}

// ---------- Carga y caché de imágenes ----------

let imageCache = { src: '', promise: null }

function loadImage(src) {
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

function readPixels(image, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(image, 0, 0, width, height)
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}

// ---------- Detección de paleta ----------

// Agrupa los píxeles en cubos, promedia el color REAL de cada cubo y refina
// los centros con unas iteraciones tipo k-means para obtener colores fieles.
function buildPaletteFromImage(image, maxColors = 6) {
  const pixels = readPixels(image, 200)
  if (!pixels) return null

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

  if (!total) return null

  const entries = [...buckets.values()]
    .map((bucket) => ({
      count: bucket.count,
      r: bucket.r / bucket.count,
      g: bucket.g / bucket.count,
      b: bucket.b / bucket.count
    }))
    .sort((a, b) => b.count - a.count)

  const MIN_DISTANCE = 42
  let centers = []

  for (const entry of entries) {
    if (centers.length >= maxColors) break
    if (centers.every((center) => colorDistance(center, entry) >= MIN_DISTANCE)) {
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
    centers = sums.map((sum, index) =>
      sum.w ? { r: sum.r / sum.w, g: sum.g / sum.w, b: sum.b / sum.w } : centers[index]
    )
  }

  let result = centers.map((center, index) => ({ hex: rgbToHex(center.r, center.g, center.b), weight: weights[index] }))
  result.sort((a, b) => b.weight - a.weight)

  // Descarta grupos diminutos (ruido de antialiasing), conservando al menos 2.
  const significant = result.filter((item) => item.weight / total >= 0.004)
  if (significant.length >= 2) result = significant

  // Evita colores duplicados tras el redondeo.
  return [...new Set(result.map((item) => item.hex))]
}

// ---------- Mapeo color -> zona de la imagen ----------

function describeRegion(stat, width, height, coverage, edgeOpaque) {
  const bboxW = (stat.maxX - stat.minX + 1) / width
  const bboxH = (stat.maxY - stat.minY + 1) / height

  if (edgeOpaque >= 12 && stat.edge / edgeOpaque > 0.6 && coverage > 8) return 'Background / edges'
  if (bboxW > 0.7 && bboxH > 0.7) return 'Spread across the image'

  const nx = stat.sx / stat.count / width
  const ny = stat.sy / stat.count / height
  const vertical = ny < 0.36 ? 'top' : ny > 0.64 ? 'bottom' : 'middle'
  const horizontal = nx < 0.36 ? 'left' : nx > 0.64 ? 'right' : 'center'
  const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1)

  if (vertical === 'middle' && horizontal === 'center') return 'Center'
  if (vertical === 'middle') return `${cap(horizontal)} side`
  if (horizontal === 'center') return cap(vertical)
  return `${cap(vertical)} ${horizontal}`
}

// Asigna cada píxel a su color más cercano (usando los colores ORIGINALES detectados)
// y genera, por color: cobertura, posición, marcador y una máscara que resalta su zona.
function analyzeRegions(image, sources) {
  const pixels = readPixels(image, 220)
  if (!pixels || !sources.length) return []

  const { width, height, data } = pixels
  const rgbs = sources.map((hex) => hexToRgb(hex))
  const assign = new Int16Array(width * height).fill(-1)
  const stats = sources.map(() => ({ count: 0, sx: 0, sy: 0, minX: width, maxX: 0, minY: height, maxY: 0, edge: 0 }))
  let opaque = 0
  let edgeOpaque = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      if (data[i * 4 + 3] < 30) continue

      const index = nearestIndex({ r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] }, rgbs)
      const stat = stats[index]

      assign[i] = index
      stat.count += 1
      stat.sx += x
      stat.sy += y
      stat.minX = Math.min(stat.minX, x)
      stat.maxX = Math.max(stat.maxX, x)
      stat.minY = Math.min(stat.minY, y)
      stat.maxY = Math.max(stat.maxY, y)
      opaque += 1

      if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) {
        stat.edge += 1
        edgeOpaque += 1
      }
    }
  }

  // Punto de la región más cercano a su centroide (para colocar el marcador numerado).
  const anchors = stats.map((stat) => ({
    cx: stat.count ? stat.sx / stat.count : 0,
    cy: stat.count ? stat.sy / stat.count : 0,
    best: Number.POSITIVE_INFINITY,
    x: 0,
    y: 0
  }))

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = assign[y * width + x]
      if (index < 0) continue

      const anchor = anchors[index]
      const distance = (x - anchor.cx) ** 2 + (y - anchor.cy) ** 2
      if (distance < anchor.best) {
        anchor.best = distance
        anchor.x = x
        anchor.y = y
      }
    }
  }

  return stats.map((stat, index) => {
    if (!stat.count) {
      return { coverage: 0, marker: null, description: 'Not found in the image', mask: null }
    }

    const coverage = opaque ? (stat.count / opaque) * 100 : 0
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    let mask = null

    if (ctx) {
      const imageData = ctx.createImageData(width, height)
      const out = imageData.data

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = y * width + x
          const o = i * 4

          if (assign[i] !== index) {
            out[o] = 2
            out[o + 1] = 8
            out[o + 2] = 23
            out[o + 3] = 200
            continue
          }

          const isBoundary =
            (x > 0 && assign[i - 1] !== index) ||
            (x < width - 1 && assign[i + 1] !== index) ||
            (y > 0 && assign[i - width] !== index) ||
            (y < height - 1 && assign[i + width] !== index)

          if (isBoundary) {
            out[o] = 34
            out[o + 1] = 211
            out[o + 2] = 238
            out[o + 3] = 235
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)
      mask = canvas.toDataURL('image/png')
    }

    return {
      coverage,
      marker: { x: ((anchors[index].x + 0.5) / width) * 100, y: ((anchors[index].y + 0.5) / height) * 100 },
      description: describeRegion(stat, width, height, coverage, edgeOpaque),
      mask
    }
  })
}

// ---------- Vectorización ----------

let pixelCache = { src: '', pixels: null }

async function getVectorPixels(imageSrc) {
  if (pixelCache.src === imageSrc && pixelCache.pixels) return pixelCache.pixels

  const image = await loadImage(imageSrc)
  const maxWidth = 900
  const scale = Math.min(1, maxWidth / image.width)
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No se pudo preparar el canvas para vectorizar.')

  ctx.drawImage(image, 0, 0, width, height)
  const pixels = { width, height, data: ctx.getImageData(0, 0, width, height).data }
  pixelCache = { src: imageSrc, pixels }
  return pixels
}

// `palette` = [{ source, value }]: los píxeles se asignan según `source` (color original
// detectado) y se pintan con `value` (color editado). Así editar un color recolorea SU zona.
async function vectorizeSvgFromImage(imageSrc, palette, options = {}) {
  const { width, height, data } = await getVectorPixels(imageSrc)
  const cellSize = clamp(Number(options.cellSize) || 14, 8, 30)
  const backgroundColor = normalizeHex(options.backgroundColor || '#FFFFFF', '#FFFFFF')
  const preserveTransparency = Boolean(options.preserveTransparency)
  const sources = palette.map((color) => hexToRgb(color.source))
  const fills = palette.map((color) => normalizeHex(color.value))
  const rects = []

  for (let y = 0; y < height; y += cellSize) {
    let run = null

    const flush = () => {
      if (!run) return
      const opacityAttr = run.opacity < 1 ? ` fill-opacity="${run.opacity}"` : ''
      rects.push(`<rect x="${run.x}" y="${y}" width="${run.count * cellSize + 1}" height="${cellSize + 1}" fill="${fills[run.index]}"${opacityAttr}/>`)
      run = null
    }

    for (let x = 0; x < width; x += cellSize) {
      let totalR = 0
      let totalG = 0
      let totalB = 0
      let totalA = 0
      let count = 0

      for (let dy = 0; dy < cellSize; dy += 1) {
        const py = y + dy
        if (py >= height) continue

        for (let dx = 0; dx < cellSize; dx += 1) {
          const px = x + dx
          if (px >= width) continue

          const index = (py * width + px) * 4
          const alpha = data[index + 3]
          if (alpha < 12) continue

          totalR += data[index]
          totalG += data[index + 1]
          totalB += data[index + 2]
          totalA += alpha
          count += 1
        }
      }

      if (count === 0) {
        flush()
        continue
      }

      const average = { r: totalR / count, g: totalG / count, b: totalB / count }
      const index = nearestIndex(average, sources)
      const opacity = preserveTransparency ? Math.round(clamp(totalA / count / 255, 0.2, 1) * 10) / 10 : 1

      if (run && run.index === index && run.opacity === opacity) {
        run.count += 1
      } else {
        flush()
        run = { x, index, opacity, count: 1 }
      }
    }

    flush()
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${backgroundColor}"/>${rects.join('')}</svg>`
}

async function exportSvgToPng(svgString, filename) {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  try {
    const img = new Image()
    const loaded = new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = url
    })

    await loaded

    const canvas = document.createElement('canvas')
    const width = img.naturalWidth || 1200
    const height = img.naturalHeight || 1200
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    const pngUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = pngUrl
    link.download = `${filename || 'vectorized-image'}.png`
    link.click()

    URL.revokeObjectURL(url)
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

// ---------- Componentes auxiliares ----------

function HexInput({ value, onCommit }) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft((previous) => (normalizeHex(previous, '') === value ? previous : value))
  }, [value])

  return (
    <input
      type="text"
      className="hex-input"
      value={draft}
      maxLength={7}
      spellCheck={false}
      aria-label="Hex color"
      onChange={(event) => {
        const next = event.target.value
        setDraft(next)
        if (/^#?[0-9a-fA-F]{6}$/.test(next.trim())) onCommit(normalizeHex(next))
      }}
      onBlur={() => {
        if (isValidHex(draft)) onCommit(normalizeHex(draft))
        setDraft(isValidHex(draft) ? normalizeHex(draft) : value)
      }}
    />
  )
}

// Contenedor con proporción fija para alinear máscara y marcadores sobre la imagen/SVG.
function RegionStage({ ratio, maxHeight = 420, colors, regions, activeId, onHover, showMarkers = true, children }) {
  const safeRatio = ratio > 0 ? ratio : 1
  const activeIndex = colors.findIndex((color) => color.id === activeId)
  const mask = activeIndex >= 0 ? regions[activeIndex]?.mask : null

  return (
    <div
      className="region-stage"
      style={{ aspectRatio: String(safeRatio), width: `min(100%, ${Math.round(maxHeight * safeRatio)}px)` }}
    >
      {children}
      {mask && <img src={mask} alt="" className="region-mask" />}
      {showMarkers &&
        regions.map((region, index) => {
          const color = colors[index]
          if (!region?.marker || !color) return null

          return (
            <button
              key={color.id}
              type="button"
              className={`region-marker ${color.id === activeId ? 'active' : ''}`}
              style={{
                left: `${region.marker.x}%`,
                top: `${region.marker.y}%`,
                backgroundColor: color.value,
                color: readableText(color.value)
              }}
              title={`${color.label} · ${region.description}`}
              onMouseEnter={() => onHover(color.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(color.id)}
              onBlur={() => onHover(null)}
            >
              {index + 1}
            </button>
          )
        })}
    </div>
  )
}

export default function App() {
  const inputRef = useRef(null)
  const [imageSrc, setImageSrc] = useState('')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [imageInfo, setImageInfo] = useState({ width: 0, height: 0 })
  const [detectedColors, setDetectedColors] = useState([])
  const [regions, setRegions] = useState([])
  const [selectedPreset, setSelectedPreset] = useState('vivid')
  const [svgMarkup, setSvgMarkup] = useState('')
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF')
  const [gridSize, setGridSize] = useState(14)
  const [paletteSize, setPaletteSize] = useState(6)
  const [preserveTransparency, setPreserveTransparency] = useState(true)
  const [hoverId, setHoverId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)

  const activeId = hoverId || pinnedId
  const imageRatio = imageInfo.width && imageInfo.height ? imageInfo.width / imageInfo.height : 1
  const sourceKey = detectedColors.map((color) => color.source).join('|')

  const fileStats = useMemo(
    () => (imageInfo.width ? `${imageInfo.width} × ${imageInfo.height}px` : 'No image'),
    [imageInfo]
  )

  // Dimensiones de la imagen en cuanto se carga.
  useEffect(() => {
    if (!imageSrc) {
      setImageInfo({ width: 0, height: 0 })
      return undefined
    }

    let cancelled = false
    loadImage(imageSrc)
      .then((image) => {
        if (!cancelled) setImageInfo({ width: image.width, height: image.height })
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo leer la imagen.')
      })

    return () => {
      cancelled = true
    }
  }, [imageSrc])

  // Zona de la imagen que corresponde a cada color (según los colores originales detectados).
  useEffect(() => {
    if (!imageSrc || !sourceKey) {
      setRegions([])
      return undefined
    }

    let cancelled = false
    loadImage(imageSrc)
      .then((image) => {
        if (!cancelled) setRegions(analyzeRegions(image, sourceKey.split('|')))
      })
      .catch(() => {
        if (!cancelled) setRegions([])
      })

    return () => {
      cancelled = true
    }
  }, [imageSrc, sourceKey])

  // Vista previa en vivo: se regenera sola al editar colores u opciones.
  useEffect(() => {
    if (!imageSrc || !detectedColors.length) return undefined

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const svg = await vectorizeSvgFromImage(imageSrc, detectedColors, {
          cellSize: gridSize,
          preserveTransparency,
          backgroundColor
        })
        if (!cancelled) setSvgMarkup(svg)
      } catch (err) {
        if (!cancelled) setError(err?.message || 'No se pudo generar el SVG.')
      }
    }, 120)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [imageSrc, detectedColors, gridSize, preserveTransparency, backgroundColor])

  const loadFile = (file) => {
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Formato no compatible. Prueba con PNG, JPG, WEBP, GIF, BMP o ICO.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setImageSrc(String(reader.result))
      setFileName(file.name.replace(/\.[^/.]+$/, ''))
      setDetectedColors([])
      setRegions([])
      setSvgMarkup('')
      setHoverId(null)
      setPinnedId(null)
      setError('')
    }
    reader.readAsDataURL(file)
  }

  const handleFileSelection = (event) => {
    loadFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleDrop = (event) => {
    event.preventDefault()
    loadFile(event.dataTransfer?.files?.[0])
  }

  const makeColors = (hexes) =>
    hexes.map((hex, index) => {
      const value = normalizeHex(hex)
      return { id: `c${index}`, label: `Color ${index + 1}`, source: value, value }
    })

  const applyPreset = (presetName) => {
    setSelectedPreset(presetName)
    const preset = palettePresets[presetName]

    if (detectedColors.length) {
      // Recolorea cada zona detectada con el color equivalente del preset.
      setDetectedColors((current) =>
        current.map((color, index) => ({ ...color, value: normalizeHex(preset[index % preset.length]) }))
      )
      return
    }

    setDetectedColors(makeColors(preset))
  }

  const detectPalette = async () => {
    if (!imageSrc) {
      setError('Primero selecciona una imagen para analizarla.')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      const image = await loadImage(imageSrc)
      const palette = buildPaletteFromImage(image, paletteSize) || [...palettePresets.vivid]
      setImageInfo({ width: image.width, height: image.height })
      setDetectedColors(makeColors(palette))
      setPinnedId(null)
    } catch {
      setError('La imagen no pudo cargarse para analizar los colores.')
    } finally {
      setIsProcessing(false)
    }
  }

  const updateColor = (id, patch) => {
    setDetectedColors((current) => current.map((color) => (color.id === id ? { ...color, ...patch } : color)))
  }

  const updateColorValue = (id, nextValue) => {
    updateColor(id, { value: normalizeHex(nextValue) })
  }

  const updateColorByRgb = (id, channel, numericValue) => {
    setDetectedColors((current) =>
      current.map((color) => {
        if (color.id !== id) return color

        const { r, g, b } = hexToRgb(color.value)
        const nextRgb = { r, g, b, [channel]: clamp(Number(numericValue) || 0, 0, 255) }

        return { ...color, value: rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b) }
      })
    )
  }

  const resetColors = () => {
    setDetectedColors((current) => current.map((color) => ({ ...color, value: color.source })))
  }

  const vectorizeImage = async () => {
    if (!imageSrc || !detectedColors.length) {
      setError('Debes detectar una paleta antes de vectorizar.')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      const svg = await vectorizeSvgFromImage(imageSrc, detectedColors, {
        cellSize: gridSize,
        preserveTransparency,
        backgroundColor
      })
      setSvgMarkup(svg)
    } catch (err) {
      setError(err?.message || 'No se pudo generar el SVG.')
    } finally {
      setIsProcessing(false)
    }
  }

  const downloadSvg = () => {
    if (!svgMarkup) return
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName || 'vectorized-image'}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  const downloadPng = async () => {
    if (!svgMarkup) return
    try {
      await exportSvgToPng(svgMarkup, fileName || 'vectorized-image')
    } catch {
      setError('No se pudo exportar el PNG.')
    }
  }

  const stageProps = { colors: detectedColors, regions, activeId, onHover: setHoverId }

  const features = [
    { title: 'Fast conversion', text: 'Vectorize logos, icons and illustrations with a precise color-driven workflow.' },
    { title: 'Editable palette', text: 'Accept the detected palette or modify each color manually with RGB controls.' },
    { title: 'Export ready', text: 'Download SVG for web and PNG for presentations or sharing.' }
  ]

  return (
    <div className="app-shell">
      <div className="top-glow" />

      <div className="container">
        <header className="hero">
          <div className="brand-row">
            <div className="brand-mark">S</div>
            <span>SVG Forge</span>
          </div>

          <div className="hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">Professional image to SVG workflow</p>
              <h1>Convert any image to a clean SVG with color control.</h1>
              <p className="subhead">
                Upload a file, detect the dominant colors, accept or edit the palette, and export a polished vector version in seconds.
              </p>

              <div className="hero-actions">
                <button type="button" onClick={() => inputRef.current?.click()} className="primary-button">
                  Upload image
                </button>
                <button type="button" onClick={detectPalette} disabled={!imageSrc || isProcessing} className="secondary-button">
                  Detect colors
                </button>
              </div>
            </div>

            <div className="stats-panel">
              <div className="stats-item">
                <span className="stats-label">Supported</span>
                <strong>PNG / JPG / WEBP / GIF / BMP / ICO</strong>
              </div>
              <div className="stats-item">
                <span className="stats-label">Output</span>
                <strong>SVG + PNG</strong>
              </div>
              <div className="stats-item">
                <span className="stats-label">Workflow</span>
                <strong>Detect → Edit → Export</strong>
              </div>
            </div>
          </div>
        </header>

        <section className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="feature-card">
              <div className="feature-icon">◇</div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </section>

        <div className="preset-row">
          {Object.entries(palettePresets).map(([key, colors]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={`preset-pill ${selectedPreset === key ? 'active' : ''}`}
            >
              <span className="preset-swatches">
                {colors.slice(0, 3).map((color) => (
                  <span key={color} className="preset-swatch" style={{ backgroundColor: color }} />
                ))}
              </span>
              {key}
            </button>
          ))}
        </div>

        <main className="workspace-grid">
          <section className="panel panel-main">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Source</p>
                <h2>Upload and preview</h2>
              </div>
              <span className="badge">{fileStats}</span>
            </div>

            <div
              className="upload-box"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.ico" onChange={handleFileSelection} />

              {imageSrc ? (
                <div className="upload-preview-wrap">
                  <img src={imageSrc} alt="Original" className="upload-preview" />
                  <p>{fileName || 'Archivo cargado'}</p>
                </div>
              ) : (
                <div className="upload-empty-state">
                  <div className="upload-icon">⤴</div>
                  <p>Drop an image here or browse</p>
                  <span>PNG, JPG, WEBP, GIF, BMP or ICO</span>
                </div>
              )}
            </div>

            <div className="action-row">
              <button type="button" onClick={detectPalette} disabled={!imageSrc || isProcessing} className="action-button primary">
                {isProcessing ? 'Processing...' : 'Detect colors'}
              </button>
              <button type="button" onClick={vectorizeImage} disabled={!imageSrc || !detectedColors.length || isProcessing} className="action-button success">
                Refresh vector
              </button>
              <button type="button" onClick={downloadSvg} disabled={!svgMarkup} className="action-button secondary">
                Download SVG
              </button>
              <button type="button" onClick={downloadPng} disabled={!svgMarkup} className="action-button neutral">
                Export PNG
              </button>
            </div>

            <div className="controls-grid">
              <label className="control-card">
                <span className="control-label">Cell size</span>
                <input type="range" min="8" max="28" step="2" value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))} />
                <strong>{gridSize}px</strong>
              </label>

              <label className="control-card">
                <span className="control-label">Colors to detect</span>
                <input type="range" min="2" max="12" step="1" value={paletteSize} onChange={(e) => setPaletteSize(Number(e.target.value))} />
                <strong>{paletteSize} colors</strong>
              </label>

              <label className="control-card">
                <span className="control-label">Background</span>
                <div className="color-inline">
                  <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} />
                  <span>{backgroundColor}</span>
                </div>
              </label>

              <label className="control-card">
                <span className="control-label">Transparency</span>
                <button
                  type="button"
                  onClick={() => setPreserveTransparency((prev) => !prev)}
                  className={`toggle-button ${preserveTransparency ? 'on' : ''}`}
                >
                  <span>{preserveTransparency ? 'Enabled' : 'Disabled'}</span>
                  <span className="toggle-indicator">{preserveTransparency ? '✓' : '○'}</span>
                </button>
              </label>
            </div>

            {error && <div className="error-box">{error}</div>}
          </section>

          <aside className="panel panel-side">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Palette</p>
                <h2>Detected colors</h2>
              </div>
              <span className="badge accent">{detectedColors.length ? 'Ready' : 'Empty'}</span>
            </div>

            {imageSrc && detectedColors.length > 0 && (
              <div className="live-preview">
                <div className="live-preview-label">
                  <span>Live preview</span>
                  <button type="button" className="reset-button" onClick={resetColors}>
                    Reset colors
                  </button>
                </div>

                {svgMarkup ? (
                  <RegionStage {...stageProps} ratio={imageRatio} maxHeight={240}>
                    <div className="region-svg" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
                  </RegionStage>
                ) : (
                  <div className="preview-placeholder">Generating preview…</div>
                )}
                <p className="live-preview-hint">Hover a number or a color card to see which part of the image it controls.</p>
              </div>
            )}

            <div className="palette-list">
              {detectedColors.length ? (
                detectedColors.map((color, index) => {
                  const rgb = hexToRgb(color.value)
                  const region = regions[index]
                  const isActive = color.id === activeId
                  const isPinned = color.id === pinnedId
                  const changed = color.value !== color.source

                  return (
                    <div
                      key={color.id}
                      className={`color-card ${isActive ? 'active' : ''}`}
                      onMouseEnter={() => setHoverId(color.id)}
                      onMouseLeave={() => setHoverId(null)}
                    >
                      <div className="color-header">
                        <div className="color-sample" style={{ backgroundColor: color.value, color: readableText(color.value) }}>
                          {index + 1}
                        </div>
                        <div className="color-title">
                          <input
                            type="text"
                            className="label-input"
                            value={color.label}
                            aria-label={`Name for color ${index + 1}`}
                            onChange={(e) => updateColor(color.id, { label: e.target.value })}
                          />
                          <small>
                            {color.value}
                            {changed ? ` · was ${color.source}` : ''}
                          </small>
                        </div>
                        <input type="color" value={color.value} onChange={(e) => updateColorValue(color.id, e.target.value)} />
                      </div>

                      {region && (
                        <div className="region-row">
                          <div className="region-thumb">
                            <img src={imageSrc} alt="" />
                            {region.mask && <img src={region.mask} alt="" className="region-thumb-mask" />}
                          </div>
                          <div className="region-meta">
                            <strong>{formatPercent(region.coverage)}% of the image</strong>
                            <span>{region.description}</span>
                          </div>
                          <button
                            type="button"
                            className={`locate-button ${isPinned ? 'on' : ''}`}
                            onClick={() => setPinnedId(isPinned ? null : color.id)}
                          >
                            {isPinned ? 'Pinned' : 'Locate'}
                          </button>
                        </div>
                      )}

                      <div className="rgb-grid">
                        {['r', 'g', 'b'].map((channel) => (
                          <label key={channel} className="rgb-slider">
                            <div className="rgb-meta">
                              <span>{channel.toUpperCase()}</span>
                              <strong>{rgb[channel]}</strong>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="255"
                              value={rgb[channel]}
                              onChange={(e) => updateColorByRgb(color.id, channel, e.target.value)}
                            />
                          </label>
                        ))}
                      </div>

                      <HexInput value={color.value} onCommit={(next) => updateColorValue(color.id, next)} />
                    </div>
                  )
                })
              ) : (
                <div className="empty-state-card">Detect a source image to generate a palette.</div>
              )}
            </div>
          </aside>
        </main>

        <section className="panel preview-panel">
          <div className="panel-header preview-header">
            <div>
              <p className="panel-kicker">Preview</p>
              <h2>Original vs vector output</h2>
            </div>
            <div className="preview-tags">
              <span>Original</span>
              <span className="tag-highlight">SVG</span>
            </div>
          </div>

          <div className="preview-grid">
            <div className="preview-card">
              <div className="preview-label-row">
                <span>Original</span>
                <strong>{fileStats}</strong>
              </div>
              {imageSrc ? (
                <div className="stage-center">
                  <RegionStage {...stageProps} ratio={imageRatio}>
                    <img src={imageSrc} alt="Original" className="region-base" />
                  </RegionStage>
                </div>
              ) : (
                <div className="preview-placeholder">No image loaded</div>
              )}
            </div>

            <div className="preview-card">
              <div className="preview-label-row">
                <span>Vector</span>
                <strong>SVG</strong>
              </div>
              {svgMarkup ? (
                <div className="stage-center">
                  <RegionStage {...stageProps} ratio={imageRatio} showMarkers={false}>
                    <div className="region-svg" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
                  </RegionStage>
                </div>
              ) : (
                <div className="preview-placeholder">Your vector output will appear here.</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

