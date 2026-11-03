import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { clamp, hexToRgb, isValidHex, normalizeHex } from './lib/color.js'
import { analyzeImage, buildSvg, detectBackground, gradientDef, loadImage, segmentImage } from './lib/segment.js'
import { bake, initialEdit, isFollower, resolveView } from './lib/view.js'
import { clearWork, loadWork, saveWork } from './lib/store.js'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon']

const palettePresets = {
  vivid: ['#0F172A', '#2563EB', '#F59E0B', '#10B981', '#EF4444', '#F8FAFC'],
  pastel: ['#FDE68A', '#F9A8D4', '#BFDBFE', '#86EFAC', '#C4B5FD', '#FFFFFF'],
  mono: ['#111827', '#374151', '#6B7280', '#D1D5DB', '#F3F4F6', '#FFFFFF'],
  neon: ['#22D3EE', '#A78BFA', '#F472B6', '#FACC15', '#34D399', '#0F172A']
}

const DETAIL_LABELS = ['Mínimo', 'Bajo', 'Medio', 'Alto', 'Máximo']
const SMOOTH_LABELS = ['Sin suavizar', 'Suave', 'Más suave', 'Muy suave']

// Explicación corta de lo que hace cada ajuste en su valor actual.
const COLOR_HELP = (n) =>
  n <= 5
    ? 'Pocos colores: look de póster, formas grandes y simples. Ideal para logos.'
    : n <= 14
      ? 'Equilibrado: bueno para ilustraciones y personajes.'
      : n <= 24
        ? 'Muchos colores: más fiel, útil para fotos y degradados.'
        : 'Máximos colores: lo más parecido al original, pero con muchas zonas.'
const DETAIL_HELP = [
  'Ignora todo lo pequeño: solo quedan las formas grandes.',
  'Descarta manchas y detalles diminutos. SVG liviano y fácil de editar.',
  'Conserva detalles medianos (ojos, brillos grandes).',
  'Conserva casi todo, hasta detalles pequeños.',
  'Conserva hasta lo más diminuto (dientes, destellos) y no limpia el ruido de la imagen.'
]
const SMOOTH_HELP = [
  'Bordes exactos y algo angulosos. Para logos con esquinas rectas o cuando quieres máxima fidelidad.',
  'Bordes casi exactos con curvas ligeras. Buen punto de partida.',
  'Bordes redondeados y limpios. Bueno para personajes y dibujos.',
  'Bordes muy redondos: quita irregularidades pero también esquinas y líneas finas.'
]
const CALLOUT_WIDTH = 252

// Al volver a vectorizar con otros ajustes, las zonas cambian. Cada zona nueva hereda el cambio
// (color o eliminada) de la zona anterior que ocupaba la mayor parte de su superficie.
function carryEdits(oldSeg, oldEdit, newSeg) {
  const next = initialEdit(newSeg)
  if (!oldSeg?.regionMap || oldSeg.width !== newSeg.width || oldSeg.height !== newSeg.height) return { edit: next, kept: 0, total: 0 }

  const base = initialEdit(oldSeg)
  const changedOld = oldSeg.regions.filter((r) => oldEdit.hidden[r.id] || oldEdit.fills[r.id] !== base.fills[r.id]).length
  let kept = 0

  for (const region of newSeg.regions) {
    const votes = new Map()
    for (const p of region.samples) {
      const oldId = oldSeg.regionMap[p]
      if (oldId < 0) continue
      const key = oldEdit.hidden[oldId] ? 'hidden' : oldEdit.fills[oldId] !== base.fills[oldId] ? oldEdit.fills[oldId] : 'same'
      votes.set(key, (votes.get(key) || 0) + 1)
    }

    let best = 'same'
    let bestVotes = 0
    for (const [key, count] of votes) {
      if (count > bestVotes) {
        best = key
        bestVotes = count
      }
    }

    if (best === 'same' || bestVotes <= region.samples.length / 2) continue
    if (best === 'hidden') next.hidden[region.id] = true
    else {
      next.fills[region.id] = best
      if (region.mix) next.pinned[region.id] = true
    }
    kept += 1
  }

  return { edit: next, kept, total: changedOld }
}

