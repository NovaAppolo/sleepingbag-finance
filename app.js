// ── WALLET (Base-only) ──
const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_ID_HEX = '0x2105';
const BASE_CHAIN_CONFIG = {
  chainId: BASE_CHAIN_ID_HEX,
  chainName: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org']
};

let walletAddress = null;
let walletProvider = null;
let walletReady = false; // true only when connected + Base network

function updateWalletBtn() {
  const btn = document.getElementById('wallet-btn');
  // если есть auth session через wallet
  if (currentUser && currentUser.user_metadata?.address) {
    const addr = currentUser.user_metadata.address;
    btn.textContent = addr.slice(0,6) + '\u2026' + addr.slice(-4);
    btn.className = 'connected';
    btn.id = 'wallet-btn';
    return;
  }
  if (!walletAddress) {
    btn.textContent = '🔗 CONNECT';
    btn.className = '';
    btn.id = 'wallet-btn';
    return;
  }
  const short = walletAddress.slice(0,6) + '\u2026' + walletAddress.slice(-4);
  if (walletReady) {
    btn.textContent = short;
    btn.className = 'connected';
  } else {
    btn.textContent = '\u26a0 ' + short;
    btn.className = 'wrong-network';
  }
  btn.id = 'wallet-btn';
}

async function checkNetwork() {
  if (!window.ethereum || !walletAddress) { walletReady = false; return; }
  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  walletReady = parseInt(chainId, 16) === BASE_CHAIN_ID;
  updateWalletBtn();
  if (!walletReady) offerSwitch();
}

async function offerSwitch() {
  toast('wrong network ser — switching to Base...');
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_CHAIN_ID_HEX }] });
  } catch (e) {
    if (e.code === 4902) {
      try {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [BASE_CHAIN_CONFIG] });
      } catch { toast('could not add Base network'); }
    } else if (e.code === 4001) {
      toast('ser you need Base network to use wallet features');
    }
  }
}

async function connectWallet() {
  // если уже auth через wallet — disconnect полностью
  if (currentUser && walletAddress) { await disconnectWallet(); return; }
  // если просто connected без auth — идём в auth
  if (walletAddress) { await signInWithWallet(); return; }
  if (!window.ethereum) { toast('ser install MetaMask first'); return; }
  try {
    walletProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await walletProvider.send('eth_requestAccounts', []);
    walletAddress = accounts[0];
    await checkNetwork();
    updateWalletBtn();
    // сразу идём в auth
    await signInWithWallet();
  } catch (e) {
    if (e.code === 4001) toast('ser you rejected the connection');
    else toast('connection failed');
  }
}

async function disconnectWallet() {
  await sb.auth.signOut();
  currentUser = null;
  walletAddress = null;
  walletProvider = null;
  walletReady = false;
  updateWalletBtn();
  updateAuthUI();
  toast('disconnected');
}

// auto-sync wallet state из Supabase session при загрузке
// wallet vars синхронизируем только если auth session уже есть
window.addEventListener('load', async () => {
  if (!window.ethereum) return;
  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
  if (!accounts.length) return;
  // не устанавливаем walletAddress без auth — initAuth подхватит session
  // только checkNetwork нужен для Base-only логики если сессия уже есть
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user?.user_metadata?.address) {
    walletProvider = new ethers.BrowserProvider(window.ethereum);
    walletAddress = accounts[0];
    await checkNetwork();
  }
});

// handle account/chain changes
if (window.ethereum) {
  window.ethereum.on('accountsChanged', accs => {
    if (!accs.length) { disconnectWallet(); return; }
    walletAddress = accs[0];
    checkNetwork();
  });
  window.ethereum.on('chainChanged', () => {
    checkNetwork();
  });
}

// helper: check wallet is ready before crypto actions
function requireWallet() {
  if (!walletAddress) { toast('connect wallet first ser'); return false; }
  if (!walletReady) { offerSwitch(); return false; }
  return true;
}

// ── SUPABASE + MAP INIT ──
mapboxgl.accessToken = 'pk.eyJ1Ijoia29kYWtnb2xkIiwiYSI6ImNtbm1jcnp4NDFlcW4yc3MxdGNpbjd0amUifQ.dsA_k9-ASZ-2OAmgmt7Pew';

const sb = supabase.createClient(
  'https://fhfrocvcbmkoidlvbury.supabase.co',
  'sb_publishable_vT2HG-9np9RLJlLJ_gcUjw__aqiiUwo'
);

// anon_id — постоянный ID устройства
function getAnonId() {
  let id = localStorage.getItem('sbf_anon_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('sbf_anon_id', id); }
  return id;
}
const ANON_ID = getAnonId();

// ── AUTH STATE ──
let currentUser = null;

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;
  updateAuthUI();

  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    updateAuthUI();
    updateWalletBtn();
    if (currentUser) closeAuthModal();
  });
}

function updateAuthUI() {
  const indicator = document.getElementById('auth-indicator');
  const mobRow = document.getElementById('mob-auth-row');
  if (currentUser) {
    const email = currentUser.email;
    const wallet = currentUser.user_metadata?.address;
    const label = wallet
      ? wallet.slice(0,6) + '\u2026' + wallet.slice(-4)
      : email
        ? email.split('@')[0]
        : 'anon';
    const inner =
      '<span class="auth-ind-dot on"></span>' +
      '<a class="auth-ind-label" href="/profile.html">' + esc(label) + '</a>' +
      '<button class="auth-ind-out" onclick="signOut()">sign out</button>';
    if (indicator) { indicator.innerHTML = inner; indicator.classList.add('visible'); }
    if (mobRow) { mobRow.innerHTML = inner; mobRow.classList.add('visible'); }
  } else {
    if (indicator) { indicator.innerHTML = ''; indicator.classList.remove('visible'); }
    if (mobRow) { mobRow.innerHTML = ''; mobRow.classList.remove('visible'); }
  }
}

