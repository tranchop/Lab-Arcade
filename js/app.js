// Lab Arcade — lógica de interface, eventos e cálculos.
// Persistência híbrida: localStorage (UX imediata/offline) + Supabase (js/sync.js).
import * as sync from './sync.js';

// O Service Worker permite abrir e calcular sem internet.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(function (e) { console.warn('[sw] registro falhou', e); });
}

// ---------- dados dos protocolos ----------
// Vêm de data/receitas.json. t: 'vol' (per = µL por mL final) | 'rest' (completa o volume) | 'mass' (per = mg por mL) | 'pack' (pacotes de 1 L por mL)
var S;
try {
  var resp = await fetch('./data/receitas.json');
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  S = await resp.json();
} catch (e) {
  document.getElementById('out').innerHTML = '<div class="empty px"><p>NÃO FOI POSSÍVEL CARREGAR<br>AS RECEITAS<br>(ABRA VIA SERVIDOR HTTP)</p></div>';
  throw e;
}

// ---------- cálculo ----------
function trim(n, d) {
  var s = n.toFixed(d);
  if (parseFloat(s) === 0) return '0';
  if (s.indexOf('.') > -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}
function fVol(u) { return u >= 1000 ? trim(u / 1000, 3) + ' mL' : trim(u, 2) + ' µL'; }
function fMass(m) { return m >= 1000 ? trim(m / 1000, 3) + ' g' : trim(m, 2) + ' mg'; }
function fPack(p) { return trim(p, 3) + (p === 1 ? ' pacote' : ' pacote (de 1 L)'); }

function calc(sol, V) {
  var fixed = 0, i, p;
  for (i = 0; i < sol.parts.length; i++) { p = sol.parts[i]; if (p.t === 'vol') fixed += p.per; }
  var rows = [], totalUl = 0;
  for (i = 0; i < sol.parts.length; i++) {
    p = sol.parts[i];
    var r = { k: p.k, n: p.n, s: p.s, t: p.t };
    if (p.t === 'rest') { r.ul = V * (1000 - fixed); r.txt = fVol(r.ul); r.pct = trim((1000 - fixed) / 10, 2) + '%'; totalUl += r.ul; }
    else if (p.t === 'vol') { r.ul = V * p.per; r.txt = fVol(r.ul); r.pct = p.sub || (trim(p.per / 10, 2) + '%'); totalUl += r.ul; }
    else if (p.t === 'mass') { r.mg = V * p.per; r.txt = fMass(r.mg); r.pct = p.sub; }
    else { r.pk = V * p.per; r.txt = fPack(r.pk); r.pct = p.sub; }
    rows.push(r);
  }
  return { rows: rows, totalUl: totalUl };
}

// ---------- ícone pixel ----------
var FLASK = ['..oooooo..', '...o..o...', '...o..o...', '...o..o...', '..oo..oo..', '.o......o.', 'o.llllll.o', 'ollllllllo', 'ollllllllo', '.ollllllo.', '..oooooo..'];
function drawFlask(color) {
  var out = '';
  for (var y = 0; y < FLASK.length; y++) for (var x = 0; x < FLASK[y].length; x++) {
    var c = FLASK[y][x];
    if (c === 'o') out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#e8e8ff"/>';
    else if (c === 'l') out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + color + '"/>';
  }
  document.getElementById('flask').innerHTML = out;
}

// ---------- UI ----------
var cur = S[0];
var picks = document.getElementById('picks'), out = document.getElementById('out'), volEl = document.getElementById('vol');

(function buildPicks() {
  var cats = [], html = '';
  S.forEach(function (s) { if (cats.indexOf(s.cat) < 0) cats.push(s.cat); });
  cats.forEach(function (c) {
    html += '<optgroup label="' + c + '">';
    S.forEach(function (s) { if (s.cat === c) html += '<option value="' + s.id + '">' + (s.opt || s.name) + '</option>'; });
    html += '</optgroup>';
  });
  picks.innerHTML = '<label class="sel" for="sol"><select id="sol" aria-label="Solução ou meio">' + html + '</select></label><p class="selsub" id="selsub"></p>';
})();
var solEl = document.getElementById('sol');

var presetVals = [10, 50, 100, 500, 1000];
var presetsEl = document.getElementById('presets');
presetsEl.innerHTML = presetVals.map(function (v) { return '<button type="button" class="preset" data-v="' + v + '" aria-pressed="false">' + v + ' mL</button>'; }).join('');

var bigFlag = false, CK = {}; // CK: marcações dos checkboxes (id -> true)
function pnum(s) {
  s = String(s == null ? '' : s).replace(/\s/g, '');
  var c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c > -1 && d > -1) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c > -1) s = s.replace(/,/g, '.');
  return /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
}
function getV() { var v = pnum(volEl.value); if (v > 1e9) { bigFlag = true; return 0; } return isFinite(v) && v > 0 ? v : 0; }

