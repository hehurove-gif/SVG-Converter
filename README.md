import { useRef, useState } from 'react'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp']

function hexToRgb(hex) {
  const sanitized = hex.replace('#', '')
  const normalized = sanitized.length === 3
    ? sanitized.split('').map((char) => char + char).join('')
    : sanitized

  const value = Number.parseInt(normalized, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  }
}

function rgbToHex(r, g, b) {
  const toHex = (value) => value.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

function getContrastColor(hex) {
  const { r, g, b } = hexToRgb(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.65 ? '#0F172A' : '#F8FAFC'
}

function getClosestColor(hex, palette) {
  const rgb = hexToRgb(hex)
  let closest = palette[0]
  let minDistance = Infinity

  for (const candidate of palette) {
    const color = hexToRgb(candidate)
    const distance = Math.sqrt(
      (rgb.r - color.r) ** 2 +
      (rgb.g - color.g) ** 2 +
      (rgb.b - color.b) ** 2
    )

    if (distance < minDistance) {
      minDistance = distance
      closest = candidate
    }
  }

  return closest
}

function buildPaletteFromImage(img, maxColors = 6) {
  const canvas = document.createElement('canvas')
  const maxSize = 180
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))

  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, width, height)

  const { data } = ctx.getImageData(0, 0, width, height)
  const colorMap = new Map()

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]
    if (alpha < 128) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const bucketR = Math.round(r / 32) * 32
    const bucketG = Math.round(g / 32) * 32
    const bucketB = Math.round(b / 32) * 32
    const key = `${bucketR},${bucketG},${bucketB}`
    colorMap.set(key, (colorMap.get(key) || 0) + 1)
  }

  const sortedColors = [...colorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)

  const uniqueColors = []
  for (const key of sortedColors) {
    const [r, g, b] = key.split(',').map(Number)
    const hex = rgbToHex(r, g, b)
    const closeEnough = uniqueColors.some((candidate) => {
      const current = hexToRgb(candidate)
      const next = { r, g, b }
      const distance = Math.sqrt(
        (current.r - next.r) ** 2 +
        (current.g - next.g) ** 2 +
        (current.b - next.b) ** 2
      )
      return distance < 38
    })

    if (!closeEnough) {
      uniqueColors.push(hex)
    }

    if (uniqueColors.length >= maxColors) break
  }

  if (uniqueColors.length === 0) {
    return ['#0F172A', '#1D4ED8', '#F59E0B', '#10B981', '#F43F5E', '#F8FAFC']
  }

  return uniqueColors
}

