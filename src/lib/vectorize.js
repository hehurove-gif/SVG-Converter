import { readPixels, segmentPixels } from './segment.js'

// Resolución de análisis según el ajuste de calidad (1 = normal, 2 = alta, 3 = muy alta).
export const RESOLUTIONS = [560, 900, 1300]

let worker = null
let counter = 0
const pending = new Map()

function getWorker() {
  if (worker || typeof Worker === 'undefined') return worker
  try {
    worker = new Worker(new URL('./segment.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      const { id, type } = event.data
      const job = pending.get(id)
      if (!job) return
      if (type === 'progress') job.onProgress?.(event.data.text)
      else {
        pending.delete(id)
        if (type === 'done') job.resolve(event.data.result)
        else job.reject(new Error(event.data.message))
      }
    }
    worker.onerror = () => {
      // Si el worker falla se vuelve al hilo principal.
      for (const job of pending.values()) job.reject(new Error('worker'))
      pending.clear()
      worker = null
    }
  } catch {
    worker = null
  }
  return worker
}

// Vectoriza en un Web Worker (con aviso de progreso). Si no hay worker, lo hace en el hilo principal.
export async function vectorize(image, params, onProgress) {
  const { resolution = 1, fixed = '', ...rest } = params
  const pixels = readPixels(image, RESOLUTIONS[resolution - 1] || RESOLUTIONS[0])
  const fixedColors = (String(fixed).match(/#?[0-9a-fA-F]{6}\b/g) || []).map((c) => (c.startsWith('#') ? c : `#${c}`))
  const options = { ...rest, fixedColors }

  const w = getWorker()
  if (!w) return segmentPixels(pixels, { ...options, onProgress })

  const id = ++counter
  try {
    return await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress })
      w.postMessage({ id, pixels, options }, [pixels.data.buffer])
    })
  } catch (error) {
    if (error.message !== 'worker') throw error
    return segmentPixels(readPixels(image, RESOLUTIONS[resolution - 1] || RESOLUTIONS[0]), { ...options, onProgress })
  }
}