async function signInWithWallet() {
  if (!window.ethereum) { toast('ser install MetaMask first'); return; }
  const btn = document.getElementById('auth-wallet-btn');
  try {
    if (btn) btn.textContent = 'signing...';
    const { error } = await sb.auth.signInWithWeb3({
      chain: 'ethereum',
      statement: 'Sign in to SleepingBag.finance — the rekt campers atlas.'
    });
    if (error) {
      toast('wallet sign-in failed: ' + error.message);
      if (btn) btn.textContent = '🦊 Continue with Wallet';
      return;
    }
    // onAuthStateChange подхватит session → updateAuthUI + closeAuthModal
    toast('gm ser 🛌');
  } catch (e) {
    toast('wallet sign-in error');
    if (btn) btn.textContent = '🦊 Continue with Wallet';
  }
}

async function signInWithEmail() {
  const input = document.getElementById('auth-email-input');
  const email = input?.value.trim();
  if (!email || !email.includes('@')) { toast('ser — enter a valid email'); return; }

  const btn = document.getElementById('auth-email-btn');
  if (btn) btn.textContent = 'sending...';

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: 'https://sleepingbag.finance' }
  });

  if (error) {
    toast('error: ' + error.message);
    if (btn) btn.textContent = 'Send Magic Link';
    return;
  }

  // показываем confirmation state внутри modal
  const body = document.getElementById('auth-modal-body');
  if (body) {
    body.innerHTML = `
      <div class="auth-sent">
        <div class="auth-sent-icon">📬</div>
        <div class="auth-sent-title">Check your inbox</div>
        <div class="auth-sent-text">Magic link sent to <b>${esc(email)}</b><br>Click it to sign in — no password needed.</div>
      </div>
    `;
  }
}

async function signOut() {
  await sb.auth.signOut();
  currentUser = null;
  walletAddress = null;
  walletProvider = null;
  walletReady = false;
  updateAuthUI();
  updateWalletBtn();
  toast('signed out ser');
}

// ── AUTH MODAL ──
function openAuthModal() {
  const modal = document.getElementById('auth-modal-bg');
  if (!modal) return;
  // reset body на случай если был email-sent state
  document.getElementById('auth-modal-body').innerHTML = authModalBodyHTML();
  modal.classList.add('open');
}

function closeAuthModal() {
  document.getElementById('auth-modal-bg')?.classList.remove('open');
}

function closeAuthBg(e) {
  if (e.target === document.getElementById('auth-modal-bg')) closeAuthModal();
}

function authModalBodyHTML() {
  const hasEthereum = typeof window.ethereum !== 'undefined';
  return `
    ${hasEthereum ? `
    <button class="auth-wallet-btn" id="auth-wallet-btn" onclick="connectWallet()">
      🦊 Continue with Wallet
    </button>
    <div class="auth-or"><span>or</span></div>
    ` : ''}
    <div class="auth-email-group">
      <input class="auth-email-input" id="auth-email-input" type="email" placeholder="your@email.com" autocomplete="email">
      <button class="auth-email-btn" id="auth-email-btn" onclick="signInWithEmail()">Send Magic Link</button>
    </div>
    <div class="auth-note">No account? Created automatically on first sign in.</div>
  `;
}