function render() {
  bigFlag = false;
  var V = getV(), root = document.documentElement;
  root.style.setProperty('--acc', cur.acc);
  drawFlask(cur.acc);
  document.getElementById('selsub').textContent = cur.sub;
  Array.prototype.forEach.call(presetsEl.children, function (b) { b.setAttribute('aria-pressed', String(parseFloat(b.dataset.v) === V)); });
  if (!V) {
    msg(out, 'DIGITE UM VOLUME<br>PARA COMEÇAR');
    return;
  }
  var R = calc(cur, V), i;
  var amt = {};
  R.rows.forEach(function (r) { amt[r.k] = r.txt; });
  var steps = cur.steps.map(function (s) { return s.replace(/\{(\w+)\}/g, function (m, k) { return '<b>' + (amt[k] || '?') + '</b>'; }); });
  var tubos = cur.tubos ? ' · rende cerca de ' + trim(V / 1.5, 1) + ' a ' + trim(V, 1) + ' tubos (1 a 1,5 mL cada)' : '';
  var totTxt = fVol(R.totalUl);
  var ok = Math.abs(R.totalUl - V * 1000) < 1e-6;

  var h = '';
  h += '<section aria-labelledby="h3s"><h2 class="stage-h" id="h3s"><span class="lv">FASE 3</span> REAGENTES</h2>';
  h += '<div class="sum px"><span class="big">' + trim(V, 3) + ' mL DE ' + (cur.opt || cur.name).toUpperCase() + '</span><span class="small">' + cur.sub + tubos + '</span>';
  h += '<div class="xp"><span class="xp-lab">XP</span><div class="bar" aria-hidden="true">' + R.rows.map(function () { return '<i></i>'; }).join('') + '</div><span class="xp-n"></span></div>' + '<div class="tools"><button type="button" class="tool" data-act="copy">COPIAR RECEITA</button><button type="button" class="tool" data-act="reset">LIMPAR MARCAÇÕES</button></div>' + '</div></section>';
  h += '<ul class="loot" id="loot">';
  for (i = 0; i < R.rows.length; i++) {
    var r = R.rows[i], id = 'c-' + r.k;
    h += '<li class="row px" data-k="' + r.k + '"><input class="chk" type="checkbox" id="' + id + '" aria-label="Marcar ' + r.n + ' como adicionado"><label class="nm" for="' + id + '"><b>' + r.n + '</b><span>' + (r.s ? r.s + ' · ' : '') + r.pct + '</span></label><span class="amt">' + r.txt + '</span></li>';
  }
  h += '</ul><div class="total"><span>TOTAL CONFERIDO</span><b>' + totTxt + (ok ? ' = ' + trim(V, 3) + ' mL' : '') + '</b></div>';
  if (cur.extra) h += '<div class="extra px">' + cur.extra + '</div>';
  h += '<section aria-labelledby="h4s"><h2 class="stage-h" id="h4s"><span class="lv">FASE 4</span> MISSÃO PASSO A PASSO</h2><ol class="steps">' + steps.map(function (s) { return '<li class="px">' + s + '</li>'; }).join('') + '</ol></section>';
  out.innerHTML = h;
  updateXp(out);
}

function updateXp(root) {
  var items = root.querySelectorAll('.row');
  if (!items.length) return;
  var bars = root.querySelectorAll('.bar i'), n = 0;
  Array.prototype.forEach.call(items, function (li, i) {
    var ck = li.querySelector('.chk');
    ck.checked = !!CK[ck.id];
    var on = ck.checked;
    li.classList.toggle('done', on);
    if (bars[i]) bars[i].classList.toggle('on', on);
    if (on) n++;
  });
  var xn = root.querySelector('.xp-n');
  if (xn) xn.textContent = n === items.length ? 'PRONTO!' : n + '/' + items.length;
}

solEl.addEventListener('change', function () {
  stash(cur.id);                       // guarda (só local) a receita que estava aberta
  cur = S.filter(function (s) { return s.id === solEl.value; })[0];
  restore(cur.id);                     // restaura volume e marcações da nova receita
  save();
  render();
  sync.pull(cur.id);
});
presetsEl.addEventListener('click', function (e) {
  var b = e.target.closest('.preset');
  if (!b) return;
  volEl.value = b.dataset.v;
  render();
  touch(cur.id);
});
volEl.addEventListener('input', function () { render(); touch(cur.id); });
function scopeOf(root) { return root === outCel ? 'cel' : cur.id; }
function onChk(root, e) {
  if (!e.target.classList.contains('chk')) return;
  CK[e.target.id] = e.target.checked;
  updateXp(root);
  touch(scopeOf(root));
}
out.addEventListener('change', function (e) { onChk(out, e); });

// ---------- células por mL ----------
var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
function fCells(n) {
  if (!(n > 0)) return '0';
  var e = Math.floor(Math.log10(n)), m = n / Math.pow(10, e);
  if (Math.round(m * 100) / 100 >= 10) { m = 1; e += 1; }
  if (e >= -1 && e < 3) return trim(n, 2);
  return trim(m, 2) + '×10' + String(e).split('').map(function (c) { return SUP[c]; }).join('');
}
function fUL(u) { return u < 10000 ? trim(u, 2) + ' µL' : fVol(u); }
var outCel = document.getElementById('outCel');
var cEl = { c1: document.getElementById('c1'), c2: document.getElementById('c2'), vf: document.getElementById('vf'), nw: document.getElementById('nw'), vw: document.getElementById('vw'), e1: document.getElementById('ec1'), e2: document.getElementById('ec2') };
function num(el) { var v = pnum(el.value); if (v > 1e12) { bigFlag = true; return 0; } return isFinite(v) && v > 0 ? v : 0; }

