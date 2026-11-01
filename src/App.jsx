import { useEffect, useMemo, useRef, useState } from 'react'
import { clamp, hexToRgb, isValidHex, normalizeHex } from './lib/color.js'
import { buildSvg, detectBackground, loadImage, segmentImage } from './lib/segment.js'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon']

const palettePresets = {
  vivid: ['#0F172A', '#2563EB', '#F59E0B', '#10B981', '#EF4444', '#F8FAFC'],
  pastel: ['#FDE68A', '#F9A8D4', '#BFDBFE', '#86EFAC', '#C4B5FD', '#FFFFFF'],
  mono: ['#111827', '#374151', '#6B7280', '#D1D5DB', '#F3F4F6', '#FFFFFF'],
  neon: ['#22D3EE', '#A78BFA', '#F472B6', '#FACC15', '#34D399', '#0F172A']
}

const DETAIL_LABELS = ['Mínimo', 'Bajo', 'Medio', 'Alto', 'Máximo']
const SMOOTH_LABELS = ['Sin suavizar', 'Suave', 'Más suave', 'Muy suave']
const CALLOUT_WIDTH = 252

function initialEdit(seg) {
  const fills = {}
  for (const region of seg.regions) fills[region.id] = seg.palette[region.label]
  return { fills, hidden: {} }
}

async function exportSvgToPng(svgString, filename) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || 1200
    canvas.height = img.naturalHeight || 1200

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `${filename || 'imagen-vectorizada'}.png`
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

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
      aria-label="Código de color hexadecimal"
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