const PLACES = [
  { id:1,  name:"Barceloneta North End",      city:"Barcelona, Spain",        type:"beach",   desc:"Soft sand, warm nights May–Oct. 4G to watch your portfolio bleed all night. Mossos patrol at 3am but they've seen worse degens than you, fren.", safety:4, votes:312, tags:["wifi","4g","warm","scenic","police-occasional"], gold:true,  lat:41.385,  lng:2.196   },
  { id:2,  name:"Pompidou Rooftop Adjacent",  city:"Paris, France",            type:"rooftop", desc:"Pigeons will judge you. Panoramic view of the city you can no longer afford. Wind is brutal after midnight. Bring two sleeping bags, ser.", safety:2, votes:89,  tags:["scenic","windy","pigeons","security-risk"], gold:false, lat:48.861,  lng:2.352   },
  { id:3,  name:"Odaiba Seaside Park",         city:"Tokyo, Japan",             type:"park",    desc:"Ultra safe. Vending machines 50m away. Sleeping in parks is basically cultural here. No one will bother you. Tokyo tier comfort.", safety:5, votes:541, tags:["vending-machines","ultra-safe","wifi","tokyo-tier"], gold:true,  lat:35.626,  lng:139.774 },
  { id:4,  name:"Lumphini Park East Gate",     city:"Bangkok, Thailand",        type:"park",    desc:"Portfolio -90% but cost of living -95%. Crocodiles in the lake — cheaper than your leveraged longs. Mosquito net required.", safety:3, votes:203, tags:["cheap","mosquitos","crocodiles","warm","4g"], gold:false, lat:13.728,  lng:100.541 },
  { id:5,  name:"Signal Hill Slope",           city:"Cape Town, South Africa",  type:"park",    desc:"10/10 would lose savings again. Ocean view at dawn. Zero light pollution for staring at your red PnL.", safety:2, votes:67,  tags:["scenic","windy","remote","risky-at-night"], gold:true,  lat:-33.918, lng:18.408  },
  { id:6,  name:"Copacabana Wall",             city:"Rio de Janeiro, Brazil",   type:"beach",   desc:"Warm year-round. Locals will invite you to play footvolley. Don't mention crypto — they lost their LUNA bags too.", safety:2, votes:44,  tags:["warm","social","risky","no-rain"], gold:false, lat:-22.971, lng:-43.183 },
  { id:7,  name:"Vondelpark Central",          city:"Amsterdam, Netherlands",   type:"park",    desc:"Technically legal before 1am. Brings its own philosophical irony when you sold ETH at $80. Ducks will steal your snacks.", safety:4, votes:178, tags:["legal","ducks","wifi","mild-weather"], gold:false, lat:52.358,  lng:4.869   },
  { id:8,  name:"Under BKK Expressway",        city:"Bangkok, Thailand",        type:"bridge",  desc:"Zero stars. Absolute degen territory. But dry when monsoon hits. Motorway noise drowns out your internal monologue about the rug pull.", safety:1, votes:22,  tags:["dry","loud","extreme-degen","risky"], gold:false, lat:13.744,  lng:100.501 },
  { id:9,  name:"Central Park Ramble",         city:"New York, USA",            type:"park",    desc:"Historic tradition of sleeping here. Bloomberg tried to stop it, didn't work. Good 5G for monitoring your Coinbase balance crash.", safety:3, votes:156, tags:["5g","historic","police-occasional","urban"], gold:false, lat:40.779,  lng:-73.966 },
  { id:10, name:"Bondi Beach Cliff Path",      city:"Sydney, Australia",        type:"beach",   desc:"Surf culture means nobody judges alternative living. Sunrise at 5am will make you forget you're down 97%. Bring a windbreaker, ser.", safety:4, votes:231, tags:["scenic","surfers","sunrise","wind"], gold:true,  lat:-33.890, lng:151.274 },
  { id:11, name:"Santa Monica Pier Underpass", city:"Los Angeles, USA",         type:"bridge",  desc:"Degen HQ of the West Coast. Half the people here made and lost millions in DeFi. United in vibes.", safety:2, votes:88,  tags:["community","degen-hq","police","ocean-breeze"], gold:false, lat:34.010,  lng:-118.497},
  { id:12, name:"Shinjuku Gyoen Corner",       city:"Tokyo, Japan",             type:"park",    desc:"Closes at dusk officially but the east fence has seen things. Cherry blossoms in April make portfolio -80% feel almost poetic.", safety:4, votes:302, tags:["tokyo-tier","seasonal","fence","scenic"], gold:false, lat:35.685,  lng:139.710 },
  { id:13, name:"Bali Rice Terrace Edge",      city:"Ubud, Indonesia",          type:"forest",  desc:"Digital nomad gone final form. $8/day total budget. Locals think you are spiritual. You are. Nothing humbles like losing $200k on a shitcoin.", safety:4, votes:189, tags:["spiritual","cheap","rice-fields","wifi-nearby"], gold:true,  lat:-8.519,  lng:115.262 },
  { id:14, name:"Trocadero Gardens Wall",      city:"Paris, France",            type:"park",    desc:"Eiffel Tower hourly light show as your personal emotional support. Still costs €0. Unlike your hedge fund that cost €200k.", safety:3, votes:94,  tags:["scenic","eiffel","tourists","wind"], gold:false, lat:48.862,  lng:2.289   },
  { id:15, name:"Princes Street Gardens",      city:"Edinburgh, Scotland",      type:"park",    desc:"Technically illegal but Scotland has seen worse. Castle backdrop. Cold is character building.", safety:3, votes:61,  tags:["cold","castle-view","wind"], gold:false, lat:55.951,  lng:-3.196  }
];

// ── STATE ──
let filter = 'all';
let selId = null;
let safety = 3;
let nextId = 100;
let voted = new Set();
let markers = {};
let popupPlaceId = null;
let drawerExpanded = false;
let chatOpen = false;
const isMobile = () => window.innerWidth <= 768;

const tcol = t => ({ rooftop:'#c8a96e', beach:'#4a9e6a', park:'#4a9e6a', forest:'#4a9e6a', bridge:'#e84040', other:'#888' }[t] || '#888');
const safe_lbl = ['','extremely rekt','risky ser','degen approved','comfy homeless','ultra safe (tokyo tier)'];

// ── MAP ──
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v11',
  center: [20, 25],
  zoom: 1.8,
  minZoom: 1,
  projection: 'mercator'
});
map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
map.on('load', async () => {
  await initAuth();
  const { data, error } = await sb.from('places').select('*').order('votes_count', { ascending: false });
  if (data && !error) {
    PLACES.length = 0;
    data.forEach(p => PLACES.push({
      id: p.id, name: p.name, city: p.city, type: p.type,
      desc: p.description, safety: p.safety, votes: p.votes_count,
      tags: p.tags || [], gold: p.gold, lat: p.lat, lng: p.lng,
      photo_url: p.photo_url || null
    }));
  }
  buildMarkers(); renderList(); updateStats(); initChat(); initPendingBanner();
});
map.on('click', () => { hidePopup(); if (!isMobile()) desel(); });

// ── XSS PROTECTION ──
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// ── POPUP ──
const popupEl  = document.getElementById('popup');
const popupBox = document.getElementById('popup-box');