function renderCel() {
  bigFlag = false;
  var root = document.documentElement, ACC = '#b6ff3d';
  root.style.setProperty('--acc', ACC);
  drawFlask(ACC);
  var C1 = num(cEl.c1) * Math.pow(10, +cEl.e1.value), C2 = num(cEl.c2) * Math.pow(10, +cEl.e2.value), VF = num(cEl.vf), VW = num(cEl.vw);
  if (!C1 || !C2 || !VF) { msg(outCel, 'PREENCHA CONTAGEM,<br>CONCENTRAÇÃO E VOLUME'); return; }
  if (C2 > C1) { msg(outCel, 'A CONCENTRAÇÃO DESEJADA<br>NÃO PODE SER MAIOR<br>QUE A CONTADA'); return; }
  var V1 = C2 * VF / C1, meio = VF - V1, cells = C2 * VF / 1000;
  var rows = [
    { id: 'cc-susp', n: 'Suspensão celular (V₁)', s: 'contada: ' + fCells(C1) + ' células/mL', amt: fUL(V1) },
    { id: 'cc-meio', n: 'Meio de cultura completo', s: 'DMEM/F12 + 10% SFB + 1% AA', amt: fUL(meio) }
  ];
  var h = '<section aria-labelledby="hc2"><h2 class="stage-h" id="hc2"><span class="lv">FASE 2</span> PIPETAGEM</h2>';
  h += '<div class="sum px"><span class="big">' + trim(VF / 1000, 3) + ' mL A ' + fCells(C2) + ' CÉL/mL</span><span class="small">diluição de ' + trim(C1 / C2, 2) + ' vezes</span>';
  h += '<div class="xp"><span class="xp-lab">XP</span><div class="bar" aria-hidden="true">' + rows.map(function () { return '<i></i>'; }).join('') + '</div><span class="xp-n"></span></div>' + '<div class="tools"><button type="button" class="tool" data-act="copy">COPIAR RECEITA</button><button type="button" class="tool" data-act="reset">LIMPAR MARCAÇÕES</button></div>' + '</div></section>';
  h += '<ul class="loot">';
  rows.forEach(function (r) {
    h += '<li class="row px"><input class="chk" type="checkbox" id="' + r.id + '" aria-label="Marcar ' + r.n + ' como adicionado"><label class="nm" for="' + r.id + '"><b>' + r.n + '</b><span>' + r.s + '</span></label><span class="amt">' + r.amt + '</span></li>';
  });
  h += '</ul><div class="total"><span>TOTAL CONFERIDO</span><b>' + fUL(V1 + meio) + ' = ' + fUL(VF) + '</b></div>';
  h += '<div class="extra px"><p class="formula">C₁ · V₁ = C₂ · V₂</p><p class="formula"><b>' + fCells(C1) + '</b> × V₁ = <b>' + fCells(C2) + '</b> × <b>' + trim(VF, 2) + '</b></p><p class="formula">V₁ = <b>' + trim(V1, 2) + ' µL</b> de suspensão + <b>' + trim(meio, 2) + ' µL</b> de meio</p>';
  h += '<p><b>Células na suspensão final:</b> ' + fCells(cells) + '</p>';
  if (VW) h += '<p><b>Células por poço:</b> ' + fCells(C2 * VW / 1000) + ' (' + trim(VW, 2) + ' µL por poço)</p>';
  h += '</div>';
  var st = ['Resuspenda o pellet e faça a leitura no contador Tali para obter a concentração de células por mL.',
            'Em um tubo Falcon de 15 mL, pipete <b>' + fUL(meio) + '</b> de meio de cultura completo.',
            'Adicione <b>' + fUL(V1) + '</b> da suspensão celular.',
            'Homogeneíze suavemente a suspensão.'];
  if (VW) st.push('Distribua <b>' + trim(VW, 2) + ' µL</b> por poço na placa de 96 poços.');
  h += '<section aria-labelledby="hc3"><h2 class="stage-h" id="hc3"><span class="lv">FASE 3</span> MISSÃO PASSO A PASSO</h2><ol class="steps">' + st.map(function (s) { return '<li class="px">' + s + '</li>'; }).join('') + '</ol></section>';
  outCel.innerHTML = h;
  updateXp(outCel);
}
function celChanged() { renderCel(); touch('cel'); }
['c1', 'c2', 'vf'].forEach(function (k) { cEl[k].addEventListener('input', celChanged); });
cEl.vf.addEventListener('input', function () { cEl.nw.value = ''; });
cEl.e1.addEventListener('change', celChanged); cEl.e2.addEventListener('change', celChanged);
function plate() { var nw = num(cEl.nw), vw = num(cEl.vw); if (nw && vw) cEl.vf.value = trim(nw * vw, 3).replace(',', '.'); celChanged(); }
cEl.nw.addEventListener('input', plate); cEl.vw.addEventListener('input', plate);
outCel.addEventListener('change', function (e) { onChk(outCel, e); });

