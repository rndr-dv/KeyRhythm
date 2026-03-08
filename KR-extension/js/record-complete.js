// record-complete.js — reads pending recording from session storage, saves to IDB

const titleInput  = document.getElementById('titleInput');
const artistInput = document.getElementById('artistInput');
const btnSave     = document.getElementById('btnSave');
const btnDiscard  = document.getElementById('btnDiscard');
const statusMsg   = document.getElementById('statusMsg');

let pendingRec = null;

async function init() {
  try {
    const result = await chrome.storage.session.get('kr_pending_rec');
    pendingRec = result.kr_pending_rec || null;
  } catch (_) {
    pendingRec = null;
  }

  if (!pendingRec) {
    statusMsg.textContent = 'No pending recording found.';
    statusMsg.style.color = 'var(--red)';
    btnSave.disabled = true;
    return;
  }

  // Pre-fill metadata
  titleInput.value = pendingRec.title || 'Live Recording';

  // Show meta info
  const notes    = pendingRec.notes || [];
  const laneCount = pendingRec.laneCount || 3;
  const audioBytes = pendingRec.audioBytes || [];

  document.getElementById('metaLanes').textContent   = `Lanes: ${laneCount}`;
  document.getElementById('metaNotes').textContent   = `Notes: ${notes.length}`;

  // Estimate duration from notes
  let dur = 0;
  if (notes.length > 0) {
    const last = notes[notes.length - 1];
    dur = (last.time || 0) + (last.duration || 0);
  }
  const mm = String(Math.floor(dur / 60)).padStart(2, '0');
  const ss = String(Math.floor(dur % 60)).padStart(2, '0');
  document.getElementById('metaDuration').textContent = `Duration: ${mm}:${ss}`;
}

btnSave.addEventListener('click', async () => {
  if (!pendingRec) return;
  btnSave.disabled = true;
  statusMsg.textContent = 'Saving…';
  statusMsg.style.color = 'var(--text-dim)';

  try {
    const id = 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const song = {
      id,
      title:     titleInput.value.trim() || 'Live Recording',
      artist:    artistInput.value.trim() || '',
      difficulty: '',
      offset:    0,
      laneCount: pendingRec.laneCount || 3,
      bpm:       0,
      notes:     pendingRec.notes || [],
      createdAt: Date.now(),
    };

    await saveSong(song);

    const audioBytes = pendingRec.audioBytes || [];
    if (audioBytes.length > 0) {
      const ab = new Uint8Array(audioBytes).buffer;
      await saveAudio(id, ab);
    }

    await chrome.storage.session.remove('kr_pending_rec');

    statusMsg.textContent = 'Saved! Opening editor…';
    statusMsg.style.color = 'var(--green)';
    setTimeout(() => { location.href = `editor.html?id=${id}`; }, 600);
  } catch (err) {
    btnSave.disabled = false;
    statusMsg.textContent = 'Error: ' + err.message;
    statusMsg.style.color = 'var(--red)';
  }
});

btnDiscard.addEventListener('click', async () => {
  await chrome.storage.session.remove('kr_pending_rec').catch(() => {});
  window.close();
});

init();
