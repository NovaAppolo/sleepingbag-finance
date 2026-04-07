const sb = supabase.createClient(
  'https://fhfrocvcbmkoidlvbury.supabase.co',
  'sb_publishable_vT2HG-9np9RLJlLJ_gcUjw__aqiiUwo'
);

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function toast(msg, dur=3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}

let currentUser = null;
let profileData = null;
let editOpen = false;

async function init() {
  document.getElementById('p-edit-name').oninput = updateCharCounts;
  document.getElementById('p-edit-bio').oninput  = updateCharCounts;

  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;

  sb.auth.onAuthStateChange((_e, session) => {
    currentUser = session?.user ?? null;
    if (!currentUser) showNoAuth();
  });

  if (!currentUser) { showNoAuth(); return; }
  showProfile();
  await Promise.all([loadProfile(), loadSaved(), loadVisited(), loadSpots(), loadComments()]);
}

function showNoAuth() {
  document.getElementById('state-loading').style.display = 'none';
  document.getElementById('state-noauth').style.display  = 'flex';
  document.getElementById('profile-page').style.display  = 'none';
  document.getElementById('signout-btn').style.display   = 'none';
}

function showProfile() {
  document.getElementById('state-loading').style.display = 'none';
  document.getElementById('state-noauth').style.display  = 'none';
  document.getElementById('profile-page').style.display  = 'block';
  document.getElementById('signout-btn').style.display   = 'flex';
}

function handleLabel(user) {
  const wallet = user.user_metadata?.address;
  if (wallet) return wallet.slice(0,6) + '\u2026' + wallet.slice(-4);
  if (user.email) return user.email.split('@')[0];
  return 'anon';
}

async function loadProfile() {
  const { data, error } = await sb
    .from('profiles')
    .select('display_name, bio')
    .eq('id', currentUser.id)
    .single();
  profileData = (!error && data) ? data : { display_name: null, bio: null };
  renderIdentity();
}

function renderIdentity() {
  const handle      = handleLabel(currentUser);
  const displayName = profileData?.display_name || handle;
  const bio         = profileData?.bio || '';
  document.getElementById('p-avatar').textContent       = displayName.charAt(0).toUpperCase();
  document.getElementById('p-display-name').textContent = displayName;
  document.getElementById('p-handle').textContent       = '@' + handle;
  if (bio) {
    document.getElementById('p-bio').textContent         = bio;
    document.getElementById('p-bio').style.display       = 'block';
    document.getElementById('p-bio-empty').style.display = 'none';
  } else {
    document.getElementById('p-bio').style.display       = 'none';
    document.getElementById('p-bio-empty').style.display = 'block';
  }
  document.getElementById('p-edit-name').value = profileData?.display_name || '';
  document.getElementById('p-edit-bio').value  = profileData?.bio || '';
  updateCharCounts();
}

function toggleEditForm() {
  editOpen = !editOpen;
  document.getElementById('p-edit-form').classList.toggle('open', editOpen);
  if (editOpen) document.getElementById('p-edit-name').focus();
}

function updateCharCounts() {
  const nameEl = document.getElementById('p-edit-name');
  const bioEl  = document.getElementById('p-edit-bio');
  if (nameEl) document.getElementById('p-name-chars').textContent = 40 - nameEl.value.length;
  if (bioEl)  document.getElementById('p-bio-chars').textContent  = 160 - bioEl.value.length;
}