// ---------- ferramentas de bancada ----------
function g(id) { return document.getElementById(id); }
function setAcc(c) { document.documentElement.style.setProperty('--acc', c); drawFlask(c); }
function sup(e) { return String(e).split('').map(function (c) { return SUP[c]; }).join(''); }
function fn(n) {
  if (!isFinite(n)) return '–';
  if (n === 0) return '0';
  var a = Math.abs(n);
  if (a >= 1e6 || a < 1e-3) {
    var e = Math.floor(Math.log10(a)), m = n / Math.pow(10, e);
    if (Math.round(Math.abs(m) * 1000) / 1000 >= 10) { m = m / 10; e += 1; }
    return trim(m, 3) + '×10' + sup(e);
  }
  return trim(Number(n.toPrecision(6)), Math.max(0, 5 - Math.floor(Math.log10(a))));
}
function pv(id) { var x = pnum(g(id).value); if (x > 1e12) { bigFlag = true; return 0; } return isFinite(x) && x > 0 ? x : 0; }
function fld(id, label, inner, hid) { return '<div class="fld" id="f-' + id + '"' + (hid ? ' hidden' : '') + '><label for="' + id + '">' + label + '</label><div class="vol-in">' + inner + '</div></div>'; }
function inp(id, val, ph) { return '<input class="num" id="' + id + '" type="text" inputmode="decimal" pattern="[0-9.,]*" autocomplete="off" value="' + val + '"' + (ph ? ' placeholder="' + ph + '"' : '') + '>'; }
function tin(id, val) { return '<input class="num txt" id="' + id + '" type="text" value="' + val + '" autocomplete="off" spellcheck="false">'; }
function opt(list, sel) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
function usel(id, list, sel) { return '<select class="exp" id="' + id + '" aria-label="Unidade">' + opt(list, sel) + '</select>'; }
function csel(id, list, sel, label) { return '<label class="sel" for="' + id + '"><select id="' + id + '" aria-label="' + label + '">' + opt(list, sel) + '</select></label>'; }
function resRow(n, s, a, hit) { return '<li class="row nochk px"' + (hit ? ' style="--c:var(--yellow)"' : '') + '><div class="nm"><b>' + n + '</b><span>' + s + '</span></div><span class="amt">' + a + '</span></li>'; }
function stageH(id, lv, t) { return '<h2 class="stage-h" id="' + id + '"><span class="lv">' + lv + '</span> ' + t + '</h2>'; }
function msg(el, t) { el.innerHTML = '<div class="empty px"><p>' + t + (bigFlag ? '<br>VALOR MÁXIMO: 10¹²' : '') + '</p></div>'; }
function stepsHtml(id, st) { return '<section aria-labelledby="' + id + '">' + stageH(id, 'MISSÃO', 'PASSO A PASSO') + '<ol class="steps">' + st.map(function (s) { return '<li class="px">' + s + '</li>'; }).join('') + '</ol></section>'; }

var CUNITS = [['M', 'M'], ['mM', 'mM'], ['uM', 'µM'], ['nM', 'nM'], ['gL', 'g/L'], ['mgmL', 'mg/mL'], ['ugmL', 'µg/mL'], ['ngmL', 'ng/mL'], ['pct', '% (m/v)']];
var CF = { M: [1, 0], mM: [1e-3, 0], uM: [1e-6, 0], nM: [1e-9, 0], gL: [1, 1], mgmL: [1, 1], ugmL: [1e-3, 1], ngmL: [1e-6, 1], pct: [10, 1] };
var CLAB = {}; CUNITS.forEach(function (u) { CLAB[u[0]] = u[1]; });
var VUNITS = [['L', 'L'], ['mL', 'mL'], ['uL', 'µL']], VF = { L: 1, mL: 1e-3, uL: 1e-6 };
var MUNITS = [['g', 'g'], ['mg', 'mg'], ['ug', 'µg']], MF = { g: 1, mg: 1e-3, ug: 1e-6 };
function toM(x, u, mw) { var c = CF[u]; return c[1] ? (mw ? x * c[0] / mw : NaN) : x * c[0]; }
function fromM(M, u, mw) { var c = CF[u]; return c[1] ? (mw ? M * mw / c[0] : NaN) : M / c[0]; }
function bestMass(x) { var a = Math.abs(x); return a >= 1 ? fn(x) + ' g' : a >= 1e-3 ? fn(x * 1e3) + ' mg' : a >= 1e-6 ? fn(x * 1e6) + ' µg' : fn(x * 1e9) + ' ng'; }
function bestVol(x) { var a = Math.abs(x); return a >= 1 ? fn(x) + ' L' : a >= 1e-3 ? fn(x * 1e3) + ' mL' : a >= 1e-6 ? fn(x * 1e6) + ' µL' : fn(x * 1e9) + ' nL'; }
function bestConc(x) { var a = Math.abs(x); return a >= 1 ? fn(x) + ' M' : a >= 1e-3 ? fn(x * 1e3) + ' mM' : a >= 1e-6 ? fn(x * 1e6) + ' µM' : fn(x * 1e9) + ' nM'; }
function bestMol(x) { var a = Math.abs(x); return a >= 1 ? fn(x) + ' mol' : a >= 1e-3 ? fn(x * 1e3) + ' mmol' : a >= 1e-6 ? fn(x * 1e6) + ' µmol' : fn(x * 1e9) + ' nmol'; }
function wire(boxId, fnc) { var b = g(boxId); b.addEventListener('input', fnc); b.addEventListener('change', fnc); }
function wireChk(el) { el.addEventListener('change', function (e) { onChk(el, e); }); }
function xpBlock(n) { return '<div class="xp"><span class="xp-lab">XP</span><div class="bar" aria-hidden="true">' + new Array(n + 1).join('<i></i>') + '</div><span class="xp-n"></span></div>' + '<div class="tools"><button type="button" class="tool" data-act="copy">COPIAR RECEITA</button><button type="button" class="tool" data-act="reset">LIMPAR MARCAÇÕES</button></div>'; }


