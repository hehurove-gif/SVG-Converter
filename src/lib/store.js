// Guardado automático del trabajo en el navegador (IndexedDB). Nada sale del equipo del usuario.
const DB_NAME = 'svg-forge'
const STORE = 'work'

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run(mode, action) {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = action(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request?.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function saveWork(data) {
  try {
    await run('readwrite', (store) => store.put(data, 'current'))
  } catch {
    // Sin almacenamiento disponible: el guardado es opcional.
  }
}

export async function loadWork() {
  try {
    return (await run('readonly', (store) => store.get('current'))) || null
  } catch {
    return null
  }
}

export async function clearWork() {
  try {
    await run('readwrite', (store) => store.delete('current'))
  } catch {
    // ignorar
  }
}
