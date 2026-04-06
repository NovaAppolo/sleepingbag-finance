// ── CONFIG ──
const ADMIN_WALLET = '0xfecd0cb6ee16c61bc7e8c5c7a464f6b3a8f1a075';
const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_ID_HEX = '0x2105';
const BASE_CHAIN_CONFIG = {
  chainId: BASE_CHAIN_ID_HEX,
  chainName: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org']
};

const SUPABASE_URL = 'https://fhfrocvcbmkoidlvbury.supabase.co';

// ── STATE ──
let walletAddress = null;
let walletProvider = null;

// ── UI HELPERS ──
function showState(id) {
  ['state-connect', 'state-denied', 'state-network', 'state-admin'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = s === id ? (id === 'state-admin' ? 'block' : 'flex') : 'none';
  });
}

function updateWalletBtn() {
  const btn = document.getElementById('wallet-btn');
  if (!walletAddress) {
    btn.textContent = '🔗 CONNECT WALLET';
    btn.className = '';
    btn.id = 'wallet-btn';
    return;
  }
  const short = walletAddress.slice(0, 6) + '…' + walletAddress.slice(-4);
  btn.textContent = short;
  btn.id = 'wallet-btn';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── WALLET ──
async function connectWallet() {
  if (walletAddress) { disconnectWallet(); return; }
  if (!window.ethereum) { alert('Install MetaMask first'); return; }
  try {
    walletProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await walletProvider.send('eth_requestAccounts', []);
    walletAddress = accounts[0].toLowerCase();
    updateWalletBtn();
    await checkAccess();
  } catch (e) {
    if (e.code === 4001) return;
  }
}

function disconnectWallet() {
  walletAddress = null;
  walletProvider = null;
  updateWalletBtn();
  showState('state-connect');
}

async function checkAccess() {
  if (!walletAddress) { showState('state-connect'); return; }

  if (walletAddress !== ADMIN_WALLET) {
    document.getElementById('denied-addr').textContent = walletAddress;
    showState('state-denied');
    return;
  }

  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (parseInt(chainId, 16) !== BASE_CHAIN_ID) {
    showState('state-network');
    return;
  }

  const btn = document.getElementById('wallet-btn');
  btn.className = 'connected';
  btn.id = 'wallet-btn';
  showState('state-admin');
  loadPlaces();
}

async function switchToBase() {
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_CHAIN_ID_HEX }] });
  } catch (e) {
    if (e.code === 4902) {
      try {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [BASE_CHAIN_CONFIG] });
      } catch { return; }
    } else { return; }
  }
  await checkAccess();
}

if (window.ethereum) {
  window.ethereum.on('accountsChanged', accs => {
    if (!accs.length) { disconnectWallet(); return; }
    walletAddress = accs[0].toLowerCase();
    updateWalletBtn();
    checkAccess();
  });
  window.ethereum.on('chainChanged', () => {
    if (walletAddress) checkAccess();
  });
}

window.addEventListener('load', async () => {
  if (!window.ethereum) return;
  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
  if (accounts.length) {
    walletProvider = new ethers.BrowserProvider(window.ethereum);
    walletAddress = accounts[0].toLowerCase();
    updateWalletBtn();
    await checkAccess();
  }
});

// ── ADMIN SIGNATURE ──
async function signAdminMessage() {
  if (!walletProvider) throw new Error('no provider');
  const signer = await walletProvider.getSigner();
  const ts = Math.floor(Date.now() / 1000);
  const message = 'sleepingbag-admin:' + ts;
  const signature = await signer.signMessage(message);
  return { wallet: walletAddress, message, signature };
}

// ── EDGE FUNCTION CALLS ──
async function callEdge(fnName, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'edge function error');
  return data;
}

// ── DASHBOARD ──
const typeCols = { rooftop: '#c8a96e', beach: '#4a9e6a', park: '#4a9e6a', forest: '#4a9e6a', bridge: '#e84040', other: '#888' };
const statusCls = { pending: 'td-status-pending', approved: 'td-status-approved', hidden: 'td-status-hidden' };

async function loadPlaces() {
  try {
    const signed = await signAdminMessage();
    const data = await callEdge('admin-places', signed);
    renderDashboard(data.places);
  } catch (e) {
    console.error('loadPlaces error:', e);
    document.getElementById('places-tbody').innerHTML = `<tr><td colspan="10" style="color:var(--red);text-align:center;padding:20px">
      Failed to load places: ${esc(e.message)}<br>Check edge function deployment.
    </td></tr>`;
  }
}

function renderDashboard(places) {
  if (!places) return;

  const pending = places.filter(p => p.status === 'pending').length;
  const approved = places.filter(p => p.status === 'approved').length;
  const hidden = places.filter(p => p.status === 'hidden').length;
  const totalVotes = places.reduce((a, p) => a + (p.votes_count || 0), 0);
  document.getElementById('s-total').textContent = places.length;
  document.getElementById('s-pending').textContent = pending;
  document.getElementById('s-approved').textContent = approved;
  document.getElementById('s-hidden').textContent = hidden;
  document.getElementById('s-votes').textContent = totalVotes.toLocaleString();

  const tbody = document.getElementById('places-tbody');
  tbody.innerHTML = places.map(p => {
    const col = typeCols[p.type] || '#888';
    const created = p.created_at ? new Date(p.created_at).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
    const cls = statusCls[p.status] || '';

    let actions = '';
    if (p.status !== 'approved') {
      actions += `<button class="act-btn act-approve" onclick="adminAction('approve',${p.id})">✓ APPROVE</button>`;
    }
    if (p.status !== 'hidden') {
      actions += `<button class="act-btn act-hide" onclick="adminAction('hide',${p.id})">✕ HIDE</button>`;
    }

    return `<tr>
      <td class="td-id">${p.id}</td>
      <td class="td-name">${p.gold ? '★ ' : ''}${esc(p.name)}</td>
      <td class="td-city">${esc(p.city)}</td>
      <td class="td-type" style="color:${col}">${esc(p.type)}</td>
      <td>${p.safety}/5</td>
      <td class="td-votes">${p.votes_count || 0}</td>
      <td class="td-gold">${p.gold ? '★' : '—'}</td>
      <td class="${cls}">${esc(p.status).toUpperCase()}</td>
      <td class="td-date">${created}</td>
      <td class="td-actions">${actions}</td>
    </tr>`;
  }).join('');
}

async function adminAction(action, placeId) {
  try {
    const signed = await signAdminMessage();
    await callEdge('admin-action', { ...signed, action, place_id: placeId });
    loadPlaces();
  } catch (e) {
    alert('Action failed: ' + e.message);
  }
}