// ----- estoque a partir da massa molar -----
g('modeEst').innerHTML =
  '<section aria-labelledby="he1">' + stageH('he1', 'FASE 1', 'COMPOSTO') + '<div id="estIn"><div class="fields">' +
  fld('enome', 'NOME', tin('enome', 'Composto')) +
  fld('mw', 'MASSA MOLAR (MM)', inp('mw', '100') + '<span class="unit">g/mol</span>') +
  fld('pu', 'PUREZA', inp('pu', '100') + '<span class="unit">%</span>') +
  '</div><h3 class="sub-h">O QUE CALCULAR</h3>' +
  csel('ecalc', [['m', 'Massa a pesar'], ['c', 'Concentração obtida'], ['v', 'Volume de solvente']], 'm', 'O que calcular') +
  '<h3 class="sub-h">VALORES</h3><div class="fields">' +
  fld('ec', 'CONCENTRAÇÃO DESEJADA', inp('ec', '1') + usel('ecu', CUNITS, 'mgmL')) +
  fld('ev', 'VOLUME', inp('ev', '3') + usel('evu', VUNITS, 'mL')) +
  fld('em', 'MASSA PESADA', inp('em', '3') + usel('emu', MUNITS, 'mg'), true) +
  fld('esolv', 'SOLVENTE', tin('esolv', 'Solvente')) +
  '</div></div></section><div id="estOut" aria-live="polite"></div>';
var estOut = g('estOut');
function renderEst() {
  bigFlag = false;
  setAcc('#ff6ec7');
  var calc = g('ecalc').value, name = g('enome').value || 'composto', solv = g('esolv').value || 'solvente';
  g('f-ec').hidden = calc === 'c'; g('f-ev').hidden = calc === 'v'; g('f-em').hidden = calc === 'm';
  var mw = pv('mw'), puRaw = pv('pu'), pur = (puRaw || 100) / 100;
  if (puRaw > 100) { msg(estOut, 'PUREZA MÁXIMA: 100%'); return; }
  if (!mw) { msg(estOut, 'INFORME A MASSA MOLAR'); return; }
  var cu = g('ecu').value, Cm = toM(pv('ec'), cu, mw), V = pv('ev') * VF[g('evu').value], m = pv('em') * MF[g('emu').value];
  if (calc === 'm') { if (!Cm || !V) { msg(estOut, 'INFORME CONCENTRAÇÃO<br>E VOLUME'); return; } m = Cm * V * mw / pur; }
  else if (calc === 'c') { if (!m || !V) { msg(estOut, 'INFORME MASSA<br>E VOLUME'); return; } Cm = m * pur / mw / V; }
  else { if (!m || !Cm) { msg(estOut, 'INFORME MASSA<br>E CONCENTRAÇÃO'); return; } V = m * pur / mw / Cm; }
  var mol = Cm * V;
  var h = '<section aria-labelledby="he2">' + stageH('he2', 'FASE 2', 'RESULTADO') +
    '<div class="sum px"><span class="big">' + bestMass(m) + ' EM ' + bestVol(V) + '</span><span class="small">' + name + ' · ' + bestConc(Cm) + '</span><div class="tools"><button type="button" class="tool" data-act="copy">COPIAR RECEITA</button></div></div></section><ul class="loot">' +
    resRow('Massa a pesar', name + ' · MM ' + fn(mw) + ' g/mol' + (pur < 1 ? ' · pureza ' + fn(pur * 100) + '%' : ''), bestMass(m), calc === 'm') +
    resRow('Volume final', 'em ' + solv, bestVol(V), calc === 'v') +
    resRow('Concentração', fn(fromM(Cm, 'mgmL', mw)) + ' mg/mL', bestConc(Cm), calc === 'c') + '</ul>' +
    '<div class="extra px"><p class="formula">m = C × V × MM ÷ pureza</p><dl class="eq">' +
    '<div><dt>MOLARIDADE</dt><dd>' + fn(Cm * 1e3) + ' mM</dd></div><div><dt>MICROMOLAR</dt><dd>' + fn(Cm * 1e6) + ' µM</dd></div>' +
    '<div><dt>MASSA POR VOLUME</dt><dd>' + fn(fromM(Cm, 'mgmL', mw)) + ' mg/mL</dd></div><div><dt>MICROGRAMAS POR mL</dt><dd>' + fn(fromM(Cm, 'ugmL', mw)) + ' µg/mL</dd></div>' +
    '<div><dt>QUANTIDADE DE MATÉRIA</dt><dd>' + bestMol(mol) + '</dd></div></dl></div>';
  var st = ['Pese <b>' + bestMass(m) + '</b> de ' + name + '.',
    'Dissolva em ' + solv + ' e complete até <b>' + bestVol(V) + '</b>.',
    'Homogeneíze até dissolver por completo e identifique com nome, concentração (' + bestConc(Cm) + ') e data.'];
  estOut.innerHTML = h + stepsHtml('he3', st);
}
wire('estIn', renderEst);