function showPopup(p) {
  popupPlaceId = p.id;
  const col = tcol(p.type);

  // photo (только если есть)
  const photoEl = document.getElementById('pb-photo');
  if (p.photo_url) {
    photoEl.style.backgroundImage = 'url(' + p.photo_url + ')';
    photoEl.style.display = 'block';
  } else {
    photoEl.style.display = 'none';
  }

  document.getElementById('pb-type').textContent = p.type.toUpperCase();
  document.getElementById('pb-type').style.color = col;
  document.getElementById('pb-name').textContent = (p.gold ? '★ ' : '') + p.name;
  document.getElementById('pb-city').textContent = p.city;
  document.getElementById('pb-votes').textContent = p.votes;
  const dotsEl = document.getElementById('pb-sdots');
  dotsEl.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const d = document.createElement('div');
    d.className = 'pb-sd' + (i < p.safety ? ' on' : '');
    if (i < p.safety) d.style.background = col;
    dotsEl.appendChild(d);
  }
  document.getElementById('pb-btn').onclick = e => {
    e.stopPropagation();
    hidePopup();
    if (isMobile()) openMobDetail(p);
    else sel(p.id, false);
  };
  positionPopup(p);
  popupEl.classList.add('show');
}

function positionPopup(p) {
  const pt = map.project([p.lng, p.lat]);
  popupEl.style.left = pt.x + 'px';
  popupEl.style.top  = pt.y + 'px';
}

function hidePopup() {
  popupPlaceId = null;
  popupEl.classList.remove('show');
}

map.on('move', () => { if (popupPlaceId !== null) { const p = PLACES.find(x => x.id === popupPlaceId); if (p) positionPopup(p); } });
popupEl.addEventListener('click', e => e.stopPropagation());

