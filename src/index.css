import { useMemo, useRef, useState } from 'react'

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

function normalizeHex(hex) {
  const clean = (hex || '#000000').replace(/[^#0-9a-fA-F]/g, '')
  if (!clean) return '#000000'

  if (clean.length === 3) {
    return `#${clean.split('').map((char) => char + char).join('')}`.toUpperCase()
  }

  if (clean.length === 6) {
    return `#${clean}`.toUpperCase()
  }

  return '#000000'
}

function hexToRgb(hex) {
  const value = normalizeHex(hex).replace('#', '')
  const number = Number.parseInt(value, 16)
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 }
}

function rgbToHex(r, g, b) {
  const toHex = (value) => value.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

function buildPaletteFromImage(image, maxColors = 6) {
  const canvas = document.createElement('canvas')
  const maxSize = 180
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return [...palettePresets.vivid]

  ctx.drawImage(image, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  const buckets = new Map()

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]
    if (alpha < 30) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const key = `${Math.round(r / 32) * 32},${Math.round(g / 32) * 32},${Math.round(b / 32) * 32}`
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }

  const sortedKeys = [...buckets.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key)
  const uniqueColors = []

  for (const key of sortedKeys) {
    const [r, g, b] = key.split(',').map(Number)
    const candidate = rgbToHex(r, g, b)

    const alreadyClose = uniqueColors.some((existing) => {
      const current = hexToRgb(existing)
      const distance = Math.sqrt((current.r - r) ** 2 + (current.g - g) ** 2 + (current.b - b) ** 2)
      return distance < 40
    })

    if (!alreadyClose) uniqueColors.push(candidate)
    if (uniqueColors.length >= maxColors) break
  }

  return uniqueColors.length ? uniqueColors : [...palettePresets.vivid]
}

function getClosestColor(hex, palette) {
  const target = hexToRgb(hex)
  let closest = palette[0] || '#000000'
  let minDistance = Number.POSITIVE_INFINITY

  for (const candidate of palette) {
    const color = hexToRgb(candidate)
    const distance = Math.sqrt((target.r - color.r) ** 2 + (target.g - color.g) ** 2 + (target.b - color.b) ** 2)
    if (distance < minDistance) {
      minDistance = distance
      closest = candidate
    }
  }

  return closest
}

function vectorizeSvgFromImage(imageSrc, palette, options = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const cellSize = clamp(Number(options.cellSize) || 14, 8, 30)
      const backgroundColor = normalizeHex(options.backgroundColor || '#FFFFFF')
      const preserveTransparency = Boolean(options.preserveTransparency)
      const maxWidth = 900
      const scale = Math.min(1, maxWidth / image.width)
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('No se pudo preparar el canvas para vectorizar.'))
        return
      }

      ctx.drawImage(image, 0, 0, width, height)
      const imageData = ctx.getImageData(0, 0, width, height)
      const blocks = []

      for (let y = 0; y < height; y += cellSize) {
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
              const alpha = imageData.data[index + 3]
              if (alpha < 12) continue

              totalR += imageData.data[index]
              totalG += imageData.data[index + 1]
              totalB += imageData.data[index + 2]
              totalA += alpha
              count += 1
            }
          }

          if (count === 0) continue

          const avgR = Math.round(totalR / count)
          const avgG = Math.round(totalG / count)
          const avgB = Math.round(totalB / count)
          const avgAlpha = Math.round(totalA / count)
          const averageHex = rgbToHex(avgR, avgG, avgB)
          const nearest = getClosestColor(averageHex, palette)
          const opacity = preserveTransparency ? clamp(avgAlpha / 255, 0.2, 1) : 1

          blocks.push(`<rect x="${x}" y="${y}" width="${cellSize + 1}" height="${cellSize + 1}" fill="${nearest}" fill-opacity="${opacity}" />`)
        }
      }

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
          <rect width="${width}" height="${height}" fill="${backgroundColor}" />
          ${blocks.join('')}
        </svg>
      `.trim()

      resolve(svg)
    }

    image.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    image.src = imageSrc
  })
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

export default function App() {
  const inputRef = useRef(null)
  const [imageSrc, setImageSrc] = useState('')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [imageInfo, setImageInfo] = useState({ width: 0, height: 0 })
  const [detectedColors, setDetectedColors] = useState([])
  const [selectedPreset, setSelectedPreset] = useState('vivid')
  const [svgMarkup, setSvgMarkup] = useState('')
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF')
  const [gridSize, setGridSize] = useState(14)
  const [preserveTransparency, setPreserveTransparency] = useState(true)

  const fileStats = useMemo(
    () => (imageInfo.width ? `${imageInfo.width} × ${imageInfo.height}px` : 'No image'),
    [imageInfo]
  )

  const handleFileSelection = (event) => {
    const file = event.target.files?.[0]
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
      setSvgMarkup('')
      setError('')
    }
    reader.readAsDataURL(file)
  }

  const applyPreset = (presetName) => {
    setSelectedPreset(presetName)
    if (detectedColors.length) return

    const colors = palettePresets[presetName].map((hex, index) => ({
      id: `${hex}-${index}`,
      label: `Color ${index + 1}`,
      value: normalizeHex(hex)
    }))
    setDetectedColors(colors)
  }

  const detectPalette = () => {
    if (!imageSrc) {
      setError('Primero selecciona una imagen para analizarla.')
      return
    }

    setIsProcessing(true)
    setError('')

    const image = new Image()
    image.onload = () => {
      const palette = buildPaletteFromImage(image, 6)
      setImageInfo({ width: image.width, height: image.height })
      setDetectedColors(
        palette.map((hex, index) => ({
          id: `${hex}-${index}`,
          label: `Color ${index + 1}`,
          value: normalizeHex(hex)
        }))
      )
      setSvgMarkup('')
      setIsProcessing(false)
    }

    image.onerror = () => {
      setError('La imagen no pudo cargarse para analizar los colores.')
      setIsProcessing(false)
    }

    image.src = imageSrc
  }

  const updateColorValue = (id, nextValue) => {
    const normalized = normalizeHex(nextValue)
    setDetectedColors((current) =>
      current.map((color) => (color.id === id ? { ...color, value: normalized } : color))
    )
  }

  const updateColorByRgb = (id, channel, numericValue) => {
    setDetectedColors((current) =>
      current.map((color) => {
        if (color.id !== id) return color

        const { r, g, b } = hexToRgb(color.value)
        const nextRgb = { r, g, b, [channel]: clamp(Number(numericValue) || 0, 0, 255) }

        return {
          ...color,
          value: rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b)
        }
      })
    )
  }

  const vectorizeImage = async () => {
    if (!imageSrc || !detectedColors.length) {
      setError('Debes detectar una paleta antes de vectorizar.')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      const palette = detectedColors.map((color) => color.value)
      const svg = await vectorizeSvgFromImage(imageSrc, palette, {
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

            <div className="upload-box" onClick={() => inputRef.current?.click()}>
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
                Accept & vectorize
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

            <div className="palette-list">
              {detectedColors.length ? (
                detectedColors.map((color) => {
                  const rgb = hexToRgb(color.value)
                  return (
                    <div key={color.id} className="color-card">
                      <div className="color-header">
                        <div className="color-sample" style={{ backgroundColor: color.value }} />
                        <div>
                          <p>{color.label}</p>
                          <small>{color.value}</small>
                        </div>
                        <input type="color" value={color.value} onChange={(e) => updateColorValue(color.id, e.target.value)} />
                      </div>

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

                      <input type="text" value={color.value} onChange={(e) => updateColorValue(color.id, e.target.value)} className="hex-input" />
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
                <img src={imageSrc} alt="Original" className="preview-image" />
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
                <div className="svg-container" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
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