// ----- concentração -----
g('modeCon').innerHTML =
  '<section aria-labelledby="hk1">' + stageH('hk1', 'FASE 1', 'C₁ · V₁ = C₂ · V₂') + '<div id="conAIn">' +
  csel('kcalc', [['v1', 'Calcular V₁ (volume de estoque)'], ['c1', 'Calcular C₁ (concentração do estoque)'], ['v2', 'Calcular V₂ (volume final)'], ['c2', 'Calcular C₂ (concentração final)']], 'v1', 'O que calcular') +
  '<div class="fields" style="margin-top:22px">' +
  fld('kun', 'UNIDADE DA CONCENTRAÇÃO', tin('kun', 'µM')) +
  fld('kc1', 'C₁ (ESTOQUE)', inp('kc1', '1000'), false) +
  fld('kvu', 'UNIDADE DE VOLUME', usel('kvu', VUNITS, 'uL')) +
  fld('kv1', 'V₁ (ESTOQUE USADO)', inp('kv1', '100'), true) +
  fld('kc2', 'C₂ (FINAL)', inp('kc2', '200')) +
  fld('kv2', 'V₂ (VOLUME FINAL)', inp('kv2', '2000')) +
  '</div></div></section><div id="conAOut" aria-live="polite"></div>' +
  '<section aria-labelledby="hk2">' + stageH('hk2', 'FASE 2', 'CONVERSOR DE UNIDADES') + '<div id="conBIn"><div class="fields">' +
  fld('xv', 'CONCENTRAÇÃO', inp('xv', '1') + usel('xu', CUNITS, 'mgmL')) +
  fld('xmw', 'MASSA MOLAR (PARA MOLAR ↔ MASSA)', inp('xmw', '100') + '<span class="unit">g/mol</span>') +
  '</div></div></section><div id="conBOut"></div>';
