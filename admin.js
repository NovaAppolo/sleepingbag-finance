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

const sb = supabase.createClient(
  'https://fhfrocvcbmkoidlvbury.supabase.co',
  'sb_publishable_vT2HG-9np9RLJlLJ_gcUjw__aqiiUwo'
);

// ── STATE ──
let walletAddress = null;

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
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
    walletAddress = accounts[0].toLowerCase();
    updateWalletBtn();
    await checkAccess();
  } catch (e) {
    if (e.code === 4001) return; // user rejected
  }
}

function disconnectWallet() {
  walletAddress = null;
  updateWalletBtn();
  showState('state-connect');
}

async function checkAccess() {
  if (!walletAddress) { showState('state-connect'); return; }

  // check admin
  if (walletAddress !== ADMIN_WALLET) {
    document.getElementById('denied-addr').textContent = walletAddress;
    showState('state-denied');
    return;
  }

  // check network
  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (parseInt(chainId, 16) !== BASE_CHAIN_ID) {
    showState('state-network');
    return;
  }

  // admin + Base → show dashboard
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

// handle chain/account changes
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

// auto-reconnect
window.addEventListener('load', async () => {
  if (!window.ethereum) return;
  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
  if (accounts.length) {
    walletAddress = accounts[0].toLowerCase();
    updateWalletBtn();
    await checkAccess();
  }
});

// ── DASHBOARD ──
const typeCols = { rooftop: '#c8a96e', beach: '#4a9e6a', park: '#4a9e6a', forest: '#4a9e6a', bridge: '#e84040', other: '#888' };

async function loadPlaces() {
  const { data, error } = await sb.from('places').select('*').order('created_at', { ascending: false });
  if (error || !data) { return; }

  // stats — используем status вместо is_hidden
  const approved = data.filter(p => p.status === 'approved').length;
  const pending  = data.filter(p => p.status === 'pending').length;
  const hidden   = data.filter(p => p.status === 'hidden').length;
  const totalVotes = data.reduce((a, p) => a + (p.votes_count || 0), 0);
  document.getElementById('s-total').textContent = data.length;
  document.getElementById('s-visible').textContent = approved;
  document.getElementById('s-hidden').textContent = hidden;
  document.getElementById('s-pending').textContent = pending;
  document.getElementById('s-votes').textContent = totalVotes.toLocaleString();

  // table — data-id на tr, event delegation для actions
  const tbody = document.getElementById('places-tbody');
  tbody.innerHTML = data.map(p => {
    const col = typeCols[p.type] || '#888';
    const created = p.created_at
      ? new Date(p.created_at).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    const statusCls = p.status === 'approved' ? 'td-hidden-no'
                    : p.status === 'hidden'   ? 'td-hidden-yes'
                    : 'td-pending';
    const canApprove = p.status !== 'approved';
    const canHide    = p.status !== 'hidden';
    return `<tr data-id="${esc(p.id)}">
      <td class="td-name">${p.gold ? '★ ' : ''}${esc(p.name)}</td>
      <td class="td-city">${esc(p.city)}</td>
      <td class="td-type" style="color:${col}">${esc(p.type)}</td>
      <td>${p.safety}/5</td>
      <td class="td-votes">${p.votes_count || 0}</td>
      <td class="${statusCls}">${esc(p.status).toUpperCase()}</td>
      <td class="td-date">${created}</td>
      <td class="td-actions">
        ${canApprove ? '<button class="act-btn act-approve" data-action="approve">✓ APPROVE</button>' : ''}
        ${canHide    ? '<button class="act-btn act-hide"    data-action="hide">✕ HIDE</button>'    : ''}
      </td>
    </tr>`;
  }).join('');

  // event delegation — UUID safe
  tbody.onclick = async e => {
    const btn = e.target.closest('.act-btn');
    if (!btn) return;
    const row = btn.closest('tr');
    const placeId = row.dataset.id;
    const action  = btn.dataset.action;
    await adminAction(action, placeId, btn);
  };
}

async function adminAction(action, placeId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const provider  = new ethers.BrowserProvider(window.ethereum);
    const signer    = await provider.getSigner();
    const wallet    = await signer.getAddress();
    const ts        = Math.floor(Date.now() / 1000);
    const message   = `sleepingbag-admin:${ts}`;
    const signature = await signer.signMessage(message);

    const resp = await fetch(
      'https://fhfrocvcbmkoidlvbury.supabase.co/functions/v1/admin-action',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, place_id: placeId, wallet, message, signature })
      }
    );
    const result = await resp.json();
    if (!resp.ok) {
      alert('Error: ' + (result.error || resp.status));
      if (btn) { btn.disabled = false; btn.textContent = action === 'approve' ? '✓ APPROVE' : '✕ HIDE'; }
      return;
    }
    await loadPlaces();
  } catch (e) {
    alert('Action failed: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = action === 'approve' ? '✓ APPROVE' : '✕ HIDE'; }
  }
}
