// IndexedDB wrapper for KeyRhythm
// Stores: songs (metadata + notes), audio (ArrayBuffer), backgrounds (Blob)

const DB_NAME = 'keyrhythm_db';
const DB_VER  = 3;

let _dbPromise = null;

function _open() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('songs'))
        db.createObjectStore('songs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audio'))
        db.createObjectStore('audio', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('playlists'))
        db.createObjectStore('playlists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('backgrounds'))
        db.createObjectStore('backgrounds', { keyPath: 'id' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => { _dbPromise = null; reject(e.target.error); };
  });
  return _dbPromise;
}

function _txPut(storeName, value) {
  return _open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  }));
}

function _txGet(storeName, key) {
  return _open().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  }));
}

function _txGetAll(storeName) {
  return _open().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  }));
}

function _txDelete(storeName, key) {
  return _open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  }));
}

// Song CRUD
function saveSong(song)    { return _txPut('songs', song); }
function getSong(id)       { return _txGet('songs', id); }
function getAllSongs()      { return _txGetAll('songs'); }
function deleteSong(id)    {
  return Promise.all([_txDelete('songs', id), _txDelete('audio', id)]);
}
function updateLastPlayed(id) {
  return getSong(id).then(song => { if (song) return saveSong({ ...song, lastPlayedAt: Date.now() }); });
}

// Audio CRUD  (store raw ArrayBuffer)
function saveAudio(id, arrayBuffer) { return _txPut('audio', { id, data: arrayBuffer }); }
function getAudio(id) {
  return _txGet('audio', id).then(row => row ? row.data : null);
}

// Playlist CRUD
function savePlaylist(pl)    { return _txPut('playlists', pl); }
function getPlaylist(id)     { return _txGet('playlists', id); }
function getAllPlaylists()    { return _txGetAll('playlists'); }
function deletePlaylist(id)  { return _txDelete('playlists', id); }

// Background CRUD  (store { id, data: Blob, type: 'image'|'video', mimeType })
function saveBg(entry)   { return _txPut('backgrounds', entry); }
function getBg(id)       { return _txGet('backgrounds', id); }
function deleteBg(id)    { return _txDelete('backgrounds', id); }

// ── KRZ2 serialization ────────────────────────────────────────────────────────
async function writeKRZ2(songObj, audioAB) {
  const meta = {
    version: '2.0', title: songObj.title, artist: songObj.artist || '',
    difficulty: songObj.difficulty || '', offset: songObj.offset || 0,
    laneCount: songObj.laneCount || 3, bpm: songObj.bpm || 0, notes: songObj.notes,
  };
  const jsonStr = JSON.stringify(meta);
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(jsonStr));
  writer.close();
  const gzipAB  = await new Response(stream.readable).arrayBuffer();
  const gzipLen = gzipAB.byteLength;
  const audioLen = audioAB ? audioAB.byteLength : 0;
  const total    = 4 + 4 + gzipLen + audioLen;
  const out      = new Uint8Array(total);
  out[0] = 0x4B; out[1] = 0x52; out[2] = 0x5A; out[3] = 0x32; // "KRZ2"
  new DataView(out.buffer).setUint32(4, gzipLen, true);
  out.set(new Uint8Array(gzipAB), 8);
  if (audioAB) out.set(new Uint8Array(audioAB), 8 + gzipLen);
  return out.buffer;
}

async function readKRZ2(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 8) throw new Error('Too short');
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'KRZ2') return null;
  const gzipLen = new DataView(arrayBuffer).getUint32(4, true);
  const gzipAB  = arrayBuffer.slice(8, 8 + gzipLen);
  const stream  = new DecompressionStream('gzip');
  const writer2 = stream.writable.getWriter();
  writer2.write(new Uint8Array(gzipAB));
  writer2.close();
  const jsonAB  = await new Response(stream.readable).arrayBuffer();
  const data    = JSON.parse(new TextDecoder().decode(jsonAB));
  data._audioAB = gzipLen + 8 < bytes.length ? arrayBuffer.slice(8 + gzipLen) : null;
  return data;
}