var conAOut = g('conAOut'), conBOut = g('conBOut');
function renderConA() {
  bigFlag = false;
  var calc = g('kcalc').value, unit = g('kun').value, vu = g('kvu').value;
  g('f-kc1').hidden = calc === 'c1'; g('f-kv1').hidden = calc === 'v1'; g('f-kc2').hidden = calc === 'c2'; g('f-kv2').hidden = calc === 'v2';
  var c1 = pv('kc1'), c2 = pv('kc2'), v2 = pv('kv2'), v1 = pv('kv1');
  var vlab = vu === 'uL' ? 'µL' : vu;
  // V₁ e V₂ usam a mesma unidade de volume escolhida
  var res, resLab, need;
  if (calc === 'v1') { need = c1 && c2 && v2; if (need) { res = c2 * v2 / c1; resLab = 'V₁'; } }
  else if (calc === 'c1') { need = v1 && c2 && v2; if (need) { res = c2 * v2 / v1; resLab = 'C₁'; } }
  else if (calc === 'v2') { need = c1 && v1 && c2; if (need) { res = c1 * v1 / c2; resLab = 'V₂'; } }
  else { need = c1 && v1 && v2; if (need) { res = c1 * v1 / v2; resLab = 'C₂'; } }
  if (!need) { msg(conAOut, 'PREENCHA OS<br>TRÊS VALORES'); return; }
  var V1 = calc === 'v1' ? res : v1, V2 = calc === 'v2' ? res : v2, C1 = calc === 'c1' ? res : c1, C2 = calc === 'c2' ? res : c2;
  var isConc = calc === 'c1' || calc === 'c2', resTxt = isConc ? fn(res) + ' ' + unit : fn(res) + ' ' + vlab;
  var h = '<div class="sum px"><span class="big">' + resLab + ' = ' + resTxt + '</span><span class="small">fator de diluição: ' + fn(C1 / C2) + ' vezes</span><div class="tools"><button type="button" class="tool" data-act="copy">COPIAR RESULTADO</button></div></div><ul class="loot">' +
    resRow('C₁ · estoque', 'concentração inicial', fn(C1) + ' ' + unit, calc === 'c1') +
    resRow('V₁ · estoque usado', 'volume retirado', fn(V1) + ' ' + vlab, calc === 'v1') +
    resRow('C₂ · final', 'concentração desejada', fn(C2) + ' ' + unit, calc === 'c2') +
    resRow('V₂ · final', 'volume total', fn(V2) + ' ' + vlab, calc === 'v2') + '</ul>';
  var extra = '<p class="formula"><b>' + fn(C1) + '</b> × <b>' + fn(V1) + '</b> = <b>' + fn(C2) + '</b> × <b>' + fn(V2) + '</b></p>';
  if (C2 > C1) extra += '<p class="formula">C₂ é maior que C₁: isso concentra a solução, não dilui.</p>';
  else extra += '<p class="formula">Diluente: <b>' + fn(V2 - V1) + ' ' + vlab + '</b> (V₂ − V₁)</p>';
  h += '<div class="extra px">' + extra + '</div>';
  conAOut.innerHTML = h;
}
function renderConB() {
  bigFlag = false;
  var x = pv('xv'), u = g('xu').value, mw = pv('xmw');
  if (!x) { msg(conBOut, 'INFORME A CONCENTRAÇÃO'); return; }
  var M = toM(x, u, mw);
  var h = '<ul class="loot">';
  CUNITS.forEach(function (c) {
    var val = fromM(M, c[0], mw);
    h += resRow(c[1] + (c[0] === u ? ' (origem)' : ''), CF[c[0]][1] ? 'massa por volume' : 'molar', isFinite(val) ? fn(val) + ' ' + c[1] : 'informe a MM', c[0] === u);
  });
  conBOut.innerHTML = h + '</ul>';
}
function renderCon() { setAcc('#4dd2ff'); renderConA(); renderConB(); }
wire('conAIn', renderConA); wire('conBIn', renderConB);

var MODES = { sol: ['modeSol', render], cel: ['modeCel', renderCel], est: ['modeEst', renderEst], con: ['modeCon', renderCon] };
function setMode(m) {
  Object.keys(MODES).forEach(function (k) { g(MODES[k][0]).hidden = k !== m; });
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.setAttribute('aria-pressed', String(t.dataset.mode === m)); });
  curMode = m;
  save();
  MODES[m][1]();
  if (m === 'sol') sync.pull(cur.id); else if (m === 'cel') sync.pull('cel');
}
document.querySelector('.tabs').addEventListener('click', function (e) { var t = e.target.closest('.tab'); if (t) setMode(t.dataset.mode); });

function textOf(box) {
  var L = [], big = box.querySelector('.sum .big'), sm = box.querySelector('.sum .small');
  if (big) L.push(big.textContent.trim());
  if (sm) L.push(sm.textContent.trim());
  if (L.length) L.push('');
  Array.prototype.forEach.call(box.querySelectorAll('.loot > li'), function (li) {
    if (li.classList.contains('tube')) {
      var tn = li.querySelector('.tn');
      L.push(tn.querySelector('b').textContent + ': ' + tn.querySelector('span').textContent);
      Array.prototype.forEach.call(li.querySelectorAll('.kv > div'), function (x) { L.push('  ' + x.querySelector('dt').textContent + ': ' + x.querySelector('dd').textContent); });
    } else {
      var b = li.querySelector('.nm b'), a = li.querySelector('.amt');
      if (b && a) L.push(b.textContent + ': ' + a.textContent);
    }
  });
  var st = box.querySelectorAll('.steps li');
  if (st.length) { L.push(''); Array.prototype.forEach.call(st, function (s, i) { L.push((i + 1) + '. ' + s.textContent); }); }
  return L.join('\n');
}
function copyText(t, btn) {
  var label = btn.getAttribute('data-l') || btn.textContent;
  btn.setAttribute('data-l', label);
  function done(ok) { btn.textContent = ok ? 'COPIADO!' : 'SELECIONE E COPIE'; setTimeout(function () { btn.textContent = label; }, 1600); }
  function fallback() {
    var ta = document.createElement('textarea'), ok = false;
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta); done(ok);
  }
  try { navigator.clipboard.writeText(t).then(function () { done(true); }, fallback); } catch (_) { fallback(); }
}
document.addEventListener('click', function (e) {
  var b = e.target.closest ? e.target.closest('.tool') : null;
  if (!b) return;
  var box = b.closest('#out, #outCel, #estOut, #conAOut');
  if (!box) return;
  if (b.getAttribute('data-act') === 'reset') {
    Array.prototype.forEach.call(box.querySelectorAll('.chk'), function (c) { delete CK[c.id]; });
    updateXp(box);
    touch(scopeOf(box));
  } else copyText(textOf(box), b);
});
document.addEventListener('focusin', function (e) {
  var t = e.target;
  if (t && t.matches && t.matches('input.num, #vol')) { try { t.select(); } catch (_) {} }
});
var up = document.getElementById('up');
window.addEventListener('scroll', function () { up.hidden = (window.pageYOffset || document.documentElement.scrollTop) < 500; }, { passive: true });
up.addEventListener('click', function () {
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
});