// ── MARKERS ──
function buildMarkers() {
  Object.values(markers).forEach(m => m.marker.remove());
  markers = {};
  const arr = filter === 'all' ? PLACES : PLACES.filter(p => p.type === filter);
  arr.forEach(p => {
    const col = tcol(p.type);
    const size = p.gold ? 15 : 11;
    const el = document.createElement('div');
    el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${col};box-shadow:0 0 0 3px ${col}44;cursor:pointer;will-change:box-shadow;`;
    el.addEventListener('mouseenter', () => { el.style.boxShadow = `0 0 0 7px ${col}55`; });
    el.addEventListener('mouseleave', () => { el.style.boxShadow = selId === p.id ? `0 0 0 8px ${col}66` : `0 0 0 3px ${col}44`; });
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (popupPlaceId === p.id) hidePopup();
      else showPopup(p);
    });
    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
    markers[p.id] = { marker, el, col };
  });
}

function highlightMarker(id) {
  Object.entries(markers).forEach(([mid, { el, col }]) => {
    el.style.boxShadow = mid === id ? `0 0 0 8px ${col}66` : `0 0 0 3px ${col}44`;
  });
}

// ── SELECT (desktop) ──
function sel(id, fly = true) {
  selId = id;
  const p = PLACES.find(x => x.id === id);
  if (!p) return;
  if (fly) map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 10), duration: 800, essential: true });
  highlightMarker(id);
  renderDetail(p);
  renderList();
}

function desel() {
  if (!selId) return;
  selId = null;
  highlightMarker(null);
  document.getElementById('right-empty').style.display = 'flex';
  const d = document.getElementById('right-detail');
  d.classList.remove('show');
  d.innerHTML = '';
  renderList();
}

// ── MOBILE DETAIL ──
function openMobDetail(p) {
  const col = tcol(p.type);
  const isVoted = voted.has(p.id);
  const dots = (n, c) => Array(5).fill(0).map((_,i) =>
    `<div style="width:8px;height:8px;border-radius:50%;background:${i<n?c:'#2a2a2a'}"></div>`
  ).join('');

  document.getElementById('mob-detail-inner').innerHTML = `
    <div class="d-badge" style="color:${col}">${p.type.toUpperCase()}</div>
    <div class="d-name">${p.gold ? '★ ' : ''}${esc(p.name)}</div>
    <div class="d-city">${esc(p.city)}</div>
    <div class="d-sec">
      <div class="d-lbl">Field Report</div>
      <div class="d-txt">${esc(p.desc)}</div>
    </div>
    <div class="d-sec">
      <div class="d-lbl">Safety</div>
      <div class="d-srow">
        <div style="display:flex;gap:4px">${dots(p.safety, col)}</div>
        <div class="d-slbl">${safe_lbl[p.safety]}</div>
      </div>
    </div>
    <div class="d-sec">
      <div class="d-lbl">Tags</div>
      <div class="d-tags">${p.tags.map(t => `<div class="d-tag">#${esc(t)}</div>`).join('')}</div>
    </div>
    <div class="d-vote-row">
      <button id="mob-vote-btn" class="${isVoted?'voted':''}" data-id="${esc(p.id)}">${isVoted?'✓ VOTED':'▲ VOTE'}</button>
      <div id="mob-vote-count">${p.votes} <span>degens survived here</span></div>
    </div>
    <div class="d-sec d-comments-sec">
      <div class="d-lbl">Comments <span id="mob-comments-count" class="d-comments-count"></span></div>
      <div id="mob-comments-list" class="comments-list"></div>
      <div id="mob-comments-form" class="comments-form" style="display:none">
        <textarea id="mob-comment-input" class="comment-input" placeholder="share your field report..." maxlength="500"></textarea>
        <div class="comment-form-row">
          <span id="mob-comment-chars" class="comment-chars">500</span>
          <button id="mob-comment-submit" class="comment-submit" onclick="submitComment('${esc(p.id)}','mob')">POST</button>
        </div>
      </div>
      <div id="mob-comments-auth" class="comments-auth-note" style="display:none">
        <button onclick="openAuthModal()">Sign in to comment</button>
      </div>
    </div>
  `;
  document.getElementById('mob-detail').classList.add('show');
  document.getElementById('mob-vote-btn').onclick = () => doVote(p.id);
  const mobInput = document.getElementById('mob-comment-input');
  if (mobInput) mobInput.oninput = () => {
    const el = document.getElementById('mob-comment-chars');
    if (el) el.textContent = 500 - mobInput.value.length;
  };
  loadComments(p.id, 'mob');
}

function closeMobDetail() {
  document.getElementById('mob-detail').classList.remove('show');
}

// ── DESKTOP DETAIL ──
function renderDetail(p) {
  document.getElementById('right-empty').style.display = 'none';
  const d = document.getElementById('right-detail');
  d.classList.add('show');
  const col = tcol(p.type);
  const isVoted = voted.has(p.id);
  const dots = (n, c) => Array(5).fill(0).map((_,i) =>
    `<div style="width:8px;height:8px;border-radius:50%;background:${i<n?c:'#2a2a2a'}"></div>`
  ).join('');

  d.innerHTML = `
    <button class="d-close" onclick="desel()">✕ CLOSE</button>
    <div class="d-badge" style="color:${col}">${p.type.toUpperCase()}</div>
    <div class="d-name">${p.gold ? '★ ' : ''}${esc(p.name)}</div>
    <div class="d-city">${esc(p.city)}</div>
    <div class="d-sec"><div class="d-lbl">Field Report</div><div class="d-txt">${esc(p.desc)}</div></div>
    <div class="d-sec">
      <div class="d-lbl">Safety</div>
      <div class="d-srow"><div style="display:flex;gap:4px">${dots(p.safety,col)}</div><div class="d-slbl">${safe_lbl[p.safety]}</div></div>
    </div>
    <div class="d-sec"><div class="d-lbl">Tags</div><div class="d-tags">${p.tags.map(t=>`<div class="d-tag">#${esc(t)}</div>`).join('')}</div></div>
    <div class="d-vote-row">
      <button id="vote-btn" class="${isVoted?'voted':''}" data-id="${esc(p.id)}">${isVoted?'✓ VOTED':'▲ VOTE'}</button>
      <div id="vote-count">${p.votes} <span>degens survived here</span></div>
    </div>
    <div class="d-sec d-comments-sec">
      <div class="d-lbl">Comments <span id="desk-comments-count" class="d-comments-count"></span></div>
      <div id="desk-comments-list" class="comments-list"></div>
      <div id="desk-comments-form" class="comments-form" style="display:none">
        <textarea id="desk-comment-input" class="comment-input" placeholder="share your field report..." maxlength="500"></textarea>
        <div class="comment-form-row">
          <span id="desk-comment-chars" class="comment-chars">500</span>
          <button id="desk-comment-submit" class="comment-submit" onclick="submitComment('${esc(p.id)}','desk')">POST</button>
        </div>
      </div>
      <div id="desk-comments-auth" class="comments-auth-note" style="display:none">
        <button onclick="openAuthModal()">Sign in to comment</button>
      </div>
    </div>
  `;
  document.getElementById('vote-btn').onclick = () => doVote(p.id);
  const deskInput = document.getElementById('desk-comment-input');
  if (deskInput) deskInput.oninput = () => {
    const el = document.getElementById('desk-comment-chars');
    if (el) el.textContent = 500 - deskInput.value.length;
  };
  loadComments(p.id, 'desk');
}

async function doVote(id) {
  if (voted.has(id)) { toast('ser you already voted'); return; }
  const { error } = await sb.from('place_votes').insert({ place_id: id, anon_id: ANON_ID });
  if (error) { toast(error.code === '23505' ? 'ser you already voted' : 'error voting'); return; }
  const p = PLACES.find(x => x.id === id);
  if (!p) return;
  p.votes++;
  voted.add(id);
  if (isMobile()) openMobDetail(p);
  else renderDetail(p);
  renderList();
  updateStats();
  toast('▲ Voted! WAGMI fren 🛌');
}

// ── LIST ──
function renderList() {
  const arr = filter === 'all' ? PLACES : PLACES.filter(p => p.type === filter);
  const sorted = [...arr].sort((a,b) => b.votes - a.votes);
  const dots = n => Array(5).fill(0).map((_,i) => `<div class="sd${i<n?' on':''}"></div>`).join('');
  const makeHtml = (mob) => sorted.map(p => `
    <div class="card${p.id===selId?' active':''}" data-id="${esc(p.id)}" data-mob="${mob}">
      <div class="card-row1"><div class="card-name">${p.gold?'★ ':''}${esc(p.name)}</div><div class="ctag t-${p.type}">${p.type}</div></div>
      <div class="card-city">${esc(p.city)}</div>
      <div class="card-row2"><div class="sdots">${dots(p.safety)}</div><div class="cvotes"><b>${p.votes}</b> votes</div></div>
    </div>`).join('');

  const listEl = document.getElementById('list');
  const mobListEl = document.getElementById('mob-list');
  listEl.innerHTML = makeHtml(false);
  mobListEl.innerHTML = makeHtml(true);

  // event delegation — работает с UUID
  listEl.onclick = e => {
    const card = e.target.closest('.card');
    if (!card) return;
    sel(card.dataset.id, true);
  };
  mobListEl.onclick = e => {
    const card = e.target.closest('.card');
    if (!card) return;
    mobSelPlace(card.dataset.id);
  };

  document.querySelector('#list .card.active')?.scrollIntoView({ block: 'nearest' });
}

function mobSelPlace(id) {
  const p = PLACES.find(x => x.id === id);
  if (!p) return;
  map.flyTo({ center: [p.lng, p.lat], zoom: 12, duration: 800, essential: true });
  collapseDrawer();
  setTimeout(() => openMobDetail(p), 200);
}

function updateStats() {
  const total = PLACES.reduce((a,b) => a+b.votes, 0).toLocaleString();
  document.getElementById('stat-spots').textContent = PLACES.length;
  document.getElementById('stat-campers').textContent = total;
  document.getElementById('mob-stat-spots').textContent = PLACES.length;
}

// ── FILTER ──
function setFilter(type, btn, ctx) {
  filter = type;
  if (ctx === 'desktop') {
    document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('on'));
  } else {
    document.querySelectorAll('.mob-fbtn').forEach(b => b.classList.remove('on'));
  }
  btn.classList.add('on');
  hidePopup();
  if (selId) desel();
  buildMarkers();
  renderList();
}

// ── MOBILE DRAWER ──
function toggleDrawer() {
  drawerExpanded = !drawerExpanded;
  document.getElementById('mob-drawer').classList.toggle('expanded', drawerExpanded);
}
function collapseDrawer() {
  drawerExpanded = false;
  document.getElementById('mob-drawer').classList.remove('expanded');
}

// ── MOBILE NAV ──
function mobNav(tab) {
  document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-' + tab).classList.add('active');
  closeMobDetail();
  if (tab === 'map') {
    collapseDrawer();
  } else if (tab === 'list') {
    document.getElementById('mob-drawer').classList.add('expanded');
    drawerExpanded = true;
  } else if (tab === 'chat') {
    toggleChat();
    document.getElementById('nav-map').classList.add('active');
    document.getElementById('nav-chat').classList.remove('active');
  }
}

// ── CHAT ──
const SEED_MESSAGES = [
  { name: 'rektoor.eth', text: 'gm frens. currently at barceloneta. 10/10 would rug again', time: '23:41' },
  { name: 'anon_degen', text: 'ser how is the wifi signal at odaiba', time: '23:44' },
  { name: 'lumphini_larry', text: 'bangkok park 5 stars no cap. cost of living beats my portfolio returns', time: '23:51' },
  { name: 'system', text: '— global chat · no auth required · be a degen —', time: '' },
];

async function initChat() {
  const container = document.getElementById('chat-messages');
  const { data: raw } = await sb.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(50);
  const data = raw ? raw.reverse() : null;
  const msgs = (data && data.length) ? data : SEED_MESSAGES;
  msgs.forEach(m => container.appendChild(buildMsgEl({
    name: m.author_name || m.name,
    text: m.text,
    time: m.created_at ? new Date(m.created_at).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}) : m.time
  })));
  container.scrollTop = container.scrollHeight;
  sb.channel('chat').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
    const m = payload.new;
    if (m.anon_id === ANON_ID) return;
    container.appendChild(buildMsgEl({
      name: m.author_name,
      text: m.text,
      time: new Date(m.created_at).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'})
    }));
    container.scrollTop = container.scrollHeight;
  }).subscribe();
}

function buildMsgEl({ name, text, time }) {
  const el = document.createElement('div');
  if (name === 'system') {
    el.className = 'chat-msg system';
    el.innerHTML = `<div class="chat-msg-text">${esc(text)}</div>`;
  } else {
    el.className = 'chat-msg';
    el.innerHTML = `
      <div class="chat-msg-meta">
        <span class="chat-msg-name">${esc(name)}</span>
        <span class="chat-msg-time">${esc(time)}</span>
      </div>
      <div class="chat-msg-text">${esc(text)}</div>
    `;
  }
  return el;
}

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-overlay').classList.toggle('open', chatOpen);
  document.getElementById('chat-btn').classList.toggle('active', chatOpen);
  if (chatOpen) {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
    setTimeout(() => document.getElementById('chat-text-input').focus(), 100);
  }
}

function closeChatOutside(e) {
  if (e.target === document.getElementById('chat-overlay')) toggleChat();
}

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

async function sendChat() {
  if (chatCooldown) return;
  const nameEl = document.getElementById('chat-name-input');
  const textEl = document.getElementById('chat-text-input');
  const text = textEl.value.trim();
  if (!text) return;
  const name = nameEl.value.trim() || 'anon';
  const now = new Date();
  const time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  textEl.value = '';
  setChatCooldown(10000);
  const container = document.getElementById('chat-messages');
  const msgEl = buildMsgEl({ name, text, time });
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
  const { error } = await sb.from('chat_messages').insert({ text, author_name: name, anon_id: ANON_ID });
  if (error) { msgEl.remove(); toast('message not saved — check connection'); }
}

// ── MODAL (add spot — gated) ──
function openModal() {
  if (!currentUser) {
    openAuthModal();
    return;
  }
  // auth user: открываем форму, но submit заблокирован до step 3
  document.getElementById('modal-bg').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-bg').classList.remove('open');
  // minimap: proper destroy
  if (minimapInstance) { try { minimapInstance.remove(); } catch(_) {} minimapInstance = null; minimapMarker = null; }
  const minimap = document.getElementById('f-minimap');
  if (minimap) { minimap.classList.remove('show'); minimap.innerHTML = ''; }
  // coord paste
  const coordPaste = document.getElementById('f-coord-paste');
  if (coordPaste) coordPaste.value = '';
  // photo preview
  const preview = document.getElementById('f-photo-preview');
  if (preview) { preview.innerHTML = ''; preview.classList.remove('show'); }
}
function closeBg(e) { if (e.target === document.getElementById('modal-bg')) closeModal(); }
function setSafety(n) {
  safety = n;
  document.querySelectorAll('.sopt').forEach((el,i) => el.classList.toggle('on', i+1===n));
}

function onPhotoChange(input) {
  const label = document.getElementById('f-photo-label');
  const wrap  = document.getElementById('f-photo-wrap');
  const preview = document.getElementById('f-photo-preview');
  if (input.files && input.files[0]) {
    label.textContent = input.files[0].name;
    wrap.classList.add('has-file');
    const reader = new FileReader();
    reader.onload = e => {
      preview.innerHTML = `<img src="${e.target.result}" alt="preview">`;
      preview.classList.add('show');
    };
    reader.readAsDataURL(input.files[0]);
  } else {
    label.textContent = 'Choose photo';
    wrap.classList.remove('has-file');
    preview.innerHTML = '';
    preview.classList.remove('show');
  }
}

// ── SUBMIT PLACE (step 3) ──
async function submitPlace() {
  if (!currentUser) { openAuthModal(); return; }

  const name    = document.getElementById('f-name').value.trim();
  const city    = document.getElementById('f-city').value.trim();
  const type    = document.getElementById('f-type').value;
  const desc    = document.getElementById('f-desc').value.trim();
  const tagsRaw = document.getElementById('f-tags').value.trim();
  const lat     = parseFloat(document.getElementById('f-lat').value);
  const lng     = parseFloat(document.getElementById('f-lng').value);
  const fileInput = document.getElementById('f-photo');
  const file    = fileInput?.files?.[0];

  if (!name || !city || !desc)              { toast('ser — fill name, city and description'); return; }
  if (isNaN(lat) || isNaN(lng))             { toast('ser — add coordinates'); return; }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { toast('invalid coordinates'); return; }
  if (!file)                                { toast('ser — attach at least 1 photo'); return; }
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { toast('photo must be jpg, png or webp'); return; }
  if (file.size > 5 * 1024 * 1024)         { toast('photo too large — max 5MB'); return; }

  const sub = document.getElementById('fsub');
  sub.textContent = 'uploading...';
  sub.disabled = true;

  // 1. upload photo
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = currentUser.id + '/' + crypto.randomUUID() + '.' + ext;
  const { error: upErr } = await sb.storage.from('place-photos').upload(path, file, { upsert: false });
  if (upErr) {
    toast('photo upload failed: ' + upErr.message);
    sub.textContent = 'APE IN — ADD SPOT'; sub.disabled = false;
    return;
  }

  const { data: urlData } = sb.storage.from('place-photos').getPublicUrl(path);
  const photo_url = urlData.publicUrl;

  // 2. insert place
  const tags = tagsRaw
    ? tagsRaw.split(',').map(t => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean)
    : ['degen'];

  const { error: insErr } = await sb.from('places').insert({
    name, city, type, description: desc, safety, lat, lng, tags,
    gold: false, status: 'pending', created_by: currentUser.id, photo_url
  });

  if (insErr) {
    toast('error saving spot: ' + insErr.message);
    sub.textContent = 'APE IN — ADD SPOT'; sub.disabled = false;
    return;
  }

  closeModal();
  toast('📍 Spot submitted! Under review — WAGMI fren 🛌', 4000);
  showPendingBanner();

  // reset form
  ['f-name','f-city','f-desc','f-tags','f-lat','f-lng'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('f-type').value = 'rooftop';
  if (fileInput) fileInput.value = '';
  document.getElementById('f-photo-label').textContent = 'Choose photo';
  const preview = document.getElementById('f-photo-preview');
  if (preview) { preview.innerHTML = ''; preview.classList.remove('show'); }
  const wrap = document.getElementById('f-photo-wrap');
  if (wrap) wrap.classList.remove('has-file');
  const coordPaste = document.getElementById('f-coord-paste');
  if (coordPaste) coordPaste.value = '';
  const minimap = document.getElementById('f-minimap');
  if (minimap) {
    if (minimapInstance) { try { minimapInstance.remove(); } catch(_) {} minimapInstance = null; }
    minimap.classList.remove('show'); minimap.innerHTML = '';
  }
  setSafety(3);
  sub.textContent = 'APE IN — ADD SPOT'; sub.disabled = false;
}

// ── COMMENTS ──
let commentCooldown = false;

async function commentAuthorName(user) {
  if (!user) return 'anon';
  // пробуем взять display_name из profiles
  const { data } = await sb.from('profiles').select('display_name').eq('id', user.id).single();
  if (data?.display_name) return data.display_name;
  const wallet = user.user_metadata?.address;
  if (wallet) return wallet.slice(0,6) + '…' + wallet.slice(-4);
  if (user.email) return user.email.split('@')[0];
  return 'anon';
}

async function loadComments(placeId, ctx) {
  const prefix = ctx === 'mob' ? 'mob' : 'desk';
  const listEl  = document.getElementById(prefix + '-comments-list');
  const countEl = document.getElementById(prefix + '-comments-count');
  const formEl  = document.getElementById(prefix + '-comments-form');
  const authEl  = document.getElementById(prefix + '-comments-auth');
  if (!listEl) return;

  listEl.innerHTML = '<div class="comments-loading">loading...</div>';

  const { data, error } = await sb
    .from('place_comments')
    .select('id, author_name, text, created_at')
    .eq('place_id', placeId)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) { listEl.innerHTML = '<div class="comments-empty">could not load comments</div>'; return; }

  if (countEl) countEl.textContent = data.length ? `(${data.length})` : '';
  listEl.innerHTML = data.length
    ? data.map(c => `
        <div class="comment-item">
          <div class="comment-meta">
            <span class="comment-author">${esc(c.author_name)}</span>
            <span class="comment-time">${formatCommentTime(c.created_at)}</span>
          </div>
          <div class="comment-text">${esc(c.text)}</div>
        </div>`).join('')
    : '<div class="comments-empty">no comments yet — be the first degen</div>';

  // form visibility
  if (currentUser) {
    if (formEl) formEl.style.display = 'block';
    if (authEl) authEl.style.display = 'none';
  } else {
    if (formEl) formEl.style.display = 'none';
    if (authEl) authEl.style.display = 'block';
  }
}

function formatCommentTime(ts) {
  const d = new Date(ts);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

async function submitComment(placeId, ctx) {
  if (!currentUser) { openAuthModal(); return; }
  if (commentCooldown) { toast('ser — wait a bit between comments'); return; }

  const prefix = ctx === 'mob' ? 'mob' : 'desk';
  const inputEl  = document.getElementById(prefix + '-comment-input');
  const submitEl = document.getElementById(prefix + '-comment-submit');
  const text = inputEl?.value.trim();
  if (!text) return;
  if (text.length > 500) { toast('comment too long — 500 chars max'); return; }

  if (submitEl) { submitEl.disabled = true; submitEl.textContent = '...'; }

  const author_name = await commentAuthorName(currentUser);
  const { error } = await sb.from('place_comments').insert({
    place_id: placeId,
    user_id: currentUser.id,
    author_name,
    text
  });

  if (error) {
    const msg = error.message?.includes('rate_limit_exceeded')
      ? 'ser — too many comments, slow down'
      : 'error posting comment';
    toast(msg);
    if (submitEl) { submitEl.disabled = false; submitEl.textContent = 'POST'; }
    return;
  }

  if (inputEl) inputEl.value = '';
  const charsEl = document.getElementById(prefix + '-comment-chars');
  if (charsEl) charsEl.textContent = '500';
  if (submitEl) { submitEl.disabled = false; submitEl.textContent = 'POST'; }

  // cooldown 30s
  commentCooldown = true;
  if (submitEl) submitEl.disabled = true;
  setTimeout(() => {
    commentCooldown = false;
    const el = document.getElementById(prefix + '-comment-submit');
    if (el) el.disabled = false;
  }, 30000);

  await loadComments(placeId, ctx);
  toast('comment posted 🛌');
}

// ── COORD PARSER + MINIMAP ──
let minimapInstance = null;
let minimapMarker  = null;

function parseCoordPaste(val) {
  // форматы: "48.8566, 2.3522" / "48.8566,2.3522" / "48.8566 2.3522"
  const m = val.replace(/\s+/g, ' ').match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (!m) return;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
  document.getElementById('f-lat').value = lat.toFixed(6);
  document.getElementById('f-lng').value = lng.toFixed(6);
  showMinimap(lat, lng);
}

function onCoordManual() {
  const lat = parseFloat(document.getElementById('f-lat').value);
  const lng = parseFloat(document.getElementById('f-lng').value);
  if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    showMinimap(lat, lng);
  }
}

function showMinimap(lat, lng) {
  const wrap = document.getElementById('f-minimap');
  wrap.classList.add('show');
  if (!wrap.querySelector('#f-minimap-map')) {
    wrap.innerHTML = '<div id="f-minimap-map"></div><div class="minimap-cross">+</div>';
  }
  if (!minimapInstance) {
    minimapInstance = new mapboxgl.Map({
      container: 'f-minimap-map',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [lng, lat],
      zoom: 12,
      interactive: true
    });
    minimapInstance.on('move', () => {
      const c = minimapInstance.getCenter();
      document.getElementById('f-lat').value = c.lat.toFixed(6);
      document.getElementById('f-lng').value = c.lng.toFixed(6);
    });
  } else {
    minimapInstance.setCenter([lng, lat]);
  }
}

// ── PENDING BANNER ──
const PENDING_KEY = 'sbf_has_pending';

function showPendingBanner() {
  localStorage.setItem(PENDING_KEY, '1');
  const banner = document.getElementById('pending-banner');
  if (banner) { banner.classList.add('show'); }
}

function initPendingBanner() {
  if (localStorage.getItem(PENDING_KEY)) {
    const banner = document.getElementById('pending-banner');
    if (banner) banner.classList.add('show');
  }
}

// ── CHAT COOLDOWN ──
let chatCooldown = false;

function setChatCooldown(ms) {
  chatCooldown = true;
  const btn = document.getElementById('chat-send');
  if (btn) btn.disabled = true;
  setTimeout(() => {
    chatCooldown = false;
    if (btn) btn.disabled = false;
  }, ms);
}

// ── TOAST ──
function toast(msg, dur=3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}
