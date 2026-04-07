// ── CONFIG ──
const sb = supabase.createClient(
  'https://fhfrocvcbmkoidlvbury.supabase.co',
  'sb_publishable_vT2HG-9np9RLJlLJ_gcUjw__aqiiUwo'
);

const SAFE_LABELS = ['', 'extremely rekt', 'risky ser', 'degen approved', 'comfy homeless', 'ultra safe (tokyo tier)'];
const TYPE_COLORS = { rooftop: '#c8a96e', beach: '#4a9e6a', park: '#4a9e6a', forest: '#4a9e6a', bridge: '#e84040', other: '#888' };

// Share templates — rotate per click
const SHARE_TEMPLATES = [
  (name, city, url) => `NGMI shelter spotted in ${city}: ${name} 🛌 ${url}`,
  (name, city, url) => `${name} in ${city} — mapped on SleepingBag.finance 🛌 ${url}`,
  (name, city, url) => `A sleeping spot in ${city}: ${name} 🛌 ${url}`,
];
let shareTemplateIdx = 0;

// ── XSS PROTECTION ──
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── TOAST ──
function toast(msg, dur = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}

// ── RENDER ──
function renderPlace(p) {
  const type = p.type || 'other';
  const city = p.city || '';
  const desc = p.description || '';
  const safety = Math.min(Math.max(parseInt(p.safety) || 0, 0), 5);
  const col = TYPE_COLORS[type] || '#888';

  // Photo
  const photoEl = document.getElementById('place-photo');
  if (p.photo_url) {
    photoEl.style.backgroundImage = `url(${p.photo_url})`;
  } else {
    photoEl.style.display = 'none';
  }

  // Meta
  const typeEl = document.getElementById('place-type');
  typeEl.textContent = type.toUpperCase();
  typeEl.style.color = col;

  document.getElementById('place-name').textContent = (p.gold ? '★ ' : '') + (p.name || '');
  document.getElementById('place-city').textContent = city;

  // Safety
  const dotsEl = document.getElementById('place-safety-dots');
  for (let i = 0; i < 5; i++) {
    const d = document.createElement('div');
    d.className = 'sd' + (i < safety ? ' on' : '');
    if (i < safety) d.style.background = col;
    dotsEl.appendChild(d);
  }
  document.getElementById('place-safety-lbl').textContent = SAFE_LABELS[safety] || '';

  // Description
  document.getElementById('place-desc').textContent = desc;

  // Tags
  if (p.tags && p.tags.length) {
    const tagsEl = document.getElementById('place-tags');
    tagsEl.innerHTML = p.tags.map(t => `<div class="tag">#${esc(t)}</div>`).join('');
    document.getElementById('tags-section').style.display = 'block';
  }

  // Open on Map CTA
  document.getElementById('btn-map').href = `/?spot=${p.id}`;

  // Page title + meta description
  document.title = `${p.name || 'Spot'} · ${city} — SleepingBag.finance`;
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.name = 'description';
    document.head.appendChild(metaDesc);
  }
  metaDesc.content = `${p.name || 'Sleeping spot'} in ${city}. ${desc.slice(0, 140)}`;

  // Show card
  document.getElementById('state-loading').style.display = 'none';
  document.getElementById('place-wrap').style.display = 'block';
}

// ── SHARE ──
function getPlaceURL() {
  return window.location.href;
}

function buildShareText(p) {
  const fn = SHARE_TEMPLATES[shareTemplateIdx % SHARE_TEMPLATES.length];
  shareTemplateIdx++;
  const name = p.name || 'Sleeping spot';
  const city = p.city || null;
  const url  = getPlaceURL();
  if (!city) {
    return `${name} — mapped on SleepingBag.finance 🛌 ${url}`;
  }
  return fn(name, city, url);
}

let currentPlace = null;
let pendingShareText = null; // frozen for current share action

async function handleShare() {
  if (!currentPlace) return;
  pendingShareText = buildShareText(currentPlace); // freeze once per action

  if (navigator.share) {
    try {
      await navigator.share({
        title: currentPlace.name,
        text: pendingShareText,
        url: getPlaceURL(),
      });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  document.getElementById('share-fallback').classList.add('show');
}

function shareToX() {
  if (!currentPlace) return;
  const text = pendingShareText || buildShareText(currentPlace);
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(tweetUrl, '_blank', 'noopener,noreferrer');
}

function copyLink() {
  const url = getPlaceURL();
  navigator.clipboard.writeText(url).then(() => {
    toast('Link copied 🛌');
  }).catch(() => {
    // fallback for browsers without clipboard API
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    toast('Link copied 🛌');
  });
}

// ── INIT ──
async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    showNotFound();
    return;
  }

  const { data, error } = await sb
    .from('places')
    .select('id, name, city, type, description, safety, tags, gold, photo_url')
    .eq('id', id)
    .eq('status', 'approved')
    .single();

  if (error || !data) {
    showNotFound();
    return;
  }

  currentPlace = data;
  renderPlace(data);
}

function showNotFound() {
  document.getElementById('state-loading').style.display = 'none';
  document.getElementById('state-notfound').style.display = 'flex';
}

init();