async function exportSvgToPng(svgString, filename, { scale = 1, background = '' } = {}) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = url
    })

    const baseW = img.naturalWidth || 1200
    const baseH = img.naturalHeight || 1200
    const factor = Math.min(scale, 8192 / Math.max(baseW, baseH))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(baseW * factor)
    canvas.height = Math.round(baseH * factor)

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
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
function Callout({ selected, color, count, mode, onColor, onMode, onDelete, onMerge, onClose, onPickScreen }) {
  const picks = selected.picked?.length || 1
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

        <div className="hex-row">
          <HexInput value={color} onCommit={onColor} />
          {typeof window !== 'undefined' && 'EyeDropper' in window && (
            <button type="button" className="eyedropper-btn" onClick={onPickScreen} title="Cuentagotas: toma un color de cualquier punto de la pantalla (imagen original incluida)">
              ⌖
            </button>
          )}
        </div>
        {picks > 1 && <p className="callout-multi">{picks} zonas elegidas: el color se aplica a todas. Ctrl + clic para añadir o quitar.</p>}

        <div className="segmented small" role="group" aria-label="Alcance del cambio">
          <button type="button" className={mode === 'group' ? 'on' : ''} onClick={() => onMode('group')}>
            Mismo color ({count})
          </button>
          <button type="button" className={mode === 'region' ? 'on' : ''} onClick={() => onMode('region')}>
            Solo esta zona
          </button>
        </div>

        <button type="button" className="callout-merge" onClick={onMerge} title="Atajo: M">
          Fusionar con la vecina
        </button>
        <button type="button" className="callout-delete" onClick={onDelete} title="Atajo: Supr">
          Eliminar {count > 1 ? `estas ${count} zonas` : 'esta zona'}
        </button>
      </div>
    </>
  )
}