async function saveProfile() {
  const display_name = document.getElementById('p-edit-name').value.trim() || null;
  const bio          = document.getElementById('p-edit-bio').value.trim() || null;
  const btn = document.getElementById('p-save-btn');
  btn.disabled = true; btn.textContent = 'saving...';
  const { error } = await sb.from('profiles').upsert(
    { id: currentUser.id, display_name, bio, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );
  btn.disabled = false; btn.textContent = 'SAVE';
  if (error) { toast('error saving: ' + error.message); return; }
  profileData = { display_name, bio };
  renderIdentity();
  toggleEditForm();
  toast('profile saved \u2713');
}

async function loadSaved() {
  const { data, error } = await sb
    .from('saved_places')
    .select('place_id, created_at, places(id, name, city, type, status)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  const body    = document.getElementById('p-saved-body');
  const countEl = document.getElementById('p-saved-count');

  if (error || !data) { body.innerHTML = '<div class="p-empty">could not load saved places</div>'; return; }

  const valid = data.filter(r => r.places); // скрываем если место удалено
  countEl.textContent = valid.length ? valid.length + ' total' : '';

  if (!valid.length) {
    body.innerHTML = '<div class="p-empty">no saved spots yet \u2014 explore the map</div>';
    return;
  }

  body.innerHTML = valid.map(r => {
    const p           = r.places;
    const date        = new Date(r.created_at).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'});
    const unavailable = p.status !== 'approved';
    return `<div class="p-spot-item">
      <div>
        <div class="p-spot-name">${unavailable?'<span style="color:var(--text-dim)">[unavailable]</span> ':''}${esc(p.name)}</div>
        <div class="p-spot-meta">${esc(p.city)} \u00b7 ${esc(p.type)} \u00b7 saved ${date}</div>
      </div>
      ${!unavailable?`<a href="/?spot=${esc(p.id)}" class="p-spot-link">VIEW \u2192</a>`:''}
    </div>`;
  }).join('');
}

async function loadVisited() {
  const { data, error } = await sb
    .from('visited_places')
    .select('place_id, created_at, places(id, name, city, type, status)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  const body    = document.getElementById('p-visited-body');
  const countEl = document.getElementById('p-visited-count');

  if (error || !data) { body.innerHTML = '<div class="p-empty">could not load visited places</div>'; return; }

  const valid = data.filter(r => r.places);
  countEl.textContent = valid.length ? valid.length + ' total' : '';

  if (!valid.length) {
    body.innerHTML = '<div class="p-empty">no visited spots yet \u2014 mark places you\'ve slept at</div>';
    return;
  }

  body.innerHTML = valid.map(r => {
    const p           = r.places;
    const date        = new Date(r.created_at).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'});
    const unavailable = p.status !== 'approved';
    return `<div class="p-spot-item">
      <div>
        <div class="p-spot-name">${unavailable?'<span style="color:var(--text-dim)">[unavailable]</span> ':''}${esc(p.name)}</div>
        <div class="p-spot-meta">${esc(p.city)} \u00b7 ${esc(p.type)} \u00b7 marked ${date}</div>
      </div>
      ${!unavailable?`<a href="/?spot=${esc(p.id)}" class="p-spot-link">VIEW \u2192</a>`:''}
    </div>`;
  }).join('');
}

async function loadSpots() {
  const { data, error } = await sb
    .from('places')
    .select('id, name, city, type, status, created_at')
    .eq('created_by', currentUser.id)
    .order('created_at', { ascending: false });
  const body    = document.getElementById('p-spots-body');
  const countEl = document.getElementById('p-spots-count');
  if (error || !data) { body.innerHTML = '<div class="p-empty">could not load spots</div>'; return; }
  countEl.textContent = data.length ? data.length + ' total' : '';
  if (!data.length) {
    body.innerHTML = '<div class="p-empty">no spots submitted yet \u2014 <a href="/" style="color:var(--gold)">add one</a></div>';
    return;
  }
  const cls = { approved:'p-status-approved', pending:'p-status-pending', hidden:'p-status-hidden' };
  body.innerHTML = data.map(p => {
    const date = new Date(p.created_at).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'});
    return `<div class="p-spot-item">
      <div>
        <div class="p-spot-name">${esc(p.name)}</div>
        <div class="p-spot-meta">${esc(p.city)} \u00b7 ${esc(p.type)} \u00b7 ${date}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
        <div class="p-status ${cls[p.status]||'p-status-pending'}">${p.status.toUpperCase()}</div>
        ${p.status==='approved'?`<a href="/?spot=${esc(p.id)}" class="p-spot-link">VIEW \u2192</a>`:''}
      </div>
    </div>`;
  }).join('');
}

async function loadComments() {
  const { data, error } = await sb
    .from('place_comments')
    .select('id, text, created_at, places(name)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(30);
  const body    = document.getElementById('p-comments-body');
  const countEl = document.getElementById('p-comments-count');
  if (error || !data) { body.innerHTML = '<div class="p-empty">could not load comments</div>'; return; }
  countEl.textContent = data.length ? data.length + ' total' : '';
  if (!data.length) { body.innerHTML = '<div class="p-empty">no comments yet</div>'; return; }
  body.innerHTML = data.map(c => {
    const name = c.places?.name || 'unknown spot';
    const date = new Date(c.created_at).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'});
    return `<div class="p-comment-item">
      <div class="p-comment-place">\ud83d\udccd ${esc(name)}</div>
      <div class="p-comment-text">${esc(c.text)}</div>
      <div class="p-comment-date">${date}</div>
    </div>`;
  }).join('');
}

async function doSignOut() {
  await sb.auth.signOut();
  window.location.href = '/';
}

init();
