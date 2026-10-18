// Sincronização com o Supabase, sem login: o código secreto do link (?lab=...) é a credencial.
// Gravação/leitura só via funções RPC (lab_put / lab_get); aviso em tempo real via Realtime Broadcast.
// Fila offline com last-write-wins. Escopo = id da solução (ex.: 'cultura') ou 'cel'.
import { getClient, isConfigured } from './supabase-client.js';

const MIN_LAB_LEN = 20;     // igual ao schema.sql; sem código longo no link, o app funciona só localmente
const DEBOUNCE_MS = 500;
const LS_PENDING = 'labarcade.pending';
const LS_LAB = 'labarcade.lab';
const SS_CLIENT = 'labarcade.client';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

// Código do laboratório: ?lab=bancada1 na URL (fica salvo). Computadores com o mesmo código compartilham o estado.
const cleanLab = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
function resolveLab() {
  let fromUrl = '';
  try { fromUrl = cleanLab(new URLSearchParams(location.search).get('lab')); } catch (_) {}
  if (fromUrl) lsSet(LS_LAB, fromUrl);
  return fromUrl || cleanLab(lsGet(LS_LAB));
}
export const LAB = resolveLab();
const ENABLED = isConfigured && LAB.length >= MIN_LAB_LEN;

// Identifica esta aba/computador para ignorar o eco dos próprios envios.
const CLIENT_ID = (() => {
  let id = null;
  try { id = sessionStorage.getItem(SS_CLIENT); } catch (_) {}
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || Date.now() + '-' + Math.random().toString(16).slice(2);
    try { sessionStorage.setItem(SS_CLIENT, id); } catch (_) {}
  }
  return id;
})();

let H = {};                 // callbacks: onRemote, onStatus, getRt, onSynced
let client = null, channel = null, timer = null, flushing = false, status = '';
let pending = {};           // scope -> { state } ainda não enviado (persistido: sobrevive a F5/queda de rede)
try { pending = JSON.parse(lsGet(LS_PENDING) || '{}') || {}; } catch (_) { pending = {}; }
const savePending = () => lsSet(LS_PENDING, JSON.stringify(pending));

function setStatus(s) {
  if (s === status) return;
  status = s;
  if (H.onStatus) H.onStatus(s, LAB);
}

/** Enfileira o estado de um escopo e envia (debounce). Sempre seguro offline. */
export function push(scope, state) {
  if (!ENABLED) return;
  pending[scope] = { state };
  savePending();
  clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

async function flush() {
  if (flushing || !Object.keys(pending).length) return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  client = client || (await getClient());
  if (!client) { setStatus('offline'); return; }
  flushing = true;
  let ok = true;
  try {
    for (const scope of Object.keys(pending)) {
      const item = pending[scope];
      const { data, error } = await client.rpc('lab_put', { p_lab: LAB, p_recipe: scope, p_state: item.state, p_by: CLIENT_ID });
      if (error) throw error;
      if (pending[scope] === item) delete pending[scope]; // se mudou durante o envio, continua pendente
      if (H.onSynced) H.onSynced(scope, Date.parse(data));
      if (channel) channel.send({ type: 'broadcast', event: 'state', payload: { recipe_id: scope, state: item.state, updated_at: data, by: CLIENT_ID } });
    }
    setStatus('online');
  } catch (err) {
    ok = false;
    console.warn('[sync] falha ao enviar, tentará de novo', err);
    setStatus('offline');
  } finally {
    savePending();
    flushing = false;
  }
  if (ok && Object.keys(pending).length) timer = setTimeout(flush, DEBOUNCE_MS);
}

// Aplica uma linha remota, exceto se há alteração local pendente (local vence) ou se já vimos esta versão.
function applyRow(row) {
  const scope = row.recipe_id, rt = Date.parse(row.updated_at);
  if (pending[scope]) return;
  if (H.getRt && rt <= H.getRt(scope)) return;
  if (H.onRemote) H.onRemote(scope, row.state || {}, rt);
}

async function pullRows(scope) {
  const { data, error } = await client.rpc('lab_get', { p_lab: LAB });
  if (error) throw error;
  (data || []).filter((r) => !scope || r.recipe_id === scope).forEach(applyRow);
}

/** Busca no servidor a versão mais recente de um escopo (ou de todos). */
export async function pull(scope) {
  if (!client || !navigator.onLine) return;
  try { await pullRows(scope); } catch (err) { console.warn('[sync] falha ao ler', err); }
}

function subscribe() {
  if (channel) { client.removeChannel(channel); channel = null; }
  channel = client
    .channel('lab-' + LAB, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'state' }, ({ payload }) => {
      if (!payload || typeof payload.recipe_id !== 'string' || payload.by === CLIENT_ID) return;
      applyRow({ recipe_id: payload.recipe_id, state: payload.state, updated_at: payload.updated_at });
    })
    .subscribe((s) => {
      if (s === 'SUBSCRIBED') { setStatus('online'); pull(); flush(); }  // (re)conectou: recupera o que perdeu
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline');
    });
}

async function connect() {
  if (!navigator.onLine) { setStatus('offline'); return; }
  client = await getClient();
  if (!client) { setStatus('offline'); return; }
  subscribe();
  await pull();
  await flush();
}

export async function init(handlers) {
  H = handlers || {};
  if (!ENABLED) { setStatus('local'); return; }
  window.addEventListener('online', connect);
  window.addEventListener('offline', () => setStatus('offline'));
  await connect();
}