function buildVectorizedSvg(imageSrc, colors, cellSize = 12) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const maxWidth = 900
      const scale = Math.min(1, maxWidth / image.width)
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0, width, height)

      const imageData = ctx.getImageData(0, 0, width, height)
      const rects = []

      for (let y = 0; y < height; y += cellSize) {
        for (let x = 0; x < width; x += cellSize) {
          let totalR = 0
          let totalG = 0
          let totalB = 0
          let count = 0

          for (let dy = 0; dy < cellSize; dy += 1) {
            const py = y + dy
            if (py >= height) continue

            for (let dx = 0; dx < cellSize; dx += 1) {
              const px = x + dx
              if (px >= width) continue

              const index = (py * width + px) * 4
              const alpha = imageData.data[index + 3]
              if (alpha < 128) continue

              totalR += imageData.data[index]
              totalG += imageData.data[index + 1]
              totalB += imageData.data[index + 2]
              count += 1
            }
          }

          if (count === 0) continue

          const avgR = Math.round(totalR / count)
          const avgG = Math.round(totalG / count)
          const avgB = Math.round(totalB / count)
          const averageHex = rgbToHex(avgR, avgG, avgB)
          const nearest = getClosestColor(averageHex, colors)

          rects.push(
            `<rect x="${x}" y="${y}" width="${cellSize + 1}" height="${cellSize + 1}" fill="${nearest}" />`
          )
        }
      }

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
          <rect width="${width}" height="${height}" fill="#FFFFFF" />
          ${rects.join('')}
        </svg>
      `.trim()

      resolve(svg)
    }

    image.onerror = reject
    image.src = imageSrc
  })
}

export default function App() {
  const inputRef = useRef(null)
  const [imageSrc, setImageSrc] = useState('')
  const [fileName, setFileName] = useState('')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [detectedColors, setDetectedColors] = useState([])
  const [paletteAccepted, setPaletteAccepted] = useState(false)
  const [svgMarkup, setSvgMarkup] = useState('')
  const [error, setError] = useState('')
  const [isWorking, setIsWorking] = useState(false)

  const handleFileSelection = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const isAccepted = ACCEPTED_TYPES.includes(file.type)
    if (!isAccepted) {
      setError('Formato no compatible. Sube PNG, JPG, WEBP, GIF o BMP.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setError('')
      setImageSrc(String(reader.result))
      setFileName(file.name.replace(/\.[^/.]+$/, ''))
      setDetectedColors([])
      setSvgMarkup('')
      setPaletteAccepted(false)
    }
    reader.readAsDataURL(file)
  }

  const handleDetectColors = () => {
    if (!imageSrc) {
      setError('Primero sube una imagen para detectar sus colores.')
      return
    }

    setIsWorking(true)
    setError('')

    const image = new Image()
    image.onload = () => {
      const palette = buildPaletteFromImage(image, 6)
      setDetectedColors(
        palette.map((hex, index) => ({
          id: `${hex}-${index}`,
          label: `Color ${index + 1}`,
          hex
        }))
      )
      setImageSize({ width: image.width, height: image.height })
      setPaletteAccepted(false)
      setSvgMarkup('')
      setIsWorking(false)
    }
    image.onerror = () => {
      setError('No se pudo cargar la imagen para analizar la paleta.')
      setIsWorking(false)
    }
    image.src = imageSrc
  }

  const updateColor = (id, newHex) => {
    setDetectedColors((current) =>
      current.map((color) => (color.id === id ? { ...color, hex: newHex } : color))
    )
  }

  const handleAcceptAndVectorize = async () => {
    if (!imageSrc || detectedColors.length === 0) {
      setError('Primero detecta una paleta antes de vectorizar.')
      return
    }

    setIsWorking(true)
    setError('')

    try {
      const palette = detectedColors.map((color) => color.hex)
      const svg = await buildVectorizedSvg(imageSrc, palette)
      setSvgMarkup(svg)
      setPaletteAccepted(true)
    } catch {
      setError('No se pudo generar el SVG a partir de la imagen.')
    } finally {
      setIsWorking(false)
    }
  }

  const handleDownload = () => {
    if (!svgMarkup) return

    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName || 'imagen'}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 text-center">
          <p className="mb-3 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">
            SVG Converter
          </p>
          <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">
            Convierte imágenes a SVG y ajusta la paleta de colores
          </h1>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-slate-700/80 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur-sm">
            <div
              className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600 bg-slate-950/60 p-8 text-center transition hover:border-blue-400 hover:bg-slate-900"
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.gif,.bmp"
                onChange={handleFileSelection}
              />

              {imageSrc ? (
                <div className="w-full">
                  <img
                    src={imageSrc}
                    alt="Imagen seleccionada"
                    className="mx-auto max-h-[340px] rounded-2xl object-contain shadow-xl"
                  />
                  <p className="mt-4 text-sm text-slate-300">{fileName || 'Archivo cargado'}</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-3xl text-blue-300">
                    ⤴
                  </div>
                  <p className="text-lg font-semibold text-white">Arrastra o selecciona una imagen</p>
                  <p className="mt-2 text-sm text-slate-400">PNG, JPG, WEBP, GIF o BMP</p>
                </>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDetectColors}
                disabled={!imageSrc || isWorking}
                className="rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isWorking ? 'Procesando...' : 'Detectar colores'}
              </button>

              <button
                type="button"
                onClick={handleAcceptAndVectorize}
                disabled={!imageSrc || detectedColors.length === 0 || isWorking}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Aceptar y vectorizar
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={!svgMarkup}
                className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Descargar SVG
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}
          </section>

          <aside className="rounded-3xl border border-slate-700/80 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/60 backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-white">Paleta detectada</h2>
              {paletteAccepted && (
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                  Aceptada
                </span>
              )}
            </div>

            <div className="space-y-3">
              {detectedColors.length > 0 ? (
                detectedColors.map((color, index) => (
                  <div key={color.id} className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950/50 p-3">
                    <div
                      className="h-12 w-12 rounded-xl border border-slate-700 shadow-inner"
                      style={{ backgroundColor: color.hex, color: getContrastColor(color.hex) }}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-200">{color.label}</p>
                      <p className="text-xs text-slate-400">{color.hex}</p>
                    </div>

                    <input
                      type="color"
                      value={color.hex}
                      aria-label={`Editar ${color.label}`}
                      onChange={(event) => updateColor(color.id, event.target.value)}
                    />
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-950/50 p-6 text-center text-sm text-slate-400">
                  La paleta aparecerá aquí después de detectar los colores de la imagen.
                </div>
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-sm text-slate-300">
                {imageSize.width && imageSize.height
                  ? `Resolución original: ${imageSize.width} × ${imageSize.height}px`
                  : 'Sube una imagen para analizar su resolución.'}
              </p>
            </div>
          </aside>
        </div>

        <section className="mt-8 rounded-3xl border border-slate-700/80 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-white">Vista previa vectorizada</h2>
            <span className="text-sm text-slate-400">Resultado SVG</span>
          </div>

          {svgMarkup ? (
            <div className="svg-preview overflow-hidden rounded-2xl border border-slate-700 bg-white p-4">
              <div dangerouslySetInnerHTML={{ __html: svgMarkup }} />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-950/50 p-10 text-center text-slate-400">
              Aún no hay una imagen vectorizada. Haz clic en “Aceptar y vectorizar”.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