// Globo con flecha que apunta al lugar exacto donde se hizo clic.
function Callout({ selected, color, count, mode, onColor, onMode, onDelete, onClose }) {
  const { x, y, w } = selected
  const left = clamp(x - CALLOUT_WIDTH / 2, 6, Math.max(6, w - CALLOUT_WIDTH - 6))
  const arrowX = clamp(x - left, 20, CALLOUT_WIDTH - 20)
  const above = y > 215
  const rgb = hexToRgb(color)

  return (
    <>
      <span className="click-dot" style={{ left: x, top: y, backgroundColor: color }} />
      <div
        className={`callout ${above ? 'above' : 'below'}`}
        style={{ left, top: above ? y - 14 : y + 14, width: CALLOUT_WIDTH, '--arrow-x': `${arrowX}px` }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="callout-head">
          <label className="callout-swatch" style={{ backgroundColor: color }} title="Cambiar color">
            <input type="color" value={color} onChange={(event) => onColor(normalizeHex(event.target.value))} />
          </label>
          <div className="callout-code">
            <strong>{color}</strong>
            <small>
              rgb({rgb.r}, {rgb.g}, {rgb.b})
            </small>
          </div>
          <button type="button" className="callout-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <HexInput value={color} onCommit={onColor} />

        <div className="segmented small" role="group" aria-label="Alcance del cambio">
          <button type="button" className={mode === 'group' ? 'on' : ''} onClick={() => onMode('group')}>
            Mismo color ({count})
          </button>
          <button type="button" className={mode === 'region' ? 'on' : ''} onClick={() => onMode('region')}>
            Solo esta zona
          </button>
        </div>

        <button type="button" className="callout-delete" onClick={onDelete}>
          Eliminar {mode === 'group' && count > 1 ? `estas ${count} zonas` : 'esta zona'}
        </button>
      </div>
    </>
  )
}

export default function App() {
  const inputRef = useRef(null)
  const stageRef = useRef(null)
  const [imageSrc, setImageSrc] = useState('')
  const [fileName, setFileName] = useState('')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [params, setParams] = useState({ colors: 12, detail: 3, smooth: 2 })
  const [runId, setRunId] = useState(0)
  const [seg, setSeg] = useState(null)
  const [edit, setEdit] = useState({ fills: {}, hidden: {} })
  const [history, setHistory] = useState([])
  const [mode, setMode] = useState('group')
  const [selected, setSelected] = useState(null)
  const [hoverHex, setHoverHex] = useState(null)
  const [selectedPreset, setSelectedPreset] = useState('')
  const [zoom, setZoom] = useState(1)

  // Vectoriza automáticamente al subir la imagen o al cambiar los ajustes.
  useEffect(() => {
    if (!imageSrc) return undefined

    let cancelled = false
    setBusy(true)
    setError('')

    const timer = setTimeout(async () => {
      try {
        const image = await loadImage(imageSrc)
        if (cancelled) return

        const result = segmentImage(image, params)
        if (cancelled) return

        setImageSize({ width: image.width, height: image.height })
        setSeg(result)
        setEdit(initialEdit(result))
        setHistory([])
        setSelected(null)
        setNotice(result.regions.length ? '' : 'No se encontraron zonas de color en la imagen.')
      } catch (err) {
        if (!cancelled) setError(err?.message || 'No se pudo vectorizar la imagen.')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [imageSrc, params, runId])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') setSelected(null)
    }
    const onResize = () => setSelected(null)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const visibleRegions = useMemo(() => (seg ? seg.regions.filter((r) => !edit.hidden[r.id]) : []), [seg, edit.hidden])

  // Colores actuales agrupados: todas las zonas con exactamente el mismo color.
  const groups = useMemo(() => {
    if (!seg) return []

    const map = new Map()
    let total = 0

    for (const region of seg.regions) {
      total += region.area
      if (edit.hidden[region.id]) continue

      const hex = edit.fills[region.id]
      const group = map.get(hex) || { hex, area: 0, ids: [] }
      group.area += region.area
      group.ids.push(region.id)
      map.set(hex, group)
    }

    return [...map.values()]
      .sort((a, b) => b.area - a.area)
      .map((group) => ({ ...group, percent: total ? (group.area / total) * 100 : 0 }))
  }, [seg, edit])

  const highlightIds = useMemo(() => {
    const ids = new Set()
    if (selected) selected.scope.forEach((id) => ids.add(id))
    if (hoverHex) groups.find((g) => g.hex === hoverHex)?.ids.forEach((id) => ids.add(id))
    return ids
  }, [selected, hoverHex, groups])

  const hiddenCount = Object.keys(edit.hidden).length
  const selectedColor = selected ? edit.fills[selected.id] : null

  const snapshot = () =>
    setHistory((current) => {
      const last = current[current.length - 1]
      if (last && JSON.stringify(last) === JSON.stringify(edit)) return current
      return [...current.slice(-40), edit]
    })

  const undo = () => {
    const now = JSON.stringify(edit)
    let index = history.length - 1
    while (index >= 0 && JSON.stringify(history[index]) === now) index -= 1

    if (index < 0) {
      setHistory([])
      return
    }

    setEdit(history[index])
    setHistory(history.slice(0, index))
    setSelected(null)
  }

  const resetAll = () => {
    if (!seg) return
    snapshot()
    setEdit(initialEdit(seg))
    setSelected(null)
    setNotice('')
    setSelectedPreset('')
  }

  const computeScope = (id, nextMode) => {
    if (nextMode === 'region' || !seg) return [id]
    const hex = edit.fills[id]
    return seg.regions.filter((r) => !edit.hidden[r.id] && edit.fills[r.id] === hex).map((r) => r.id)
  }

  const selectRegion = (region, event) => {
    event.stopPropagation()
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return

    snapshot()
    setSelected({
      id: region.id,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      w: rect.width,
      scope: computeScope(region.id, mode)
    })
  }

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setSelected((current) => (current ? { ...current, scope: computeScope(current.id, nextMode) } : current))
  }

  const applyColor = (ids, hex) => {
    setEdit((current) => {
      const fills = { ...current.fills }
      for (const id of ids) fills[id] = hex
      return { ...current, fills }
    })
  }

  const hideIds = (ids) => {
    snapshot()
    setEdit((current) => {
      const hidden = { ...current.hidden }
      for (const id of ids) hidden[id] = true
      return { ...current, hidden }
    })
    setSelected(null)
  }

  const removeBackground = () => {
    if (!seg) return

    const ids = detectBackground(seg).filter((id) => !edit.hidden[id])
    if (!ids.length) {
      setNotice(
        seg.transparentRatio > 0.05
          ? 'La imagen ya tiene fondo transparente.'
          : 'No detecté un fondo en los bordes. Haz clic en el fondo y elige «Eliminar».'
      )
      return
    }

    hideIds(ids)
    setNotice('Fondo eliminado. Si quitó de más, usa «Deshacer».')
  }

  const applyPreset = (name) => {
    if (!groups.length) return
    snapshot()
    setSelectedPreset(name)

    const preset = palettePresets[name]
    setEdit((current) => {
      const fills = { ...current.fills }
      groups.forEach((group, index) => {
        for (const id of group.ids) fills[id] = normalizeHex(preset[index % preset.length])
      })
      return { ...current, fills }
    })
    setSelected(null)
  }

  const loadFile = (file) => {
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Formato no compatible. Prueba con PNG, JPG, WEBP, GIF, BMP o ICO.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setSeg(null)
      setEdit({ fills: {}, hidden: {} })
      setHistory([])
      setSelected(null)
      setNotice('')
      setFileName(file.name.replace(/\.[^/.]+$/, ''))
      setZoom(1)
      setImageSrc(String(reader.result))
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

  const currentSvg = () => (seg ? buildSvg(seg, edit.fills, edit.hidden, imageSize) : '')

  const downloadSvg = () => {
    const svg = currentSvg()
    if (!svg) return

    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName || 'imagen-vectorizada'}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  const downloadPng = async () => {
    const svg = currentSvg()
    if (!svg) return

    try {
      await exportSvgToPng(svg, fileName || 'imagen-vectorizada')
    } catch {
      setError('No se pudo exportar el PNG.')
    }
  }

  const setParam = (key, value) => setParams((current) => ({ ...current, [key]: value }))
  const ratio = seg ? seg.width / seg.height : 1
  const ready = Boolean(seg && seg.regions.length)

  const features = [
    { title: 'Zonas reales', text: 'La imagen se divide por sus líneas y colores en zonas vectoriales que puedes pulsar.' },
    { title: 'Bote de pintura', text: 'Haz clic en una zona, mira su código de color y cámbialo ahí mismo, en una zona o en todas las del mismo color.' },
    { title: 'Listo para exportar', text: 'Elimina el fondo y descarga un SVG limpio, o un PNG transparente.' }
  ]

  return (
    <div className="app-shell">
      <div className="top-glow" />

      <div className="container">
        <header className="hero compact">
          <div className="brand-row">
            <div className="brand-mark">S</div>
            <span>SVG Forge</span>
          </div>

          <div className="hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">De imagen a SVG, con control total del color</p>
              <h1>Vectoriza, quita el fondo y repinta cada zona.</h1>
              <p className="subhead">
                Sube una imagen, haz clic en cualquier parte para ver su color y cámbialo en esa zona o en todas las que lo comparten.
              </p>

              <div className="hero-actions">
                <button type="button" onClick={() => inputRef.current?.click()} className="primary-button">
                  {imageSrc ? 'Cambiar imagen' : 'Subir imagen'}
                </button>
              </div>
            </div>

            <div className="stats-panel">
              <div className="stats-item">
                <span className="stats-label">Formatos</span>
                <strong>PNG / JPG / WEBP / GIF / BMP / ICO</strong>
              </div>
              <div className="stats-item">
                <span className="stats-label">Salida</span>
                <strong>SVG + PNG transparente</strong>
              </div>
              <div className="stats-item">
                <span className="stats-label">Flujo</span>
                <strong>Vectorizar → Fondo → Colores</strong>
              </div>
            </div>
          </div>
        </header>

        <input ref={inputRef} type="file" className="hidden-input" accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.ico" onChange={handleFileSelection} />

        <section className="panel editor-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Editor</p>
              <h2>Imagen → SVG editable</h2>
            </div>
            <span className="badge">{imageSize.width ? `${imageSize.width} × ${imageSize.height}px` : 'Sin imagen'}</span>
          </div>

          {!imageSrc ? (
            <div
              className="upload-box"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="upload-empty-state">
                <div className="upload-icon">⤴</div>
                <p>Arrastra una imagen aquí o haz clic para elegirla</p>
                <span>PNG, JPG, WEBP, GIF, BMP o ICO</span>
              </div>
            </div>
          ) : (
            <div className="workbench">
              <aside className="tools">
                <div className="tool-group">
                  <p className="tool-title">Imagen</p>
                  <button type="button" className="tool-btn" onClick={() => inputRef.current?.click()}>
                    <span className="tool-icon">⤴</span>Cambiar imagen
                  </button>
                  <button type="button" className="tool-btn primary" onClick={() => setRunId((n) => n + 1)} disabled={busy}>
                    <span className="tool-icon">✦</span>
                    {busy ? 'Vectorizando…' : 'Vectorizar imagen'}
                  </button>
                </div>

                <div className="tool-group">
                  <p className="tool-title">Edición</p>
                  <button type="button" className="tool-btn" onClick={removeBackground} disabled={!ready || busy}>
                    <span className="tool-icon">◌</span>Eliminar fondo
                  </button>
                  <button type="button" className="tool-btn" onClick={undo} disabled={!history.length}>
                    <span className="tool-icon">↶</span>Deshacer
                  </button>
                  <button type="button" className="tool-btn" onClick={resetAll} disabled={!ready}>
                    <span className="tool-icon">⟲</span>Restaurar todo
                  </button>
                </div>

                <div className="tool-group">
                  <p className="tool-title">Al cambiar un color</p>
                  <div className="segmented stacked" role="group" aria-label="Alcance del cambio de color">
                    <button type="button" className={mode === 'group' ? 'on' : ''} onClick={() => changeMode('group')}>
                      Todas las zonas del mismo color
                    </button>
                    <button type="button" className={mode === 'region' ? 'on' : ''} onClick={() => changeMode('region')}>
                      Solo la zona pulsada
                    </button>
                  </div>
                </div>

                <div className="tool-group">
                  <p className="tool-title">Ajustes</p>
                  <label className="tool-slider">
                    <span>
                      Colores <strong>{params.colors}</strong>
                    </span>
                    <input type="range" min="2" max="32" step="1" value={params.colors} onChange={(e) => setParam('colors', Number(e.target.value))} />
                  </label>
                  <label className="tool-slider">
                    <span>
                      Detalle <strong>{DETAIL_LABELS[params.detail - 1]}</strong>
                    </span>
                    <input type="range" min="1" max="5" step="1" value={params.detail} onChange={(e) => setParam('detail', Number(e.target.value))} />
                  </label>
                  <label className="tool-slider">
                    <span>
                      Suavizado <strong>{SMOOTH_LABELS[params.smooth]}</strong>
                    </span>
                    <input type="range" min="0" max="3" step="1" value={params.smooth} onChange={(e) => setParam('smooth', Number(e.target.value))} />
                  </label>
                  <p className="hint">Al cambiar estos ajustes se vuelve a vectorizar y se pierden las ediciones.</p>
                </div>

                <div className="tool-group">
                  <p className="tool-title">Exportar</p>
                  <button type="button" className="tool-btn success" onClick={downloadSvg} disabled={!ready}>
                    <span className="tool-icon">⤓</span>Descargar SVG
                  </button>
                  <button type="button" className="tool-btn" onClick={downloadPng} disabled={!ready}>
                    <span className="tool-icon">⤓</span>Exportar PNG
                  </button>
                </div>
              </aside>

              <div className="stage-column">
                {error && <div className="error-box">{error}</div>}
                {notice && <div className="notice-box">{notice}</div>}

                <div className="editor-card vector-card">
                  <div className="preview-label-row">
                    <span>Vector · haz clic en una zona</span>
                    <div className="zoom-controls">
                      <button type="button" onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.5) * 10) / 10))} disabled={zoom <= 1} aria-label="Alejar">
                        −
                      </button>
                      <span>{Math.round(zoom * 100)}%</span>
                      <button type="button" onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.5) * 10) / 10))} disabled={zoom >= 4} aria-label="Acercar">
                        +
                      </button>
                      <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1}>
                        Ajustar
                      </button>
                    </div>
                    <strong>{ready ? `${visibleRegions.length} zonas` : '—'}</strong>
                  </div>

                  <div className={`stage-wrap ${zoom > 1 ? 'zoomed' : ''}`}>
                    {ready ? (
                      <div
                        ref={stageRef}
                        className="editor-stage checker"
                        style={{
                          aspectRatio: String(ratio),
                          width: zoom === 1 ? `min(100%, ${Math.round(640 * ratio)}px)` : `${Math.round(zoom * 100)}%`
                        }}
                        onClick={() => setSelected(null)}
                      >
                        <svg className="editor-svg" viewBox={`0 0 ${seg.width} ${seg.height}`} preserveAspectRatio="xMidYMid meet">
                          <g fillRule="evenodd" strokeWidth="0.5" strokeLinejoin="round">
                            {visibleRegions.map((region) => (
                              <path
                                key={region.id}
                                d={region.path}
                                fill={edit.fills[region.id]}
                                stroke={edit.fills[region.id]}
                                className="zone"
                                onClick={(event) => selectRegion(region, event)}
                              />
                            ))}
                          </g>
                          <g fill="none" pointerEvents="none">
                            {visibleRegions
                              .filter((region) => highlightIds.has(region.id))
                              .map((region) => (
                                <path
                                  key={region.id}
                                  d={region.path}
                                  fillRule="evenodd"
                                  stroke="#22d3ee"
                                  strokeWidth="2"
                                  strokeLinejoin="round"
                                  vectorEffect="non-scaling-stroke"
                                />
                              ))}
                          </g>
                        </svg>

                        {selected && selectedColor && (
                          <Callout
                            selected={selected}
                            color={selectedColor}
                            count={selected.scope.length}
                            mode={mode}
                            onColor={(hex) => applyColor(selected.scope, hex)}
                            onMode={changeMode}
                            onDelete={() => hideIds(selected.scope)}
                            onClose={() => setSelected(null)}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="preview-placeholder">{busy ? 'Vectorizando…' : 'Aquí aparecerá tu imagen vectorizada.'}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="side-column">
                <div className="editor-card original-card">
                  <div className="preview-label-row">
                    <span>Original</span>
                    <strong>{fileName}</strong>
                  </div>
                  <img src={imageSrc} alt="Imagen original" className="original-image" />
                </div>

                <aside className="editor-card palette-card">
                  <div className="preview-label-row">
                    <span>Colores actuales</span>
                    <strong>{groups.length}</strong>
                  </div>

                  {groups.length ? (
                    <>
                      <div className="palette-rows">
                        {groups.map((group) => (
                          <div
                            key={group.ids[0]}
                            className="palette-row"
                            onMouseEnter={() => setHoverHex(group.hex)}
                            onMouseLeave={() => setHoverHex(null)}
                          >
                            <label className="swatch-input" style={{ backgroundColor: group.hex }} title="Cambiar este color en todas sus zonas">
                              <input
                                type="color"
                                value={group.hex}
                                onClick={snapshot}
                                onChange={(event) => applyColor(group.ids, normalizeHex(event.target.value))}
                              />
                            </label>
                            <div className="palette-meta">
                              <strong>{group.hex}</strong>
                              <span>
                                {group.percent < 1 ? '<1' : Math.round(group.percent)}% · {group.ids.length} {group.ids.length === 1 ? 'zona' : 'zonas'}
                              </span>
                            </div>
                            <button type="button" className="mini-button" title="Eliminar este color" onClick={() => hideIds(group.ids)}>
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="preset-row tight">
                        {Object.entries(palettePresets).map(([key, colors]) => (
                          <button key={key} type="button" onClick={() => applyPreset(key)} className={`preset-pill ${selectedPreset === key ? 'active' : ''}`}>
                            <span className="preset-swatches">
                              {colors.slice(0, 3).map((color) => (
                                <span key={color} className="preset-swatch" style={{ backgroundColor: color }} />
                              ))}
                            </span>
                            {key}
                          </button>
                        ))}
                      </div>

                      {hiddenCount > 0 && (
                        <p className="hint">
                          {hiddenCount} {hiddenCount === 1 ? 'zona eliminada' : 'zonas eliminadas'} · «Restaurar todo» {hiddenCount === 1 ? 'la recupera' : 'las recupera'}.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="empty-state-card">{busy ? 'Detectando colores…' : 'Sin colores todavía.'}</div>
                  )}
                </aside>
              </div>
            </div>
          )}
        </section>

        <section className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="feature-card">
              <div className="feature-icon">◇</div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  )
}