// ---------- persistência híbrida: localStorage + Supabase ----------
var curMode = 'sol';
var LS_KEY = 'labarcade';
// store.rec[escopo] = { inputs, checks, rt } — escopo = id da solução ou 'cel'; rt = última versão remota vista
var store = {};
try { store = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (_) { store = {}; }
store.rec = store.rec || {};

var CEL_KEYS = ['c1', 'c2', 'vf', 'nw', 'vw', 'e1', 'e2'];
function prefixOf(scope) { return scope === 'cel' ? 'cc-' : 'c-'; }

function snapshot(scope) {
  var inputs = {}, checks = {}, pre = prefixOf(scope);
  if (scope === 'cel') CEL_KEYS.forEach(function (k) { inputs[k] = cEl[k].value; });
  else inputs.vol = volEl.value;
  Object.keys(CK).forEach(function (k) { if (CK[k] && k.indexOf(pre) === 0) checks[k] = true; });
  return { inputs: inputs, checks: checks };
}

// aplica um estado (local ou remoto) nos campos e nas marcações; não mexe em campo com foco
function applyState(scope, st, reset) {
  st = st || {};
  var inp = st.inputs || {}, pre = prefixOf(scope);
  function setv(el, v, dflt) {
    if (!reset && document.activeElement === el) return;
    if (v != null) el.value = v; else if (reset && dflt != null) el.value = dflt;
  }
  if (scope === 'cel') CEL_KEYS.forEach(function (k) { setv(cEl[k], inp[k]); });
  else setv(volEl, inp.vol, cur.def);
  Object.keys(CK).forEach(function (k) { if (k.indexOf(pre) === 0) delete CK[k]; });
  Object.keys(st.checks || {}).forEach(function (k) { if (st.checks[k]) CK[k] = true; });
}
function restore(scope) { applyState(scope, store.rec[scope], true); }

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ mode: curMode, sol: cur.id, rec: store.rec })); } catch (_) {}
}
function stash(scope) {          // grava só localmente
  var s = snapshot(scope), prev = store.rec[scope] || {};
  store.rec[scope] = { inputs: s.inputs, checks: s.checks, rt: prev.rt || 0 };
  save();
  return s;
}
function touch(scope) {          // alteração do usuário: grava local e envia ao Supabase
  sync.push(scope, stash(scope));
}

// aceita do servidor só chaves conhecidas, textos curtos e marcações true
function cleanState(scope, st) {
  var out = { inputs: {}, checks: {} }, pre = prefixOf(scope);
  var keys = scope === 'cel' ? CEL_KEYS : ['vol'];
  st = st && typeof st === 'object' ? st : {};
  keys.forEach(function (k) {
    var v = st.inputs && st.inputs[k];
    if (typeof v === 'string' && v.length <= 40) out.inputs[k] = v;
  });
  Object.keys(st.checks || {}).forEach(function (k) {
    if (st.checks[k] === true && k.indexOf(pre) === 0 && /^[a-z0-9_-]{1,16}$/.test(k)) out.checks[k] = true;
  });
  return out;
}

function onRemote(scope, st, rt) {
  st = cleanState(scope, st);
  if (scope !== 'cel' && scope !== cur.id) {            // receita que não está aberta: só guarda
    store.rec[scope] = { inputs: st.inputs, checks: st.checks, rt: rt };
    save();
    return;
  }
  var before = JSON.stringify(snapshot(scope));
  applyState(scope, st);
  var changed = before !== JSON.stringify(snapshot(scope));
  store.rec[scope] = Object.assign(snapshot(scope), { rt: rt });
  save();
  if (!changed) return;
  if (scope === 'cel' && curMode === 'cel') renderCel();   // renderCel/render chamam updateXp → barra de XP
  else if (scope === cur.id && curMode === 'sol') render();
}

var syncTag = document.getElementById('syncTag');
var SYNC_TXT = { local: 'SYNC: SÓ NESTE PC', online: 'SYNC: ONLINE', offline: 'SYNC: OFFLINE (SALVO NO PC)' };
function onStatus(s, lab) {
  syncTag.hidden = false;
  syncTag.dataset.s = s;
  syncTag.textContent = SYNC_TXT[s]; // não exibe o código do laboratório na tela
}

// ---------- inicialização ----------
var sv = S.filter(function (s) { return s.id === store.sol; })[0];
if (sv) { cur = sv; solEl.value = sv.id; }
restore(cur.id);
applyState('cel', store.rec.cel);
sync.init({
  onRemote: onRemote,
  onStatus: onStatus,
  getRt: function (scope) { return (store.rec[scope] || {}).rt || 0; },
  onSynced: function (scope, rt) { if (store.rec[scope]) { store.rec[scope].rt = rt; save(); } }
});
setMode(MODES[store.mode] ? store.mode : 'sol');