// Mensaje amable cuando la imagen es difícil, para que no parezca que la herramienta falló.
function buildAdvice(result, used) {
  if (!result.regions.length) return null
  const maxed = used.colors >= 28 && used.detail >= 5 && used.smooth === 0

  if (result.stats?.photo) {
    return {
      title: 'Esta imagen es una foto con muchos degradados',
      text: 'Los vectores funcionan mejor con logos e ilustraciones de colores planos. En una foto el resultado es una versión estilo pintura y es normal que se pierdan detalles muy finos; no es un error de la herramienta.',
      action: maxed ? null : { label: 'Probar con más detalle', params: { colors: Math.min(32, Math.max(used.colors, 24) + 4), detail: 5, smooth: 0 } }
    }
  }

  if (result.regions.length > 260) {
    return {
      title: `Salieron ${result.regions.length} zonas`,
      text: 'La imagen tiene muchos tonos parecidos. Para un SVG más ligero y fácil de editar puedes bajar los colores o el detalle.',
      action: { label: 'Simplificar', params: { colors: Math.max(6, Math.round(used.colors * 0.6)), detail: Math.max(1, used.detail - 1), smooth: Math.max(used.smooth, 2) } }
    }
  }

  return null
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
  const [applied, setApplied] = useState(null)
  const [advice, setAdvice] = useState(null)
  const autoTuneRef = useRef(false)
  const paramsRef = useRef(params)
  paramsRef.current = params
  const [seg, setSeg] = useState(null)
  const [edit, setEdit] = useState({ fills: {}, hidden: {}, pinned: {}, grads: {}, adjust: { h: 0, s: 0, l: 0 } })
  const [history, setHistory] = useState([])
  const [future, setFuture] = useState([])
  const actionsRef = useRef({})
  const liveRef = useRef({ seg: null, edit: null })
  const [backup, setBackup] = useState(null)
  const [toast, setToast] = useState('')
  const [saved, setSaved] = useState(null)
  const [multiMode, setMultiMode] = useState(false)
  const [peek, setPeek] = useState(false)
  const [pngScale, setPngScale] = useState(2)
  const [pngBg, setPngBg] = useState('transparent')
  const wrapRef = useRef(null)
  const zoomAnchor = useRef(null)
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0, left: 0, top: 0 })
  const pendingRestoreRef = useRef(null)
  const clipRef = useRef('')
  const toastTimer = useRef(null)
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

        // Imagen recién subida: elige ajustes según su tipo (logo/ilustración o foto).
        let used = { ...paramsRef.current }
        const isNewImage = autoTuneRef.current || Boolean(pendingRestoreRef.current)
        if (autoTuneRef.current) {
          autoTuneRef.current = false
          used = { ...analyzeImage(image).params }
          setParams(used)
        }
        const result = segmentImage(image, used)
        setApplied(used)
        if (cancelled) return

        setAdvice(buildAdvice(result, used))

        setImageSize({ width: image.width, height: image.height })
        const previous = liveRef.current
        const hadEdits = !isNewImage && previous.seg && previous.edit
        let carried = hadEdits ? carryEdits(previous.seg, previous.edit, result) : { edit: initialEdit(result), kept: 0, total: 0 }

        // Trabajo guardado: se recupera si la vectorización coincide con la que se guardó.
        const restore = pendingRestoreRef.current
        pendingRestoreRef.current = null
        let restoredNote = ''
        if (restore) {
          if (restore.sig === result.regions.length) {
            carried = { edit: { ...initialEdit(result), ...restore.edit }, kept: 0, total: 0 }
            restoredNote = 'Trabajo recuperado con todos tus cambios.'
          } else {
            restoredNote = 'Se recuperó la imagen, pero no se pudieron restaurar los cambios de color.'
          }
        }

        setSeg(result)
        setEdit(carried.edit)
        setHistory([])
        setFuture([])
        setSelected(null)
        setBackup(carried.total ? { seg: previous.seg, edit: previous.edit, params: previous.params } : null)
        setNotice(
          restoredNote ||
            (!result.regions.length
            ? 'No se encontraron zonas de color en la imagen.'
            : carried.total
              ? carried.kept
                ? `Ajustes aplicados. Se conservaron tus cambios en ${carried.kept} ${carried.kept === 1 ? 'zona' : 'zonas'}; revisa que todo siga como lo dejaste.`
                : 'Ajustes aplicados. Las zonas cambiaron tanto que no se pudieron conservar tus cambios de color.'
              : '')
        )
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
  }, [imageSrc, runId])

  useEffect(() => {
    loadWork().then((work) => {
      if (work?.imageSrc && work?.edit) setSaved(work)
    })
  }, [])

  // Autoguardado (solo si hay cambios hechos por el usuario).
  useEffect(() => {
    if (!seg || !imageSrc || !applied) return undefined
    const changed = JSON.stringify(edit) !== JSON.stringify(initialEdit(seg))
    if (!changed) return undefined

    const timer = setTimeout(() => {
      saveWork({ imageSrc, fileName, params: applied, edit, sig: seg.regions.length, savedAt: Date.now() })
    }, 900)
    return () => clearTimeout(timer)
  }, [seg, edit, imageSrc, fileName, applied])

  const restoreWork = () => {
    if (!saved) return
    pendingRestoreRef.current = saved
    autoTuneRef.current = false
    setParams(saved.params)
    setFileName(saved.fileName || '')
    setSaved(null)
    setImageSrc(saved.imageSrc)
    setRunId((n) => n + 1)
  }

  const discardWork = () => {
    setSaved(null)
    clearWork()
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') setSelected(null)

      // Ctrl/Cmd+Z deshace, Ctrl/Cmd+Y (o Ctrl/Cmd+Shift+Z) rehace. En campos de texto se deja el atajo nativo.
      const target = event.target
      const typing = target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && !target.classList.contains('hex-input') && !['range', 'color', 'checkbox', 'file'].includes(target.type)))
      if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === 'Delete' || event.key === 'Backspace') {
          if (actionsRef.current.deleteSelected?.()) event.preventDefault()
        } else if (event.key.toLowerCase() === 'm') {
          actionsRef.current.mergeSelected?.()
        } else if (event.key.toLowerCase() === 'o') {
          setPeek(true)
        }
      }
      if (typing || !(event.ctrlKey || event.metaKey) || event.altKey) return

      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        actionsRef.current.undo?.()
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        actionsRef.current.redo?.()
      }
    }
    const onResize = () => setSelected(null)
    const isTyping = (target) =>
      target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && !['range', 'color', 'checkbox', 'file'].includes(target.type)))

    // Ctrl + C copia el color de la zona elegida; Ctrl + V lo pega en la(s) zona(s) seleccionada(s).
    const onCopy = (event) => {
      if (isTyping(event.target) || String(window.getSelection?.() || '')) return
      const hex = actionsRef.current.copyColor?.()
      if (hex) {
        event.clipboardData?.setData('text/plain', hex)
        event.preventDefault()
      }
    }
    const onPaste = (event) => {
      if (isTyping(event.target)) return
      if (actionsRef.current.pasteColor?.(event.clipboardData?.getData('text'))) event.preventDefault()
    }
    const onKeyUp = (event) => {
      if (event.key.toLowerCase() === 'o') setPeek(false)
    }
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    document.addEventListener('copy', onCopy)
    document.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('paste', onPaste)
    }
  }, [])

  // Zoom con Ctrl + rueda (o pellizco) centrado en el cursor, y arrastre para moverse.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined

    const onWheel = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      const wrapRect = wrap.getBoundingClientRect()
      zoomAnchor.current = { rx: (event.clientX - rect.left) / rect.width, ry: (event.clientY - rect.top) / rect.height, mx: event.clientX - wrapRect.left, my: event.clientY - wrapRect.top }
      setZoom((z) => Math.min(8, Math.max(1, Math.round(z * Math.exp(-event.deltaY * 0.0015) * 100) / 100)))
    }

    const onDown = (event) => {
      if (event.button !== 0 && event.button !== 1) return
      dragRef.current = { active: true, moved: false, x: event.clientX, y: event.clientY, left: wrap.scrollLeft, top: wrap.scrollTop }
    }
    const onMove = (event) => {
      const d = dragRef.current
      if (!d.active || !wrap.classList.contains('zoomed')) return
      const dx = event.clientX - d.x
      const dy = event.clientY - d.y
      if (!d.moved && Math.hypot(dx, dy) < 6) return
      d.moved = true
      wrap.scrollLeft = d.left - dx
      wrap.scrollTop = d.top - dy
    }
    const onUp = () => {
      dragRef.current.active = false
    }
    const onClickCapture = (event) => {
      if (dragRef.current.moved) {
        event.stopPropagation()
        event.preventDefault()
        dragRef.current.moved = false
      }
    }

    wrap.addEventListener('wheel', onWheel, { passive: false })
    wrap.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    wrap.addEventListener('click', onClickCapture, true)
    return () => {
      wrap.removeEventListener('wheel', onWheel)
      wrap.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      wrap.removeEventListener('click', onClickCapture, true)
    }
  }, [seg])

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current
    const wrap = wrapRef.current
    const stage = stageRef.current
    if (!anchor || !wrap || !stage) return
    zoomAnchor.current = null
    const rect = stage.getBoundingClientRect()
    const wrapRect = wrap.getBoundingClientRect()
    wrap.scrollLeft += rect.left + anchor.rx * rect.width - (wrapRect.left + anchor.mx)
    wrap.scrollTop += rect.top + anchor.ry * rect.height - (wrapRect.top + anchor.my)
  }, [zoom])

  const view = useMemo(() => (seg ? resolveView(seg, edit) : { fills: {}, hidden: {}, grads: {} }), [seg, edit])
  const visibleRegions = useMemo(() => (seg ? seg.regions.filter((r) => !view.hidden[r.id]) : []), [seg, view])

  // Colores actuales agrupados: todas las zonas con exactamente el mismo color.
  const groups = useMemo(() => {
    if (!seg) return []

    const map = new Map()
    let total = 0

    for (const region of seg.regions) {
      if (isFollower(region, edit)) continue
      total += region.area
      if (view.hidden[region.id]) continue

      const hex = view.fills[region.id]
      const group = map.get(hex) || { hex, area: 0, ids: [] }
      group.area += region.area
      group.ids.push(region.id)
      map.set(hex, group)
    }

    return [...map.values()]
      .sort((a, b) => b.area - a.area)
      .map((group) => ({ ...group, percent: total ? (group.area / total) * 100 : 0 }))
  }, [seg, edit, view])

  const highlightIds = useMemo(() => {
    const ids = new Set()
    if (selected) selected.scope.forEach((id) => ids.add(id))
    if (hoverHex) groups.find((g) => g.hex === hoverHex)?.ids.forEach((id) => ids.add(id))
    return ids
  }, [selected, hoverHex, groups])

  liveRef.current = { seg, edit, params: applied }
  const hiddenCount = Object.keys(edit.hidden).length
  const selectedColor = selected ? view.fills[selected.id] : null

  const snapshot = () => {
    setFuture([])
    setHistory((current) => {
      const last = current[current.length - 1]
      if (last && JSON.stringify(last) === JSON.stringify(edit)) return current
      return [...current.slice(-40), edit]
    })
  }

  const undo = () => {
    const now = JSON.stringify(edit)
    let index = history.length - 1
    while (index >= 0 && JSON.stringify(history[index]) === now) index -= 1

    if (index < 0) {
      setHistory([])
      return
    }

    setFuture((current) => [...current, edit])
    setEdit(history[index])
    setHistory(history.slice(0, index))
    setSelected(null)
  }

  const redo = () => {
    if (!future.length) return
    const next = future[future.length - 1]
    setFuture(future.slice(0, -1))
    setHistory((current) => [...current.slice(-40), edit])
    setEdit(next)
    setSelected(null)
  }

  const copyColor = () => {
    if (!selected) return null
    const hex = view.fills[selected.id]
    if (!hex) return null
    clipRef.current = hex
    showToast(`Color ${hex} copiado`)
    return hex
  }

  const pasteColor = (text) => {
    if (!selected) return false
    const typed = /^#?[0-9a-fA-F]{6}$/.test((text || '').trim()) ? normalizeHex((text || '').trim().replace(/^#?/, '#')) : ''
    const hex = typed || clipRef.current
    if (!hex) return false
    snapshot()
    applyColor(selected.scope, hex)
    showToast(`Color ${hex} pegado en ${selected.scope.length} ${selected.scope.length === 1 ? 'zona' : 'zonas'}`)
    return true
  }

  actionsRef.current = {
    undo,
    redo,
    copyColor,
    pasteColor,
    deleteSelected: () => {
      if (!selected) return false
      hideIds(selected.scope)
      return true
    },
    mergeSelected: () => selected && mergeIds(selected.scope)
  }

  const resetAll = () => {
    if (!seg) return
    snapshot()
    setEdit(initialEdit(seg))
    setSelected(null)
    setNotice('')
    setSelectedPreset('')
  }

  const computeScope = (ids, nextMode) => {
    const list = Array.isArray(ids) ? ids : [ids]
    if (nextMode === 'region' || !seg) return list
    const colors = new Set(list.map((id) => view.fills[id]))
    return seg.regions
      .filter((r) => !view.hidden[r.id] && (list.includes(r.id) || (!isFollower(r, edit) && colors.has(view.fills[r.id]))))
      .map((r) => r.id)
  }

  const showToast = (text) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }

  const selectRegion = (region, event) => {
    event.stopPropagation()
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return

    snapshot()

    // Ctrl/Cmd + clic: añade o quita zonas de la selección para cambiarles el color juntas.
    if ((event.ctrlKey || event.metaKey || multiMode) && selected) {
      const current = selected.picked || [selected.id]
      const picked = current.includes(region.id) ? current.filter((id) => id !== region.id) : [...current, region.id]
      if (!picked.length) {
        setSelected(null)
        return
      }
      setSelected({
        id: picked[picked.length - 1],
        picked,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        w: rect.width,
        scope: computeScope(picked, mode)
      })
      return
    }

    setSelected({
      id: region.id,
      picked: [region.id],
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      w: rect.width,
      scope: computeScope([region.id], mode)
    })
  }

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setSelected((current) => (current ? { ...current, scope: computeScope(current.picked || [current.id], nextMode) } : current))
  }

  const applyColor = (ids, hex) => {
    setEdit((raw) => {
      const current = bake(raw)
      const fills = { ...current.fills }
      const pinned = { ...current.pinned }
      for (const id of ids) {
        fills[id] = hex
        pinned[id] = true
      }
      return { ...current, fills, pinned }
    })
  }

  // Pinta cada zona elegida con el color de la vecina con la que comparte más borde (sin dejar huecos).
  const mergeIds = (ids) => {
    if (!seg) return
    const set = new Set(ids)
    const baked = bake(edit)
    const fills = { ...baked.fills }
    const pinned = { ...baked.pinned }
    let merged = 0

    for (const id of ids) {
      const region = seg.regions.find((r) => r.id === id)
      const target = region?.nb.find(([nid]) => !set.has(nid) && !view.hidden[nid])
      if (!target) continue
      fills[id] = view.fills[target[0]]
      pinned[id] = true
      merged += 1
    }

    if (!merged) {
      showToast('No hay una zona vecina visible con la que fusionar.')
      return
    }

    snapshot()
    setEdit({ ...baked, fills, pinned })
    setSelected(null)
    showToast(`${merged} ${merged === 1 ? 'zona fusionada' : 'zonas fusionadas'} con su vecina`)
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
    setEdit((raw) => {
      const current = bake(raw)
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
      setEdit({ fills: {}, hidden: {}, pinned: {}, grads: {}, adjust: { h: 0, s: 0, l: 0 } })
      setHistory([])
      setFuture([])
      setSelected(null)
      setNotice('')
      setFileName(file.name.replace(/\.[^/.]+$/, ''))
      setZoom(1)
      setAdvice(null)
      autoTuneRef.current = true
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

  const currentSvg = () => (seg ? buildSvg(seg, view.fills, view.hidden, imageSize, view.grads) : '')

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

  const writeClipboard = async (text, done) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(done)
    } catch {
      setError('El navegador no permitió copiar. Prueba de nuevo o revisa los permisos del portapapeles.')
    }
  }

  const copySvgCode = () => {
    const svg = currentSvg()
    if (svg) writeClipboard(svg, 'Código SVG copiado')
  }

  const copyPalette = () => writeClipboard(groups.map((g) => g.hex).join('\n'), `Paleta de ${groups.length} colores copiada`)

  // Pega una lista de códigos hex y los asigna a los colores actuales en orden (de más a menos área).
  const pastePalette = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const colors = (text.match(/#?[0-9a-fA-F]{6}\b/g) || []).map((c) => normalizeHex(c))
      if (!colors.length) {
        showToast('El portapapeles no tiene códigos de color (#RRGGBB).')
        return
      }
      snapshot()
      setEdit((raw) => {
        const current = bake(raw)
        const fills = { ...current.fills }
        const pinned = { ...current.pinned }
        groups.forEach((group, index) => {
          if (index >= colors.length) return
          for (const id of group.ids) {
            fills[id] = colors[index]
            pinned[id] = true
          }
        })
        return { ...current, fills, pinned }
      })
      showToast(`Paleta pegada (${Math.min(colors.length, groups.length)} colores)`)
    } catch {
      setError('El navegador no permitió leer el portapapeles. Pulsa «Permitir» si lo pide.')
    }
  }

  const downloadPng = async () => {
    const svg = currentSvg()
    if (!svg) return

    try {
      await exportSvgToPng(svg, fileName || 'imagen-vectorizada', { scale: pngScale, background: pngBg === 'transparent' ? '' : pngBg })
    } catch {
      setError('No se pudo exportar el PNG.')
    }
  }

  const pending = Boolean(applied) && JSON.stringify(applied) !== JSON.stringify(params)
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

          {!imageSrc && saved && (
            <div className="restore-box" role="status">
              <div>
                <strong>Tienes un trabajo guardado{saved.fileName ? `: «${saved.fileName}»` : ''}</strong>
                <p>Se guardó automáticamente en este navegador{saved.savedAt ? ` el ${new Date(saved.savedAt).toLocaleString()}` : ''}. Tu imagen nunca sale de tu equipo.</p>
              </div>
              <div className="advice-actions">
                <button type="button" className="advice-btn" onClick={restoreWork}>
                  Restaurar
                </button>
                <button type="button" className="advice-close" aria-label="Descartar" onClick={discardWork}>
                  ✕
                </button>
              </div>
            </div>
          )}

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
                </div>

                <div className="tool-group">
                  <p className="tool-title">Edición</p>
                  <button type="button" className="tool-btn" onClick={removeBackground} disabled={!ready || busy}>
                    <span className="tool-icon">◌</span>Eliminar fondo
                  </button>
                  <button type="button" className="tool-btn" onClick={undo} disabled={!history.length} title="Deshacer (Ctrl + Z)">
                    <span className="tool-icon">↶</span>Deshacer
                  </button>
                  <button type="button" className="tool-btn" onClick={redo} disabled={!future.length} title="Rehacer (Ctrl + Y)">
                    <span className="tool-icon">↷</span>Rehacer
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
                  <button type="button" className={`tool-btn ${multiMode ? 'primary' : ''}`} aria-pressed={multiMode} onClick={() => setMultiMode((v) => !v)} title="Equivale a mantener Ctrl al hacer clic">
                    <span className="tool-icon">{multiMode ? '☑' : '☐'}</span>Selección múltiple
                  </button>
                  <button
                    type="button"
                    className="tool-btn"
                    onPointerDown={() => setPeek(true)}
                    onPointerUp={() => setPeek(false)}
                    onPointerLeave={() => setPeek(false)}
                    disabled={!ready}
                    title="Mantén pulsado (o la tecla O) para ver la imagen original"
                  >
                    <span className="tool-icon">◐</span>Ver original (mantener)
                  </button>
                </div>

                <div className="tool-group">
                  <p className="tool-title">Ajuste global de color</p>
                  {[
                    ['h', 'Tono', -180, 180],
                    ['s', 'Saturación', -100, 100],
                    ['l', 'Brillo', -60, 60]
                  ].map(([key, label, min, max]) => (
                    <label className="tool-slider" key={key}>
                      <span>
                        {label} <strong>{edit.adjust?.[key] || 0}</strong>
                      </span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step="1"
                        value={edit.adjust?.[key] || 0}
                        disabled={!ready}
                        onPointerDown={snapshot}
                        onChange={(e) => setEdit((current) => ({ ...current, adjust: { h: 0, s: 0, l: 0, ...current.adjust, [key]: Number(e.target.value) } }))}
                      />
                    </label>
                  ))}
                  <div className="tool-row">
                    <button
                      type="button"
                      className="tool-btn"
                      disabled={!ready || !(edit.adjust?.h || edit.adjust?.s || edit.adjust?.l)}
                      onClick={() => {
                        snapshot()
                        setEdit((current) => ({ ...current, adjust: { h: 0, s: 0, l: 0 } }))
                      }}
                    >
                      Restablecer
                    </button>
                  </div>
                  <p className="hint">Prueba variantes de toda la imagen a la vez. Si luego editas una zona, el ajuste se fija en los colores.</p>
                </div>

                <div className="tool-group">
                  <p className="tool-title">Ajustes</p>
                  <label className="tool-slider">
                    <span>
                      Cantidad de colores <strong>{params.colors}</strong>
                    </span>
                    <input type="range" min="2" max="32" step="1" value={params.colors} onChange={(e) => setParam('colors', Number(e.target.value))} />
                    <small className="slider-help">{COLOR_HELP(params.colors)}</small>
                  </label>
                  <label className="tool-slider">
                    <span>
                      Detalle de formas <strong>{DETAIL_LABELS[params.detail - 1]}</strong>
                    </span>
                    <input type="range" min="1" max="5" step="1" value={params.detail} onChange={(e) => setParam('detail', Number(e.target.value))} />
                    <small className="slider-help">{DETAIL_HELP[params.detail - 1]}</small>
                  </label>
                  <label className="tool-slider">
                    <span>
                      Suavizado de bordes <strong>{SMOOTH_LABELS[params.smooth]}</strong>
                    </span>
                    <input type="range" min="0" max="3" step="1" value={params.smooth} onChange={(e) => setParam('smooth', Number(e.target.value))} />
                    <small className="slider-help">{SMOOTH_HELP[params.smooth]}</small>
                  </label>
                  <button type="button" className={`tool-btn ${pending ? 'primary' : ''}`} onClick={() => setRunId((n) => n + 1)} disabled={!pending || busy}>
                    <span className="tool-icon">{pending ? '✦' : '✓'}</span>
                    {busy ? 'Vectorizando…' : pending ? 'Aplicar ajustes' : 'Ajustes aplicados'}
                  </button>
                  <details className="guide">
                    <summary>¿Cuándo usar cada ajuste?</summary>
                    <ul>
                      <li><strong>Bajar colores</strong> si es un logo o dibujo plano, o si salen demasiadas zonas parecidas que no quieres editar una por una.</li>
                      <li><strong>Subir colores</strong> si es una foto o tiene degradados y se ve plana o pierde tonos.</li>
                      <li><strong>Subir detalle</strong> si se pierden ojos, dientes, brillos o líneas finas. <strong>Bajarlo</strong> si hay manchitas sueltas o quieres un SVG más liviano.</li>
                      <li><strong>Suavizar</strong> redondea los bordes y quita el aspecto de escalones; no los hace más marcados. Para esquinas rectas o texto, déjalo en «Sin suavizar» o «Suave».</li>
                      <li>Si algo se ve mal, cambia <strong>un ajuste a la vez</strong> y pulsa «Aplicar ajustes».</li>
                    </ul>
                  </details>
                  <p className="hint">
                    {pending
                      ? 'Hay ajustes sin aplicar. Al aplicarlos se vuelve a vectorizar y se intentan conservar tus cambios de color y las zonas eliminadas.'
                      : 'La imagen se vectoriza sola al subirla. Mueve los ajustes y pulsa «Aplicar ajustes» para repetirlo.'}
                  </p>
                </div>

                <div className="tool-group">
                  <p className="tool-title">Exportar</p>
                  <button type="button" className="tool-btn success" onClick={downloadSvg} disabled={!ready}>
                    <span className="tool-icon">⤓</span>Descargar SVG
                  </button>
                  <button type="button" className="tool-btn" onClick={downloadPng} disabled={!ready}>
                    <span className="tool-icon">⤓</span>Exportar PNG
                  </button>
                  <div className="tool-row">
                    <label className="tool-select">
                      <span>Tamaño</span>
                      <select value={pngScale} onChange={(e) => setPngScale(Number(e.target.value))}>
                        <option value={1}>1× (original)</option>
                        <option value={2}>2×</option>
                        <option value={4}>4×</option>
                      </select>
                    </label>
                    <label className="tool-select">
                      <span>Fondo</span>
                      <select value={pngBg} onChange={(e) => setPngBg(e.target.value)}>
                        <option value="transparent">Transparente</option>
                        <option value="#FFFFFF">Blanco</option>
                        <option value="#000000">Negro</option>
                      </select>
                    </label>
                  </div>
                  <button type="button" className="tool-btn" onClick={copySvgCode} disabled={!ready}>
                    <span className="tool-icon">⧉</span>Copiar código SVG
                  </button>
                  <button type="button" className="tool-btn" onClick={copyPalette} disabled={!ready}>
                    <span className="tool-icon">⧉</span>Copiar paleta
                  </button>
                  <button type="button" className="tool-btn" onClick={pastePalette} disabled={!ready}>
                    <span className="tool-icon">⎘</span>Pegar paleta
                  </button>
                </div>
              </aside>

              <div className="stage-column">
                {error && <div className="error-box">{error}</div>}
                {notice && (
                  <div className="notice-box">
                    {notice}
                    {backup && (
                      <button
                        type="button"
                        className="notice-link"
                        onClick={() => {
                          setSeg(backup.seg)
                          setEdit(backup.edit)
                          setParams(backup.params)
                          setApplied(backup.params)
                          setHistory([])
                          setFuture([])
                          setSelected(null)
                          setBackup(null)
                          setNotice('Volviste a la versión anterior con tus cambios.')
                        }}
                      >
                        Volver a la versión anterior
                      </button>
                    )}
                  </div>
                )}
                {toast && (
                  <div className="toast" role="status">
                    {toast}
                  </div>
                )}
                {advice && !busy && (
                  <div className="advice-box" role="status">
                    <div>
                      <strong>{advice.title}</strong>
                      <p>{advice.text}</p>
                    </div>
                    <div className="advice-actions">
                      {advice.action && (
                        <button
                          type="button"
                          className="advice-btn"
                          onClick={() => {
                            setParams(advice.action.params)
                            setRunId((n) => n + 1)
                          }}
                        >
                          {advice.action.label}
                        </button>
                      )}
                      <button type="button" className="advice-close" aria-label="Cerrar aviso" onClick={() => setAdvice(null)}>
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                <div className="editor-card vector-card">
                  <div className="preview-label-row">
                    <span>Vector · clic en una zona · Ctrl + clic para elegir varias · Ctrl + C / V copia y pega el color</span>
                    <div className="zoom-controls">
                      <button type="button" onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.5) * 10) / 10))} disabled={zoom <= 1} aria-label="Alejar">
                        −
                      </button>
                      <span>{Math.round(zoom * 100)}%</span>
                      <button type="button" onClick={() => setZoom((z) => Math.min(8, Math.round((z + 0.5) * 10) / 10))} disabled={zoom >= 8} aria-label="Acercar">
                        +
                      </button>
                      <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1}>
                        Ajustar
                      </button>
                    </div>
                    <strong>{ready ? `${visibleRegions.length} zonas` : '—'}</strong>
                  </div>

                  <div ref={wrapRef} className={`stage-wrap ${zoom > 1 ? 'zoomed' : ''}`}>
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
                          {Object.keys(view.grads).length > 0 && (
                            <defs>
                              {Object.entries(view.grads).map(([id, g]) => (
                                <g key={id} dangerouslySetInnerHTML={{ __html: gradientDef(id, g).replace(`id="g${id}"`, `id="zg${id}"`) }} />
                              ))}
                            </defs>
                          )}
                          <g fillRule="evenodd" strokeWidth="0.6" strokeLinejoin="round">
                            {visibleRegions.map((region) => (
                              <path
                                key={region.id}
                                d={region.path}
                                fill={view.grads[region.id] ? `url(#zg${region.id})` : view.fills[region.id]}
                                stroke={view.grads[region.id] ? `url(#zg${region.id})` : view.fills[region.id]}
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

                        {peek && <img src={imageSrc} alt="Original" className="peek-img" draggable={false} />}

                        {selected && selectedColor && (
                          <Callout
                            selected={selected}
                            color={selectedColor}
                            count={selected.scope.length}
                            mode={mode}
                            onColor={(hex) => applyColor(selected.scope, hex)}
                            onMode={changeMode}
                            onDelete={() => hideIds(selected.scope)}
                            onMerge={() => mergeIds(selected.scope)}
                            onPickScreen={async () => {
                              try {
                                const result = await new window.EyeDropper().open()
                                snapshot()
                                applyColor(selected.scope, normalizeHex(result.sRGBHex))
                              } catch {
                                // cancelado
                              }
                            }}
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
