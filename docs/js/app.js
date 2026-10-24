/* Painel VBBR3: núcleo (estado, controles de período, utilitários) e páginas de demonstrações, indicadores, comparação e análise automática. */
(function () {
  'use strict';
  var Dados = window.Dados, Mda = window.Mda, G = window.Graficos;
  var P = window.P = { D: {}, M: null, S: { aba: 'exec', base: 'T', de: null, ate: null, niv: { dre: 'r', bp: 'r', dfc: 'r', dva: 'r', dra: 'r' }, modo: 'v', sel: {}, ind: 'ebitda', grupo: '' }, paginas: {}, ordem: [] };
  var S = P.S;

  // ---------- utilitários ----------
  var loc = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['R$ ', ''] });
  var fInt = loc.format(',.0f'), f1 = loc.format(',.1f'), f2 = loc.format(',.2f');
  var ok = Dados.ok;
  P.ok = ok;
  P.fN = function (v) { return !ok(v) ? '—' : (v < 0 ? '(' + fInt(-v) + ')' : fInt(v)); };
  P.fBi = function (v) { return !ok(v) ? '—' : (v < 0 ? '−' : '') + 'R$ ' + f1(Math.abs(v) / 1000) + ' bi'; };
  P.fPct = function (v) { return !ok(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + f1(Math.abs(v) * 100) + '%'; };
  P.fPct0 = function (v) { return !ok(v) ? '—' : f1(v) + '%'; };   // v já em pontos percentuais
  P.f1 = f1; P.f2 = f2; P.fInt = fInt;
  P.fData = function (s) { if (!s) return '—'; var p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s; };
  P.fUn = function (un, v) {
    if (!ok(v)) return '—';
    if (un === '%') return f1(v) + '%';
    if (un === 'x') return f2(v) + 'x';
    if (un === 'dias') return f1(v);
    if (un === 'R$') return f2(v);
    if (un === 'milhões') return f1(v);
    return P.fN(v);
  };
  P.$ = function (id) { return document.getElementById(id); };
  var h = P.h = function (tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) {
      if (Array.isArray(c)) return c.forEach(add);
      if (c == null || c === false) return;
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return e;
  };
  var ord = Dados.ord;
  P.chart = function (id) { return h('div', { class: 'chart', id: id }); };
  P.card = function (titulo, nota, corpo, larga) { return h('div', { class: 'card' + (larga ? ' wide' : '') }, h('h2', null, titulo), nota ? h('p', { class: 'note' }, nota) : null, corpo); };
  P.opcoes = function (sel, itens, valor) { sel.replaceChildren(); itens.forEach(function (i) { var o = new Option(i[1], i[0]); sel.appendChild(o); }); if (valor != null) sel.value = valor; if (sel.value !== String(valor) && sel.options.length) sel.selectedIndex = 0; };
  P.select = function (id, itens, valor, aoMudar, rotulo) {
    var s = h('select', { id: id, 'aria-label': rotulo }); P.opcoes(s, itens, valor); s.addEventListener('change', function () { aoMudar(s.value); }); return s;
  };
  P.label = function (txt, ctl) { return h('label', null, txt, ctl); };
  P.csv = function (nome, cab, linhas) {
    var esc = function (v) { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var txt = '﻿' + [cab].concat(linhas).map(function (r) { return r.map(esc).join(';'); }).join('\n');
    var a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })), download: nome }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };
  P.texto = function (nome, txt) {
    var a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' })), download: nome }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };
  var numCsv = function (v) { return ok(v) ? String(Math.round(v * 1e6) / 1e6).replace('.', ',') : ''; };
  P.numCsv = numCsv;

  // tabela genérica: cols = [rótulos], linhas = [{cd, conta, nivel, cls, cel: [texto...], ...}]
  P.tabela = function (tb, primeira, cols, linhas, aoClicar) {
    tb.replaceChildren();
    var hr = h('tr', null, h('th', { scope: 'col' }, primeira), cols.map(function (c) { return h('th', { scope: 'col' }, c); }));
    tb.appendChild(h('thead', null, hr));
    var corpo = h('tbody');
    linhas.forEach(function (l) {
      if (l.grupo) { corpo.appendChild(h('tr', { class: 'grp' }, h('td', { colspan: cols.length + 1 }, l.grupo))); return; }
      var tr = h('tr', { class: [l.cls || '', aoClicar ? 'clk' : ''].join(' ').trim(), 'data-id': l.id || null });
      var c0 = h('td', { style: 'padding-left:' + (10 + Math.max(0, (l.nivel || 2) - 2) * 12) + 'px' }, l.conta);
      tr.appendChild(c0);
      l.cel.forEach(function (t, i) { var td = h('td', { class: l.cclass && l.cclass[i] ? l.cclass[i] : '' }, t); tr.appendChild(td); });
      if (aoClicar) tr.addEventListener('click', function () { aoClicar(l); });
      corpo.appendChild(tr);
    });
    tb.appendChild(corpo);
  };

  // ---------- período global ----------
  var TEMPO_ABAS = { exec: 1, dre: 1, bp: 1, dfc: 1, outras: 1, ind: 1 };
  P.lista = function (ds) {
    var l = P.M.periodos(ds || 'dre', S.base);
    if (S.de) l = l.filter(function (p) { return ord(p) >= ord(S.de); });
    if (S.ate) l = l.filter(function (p) { return ord(p) <= ord(S.ate); });
    return l;
  };
  P.rot = function (p) { return P.M.rotulo(p, S.base); };
  // filtros globais: as escolhas ficam pendentes até o botão Aplicar (os atalhos aplicam na hora)
  var PEND = null;
  function montaTempo() {
    var box = P.$('ctl-tempo'); box.replaceChildren();
    PEND = { base: S.base, de: S.de, ate: S.ate };
    var marca = function () {
      var mud = PEND.base !== S.base || PEND.de !== S.de || PEND.ate !== S.ate, b = P.$('btn-aplicar');
      b.disabled = !mud; b.className = 'btn' + (mud ? ' sel' : ''); b.textContent = mud ? 'Aplicar' : 'Aplicado';
    };
    box.appendChild(P.label('Base', P.select('sel-base', Object.keys(Dados.BASES).map(function (k) { return [k, Dados.BASES[k]]; }), S.base, function (v) { PEND.base = v; opcoesTempo(PEND); marca(); }, 'Base de período')));
    box.appendChild(P.label('De', P.select('sel-de', [], null, function (v) { PEND.de = v; if (ord(PEND.de) > ord(PEND.ate)) { PEND.ate = PEND.de; P.$('sel-ate').value = PEND.ate; } marca(); }, 'Período inicial')));
    box.appendChild(P.label('Até', P.select('sel-ate', [], null, function (v) { PEND.ate = v; if (ord(PEND.de) > ord(PEND.ate)) { PEND.de = PEND.ate; P.$('sel-de').value = PEND.de; } marca(); }, 'Período final')));
    box.appendChild(h('button', { class: 'btn', type: 'button', id: 'btn-aplicar', disabled: 'disabled', onclick: function () {
      S.base = PEND.base; S.de = PEND.de; S.ate = PEND.ate; ajustaIntervalo(); render();
    } }, 'Aplicado'));
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Atalhos de período' });
    [['8', 'Últimos 8'], ['12', 'Últimos 12'], ['20', 'Últimos 20'], ['0', 'Tudo']].forEach(function (c) {
      chips.appendChild(h('button', { class: 'btn', type: 'button', 'data-n': c[0], onclick: function () {
        S.base = PEND.base;
        var l = P.M.periodos('dre', S.base), n = +c[0]; S.ate = l[l.length - 1]; S.de = n ? l[Math.max(0, l.length - n)] : l[0]; ajustaIntervalo(true); render();
      } }, c[1]));
    });
    box.appendChild(chips);
    P.marcaTempo = marca;
  }
  function opcoesTempo(st) {   // ajusta De/Até à base (escolhida ou pendente), sem recalcular o painel
    var l = P.M.periodos('dre', st.base);
    if (!l.length) return;
    var nel = function (p, dir) {  // período válido mais próximo
      if (!p) return dir < 0 ? l[Math.max(0, l.length - 12)] : l[l.length - 1];
      var c = l.filter(function (x) { return dir < 0 ? ord(x) >= ord(p) : ord(x) <= ord(p); });
      return c.length ? (dir < 0 ? c[0] : c[c.length - 1]) : (dir < 0 ? l[0] : l[l.length - 1]);
    };
    st.de = nel(st.de, -1); st.ate = nel(st.ate, 1);
    if (ord(st.de) > ord(st.ate)) st.de = st.ate;
    var opts = l.map(function (p) { return [p, P.M.rotulo(p, st.base)]; });
    P.opcoes(P.$('sel-de'), opts, st.de); P.opcoes(P.$('sel-ate'), opts, st.ate);
    P.$('sel-base').value = st.base;
  }
  function ajustaIntervalo(forca) {
    var l = P.M.periodos('dre', S.base);
    if (!l.length) return;
    if (!S.de && !forca) S.de = l[Math.max(0, l.length - 12)];
    opcoesTempo(S);
    if (PEND) { PEND.base = S.base; PEND.de = S.de; PEND.ate = S.ate; if (P.marcaTempo) P.marcaTempo(); }
  }

  // ---------- demonstrações ----------
  var RESUMO = {
    dre: function (l) { return l.nivel === 2 && l.cd_conta.indexOf('3.99') !== 0; },
    bp: function (l) { return l.nivel <= 3; },
    dfc: function (l) { return ['6.01', '6.02', '6.03', '6.04', '6.05', '6.05.01', '6.05.02'].indexOf(l.cd_conta) >= 0; },
    dva: function (l) { return l.nivel <= 2; },
    dra: function (l) { return l.nivel <= 2; }
  };
  var TOT = { dre: ['3.03', '3.05', '3.07', '3.09', '3.11'], bp: ['1', '2'], dfc: ['6.05'], dva: ['7.03', '7.05', '7.07'], dra: ['4.03'] };
  var PADRAO = { dre: '3.11', bp: '1', dfc: '6.01', dva: '7.03', dra: '4.03' };
  var NOME_DS = { dre: 'Demonstração do resultado consolidada', bp: 'Balanço patrimonial consolidado', dfc: 'Demonstração dos fluxos de caixa consolidada', dva: 'Demonstração do valor adicionado consolidada', dra: 'Demonstração do resultado abrangente consolidada' };
  var NOTA_DS = {
    dre: 'R$ milhões. O 4º trimestre é a diferença entre o ano e o acumulado de nove meses. A conta 3.01 inclui a marcação a mercado do trading de energia. O lucro por ação (3.99) não é exibido: veja o indicador "Lucro por ação (UDM)".',
    bp: 'R$ milhões, saldos no fim de cada período. Empréstimos e financiamentos incluem arrendamentos.',
    dfc: 'R$ milhões, método indireto. Trimestres obtidos pela diferença dos acumulados do ano.',
    dva: 'R$ milhões. Trimestres obtidos pela diferença dos acumulados do ano.',
    dra: 'R$ milhões. O 4º trimestre é a diferença entre o ano e o acumulado de nove meses.'
  };
  var DEN = { dre: ['3.01', '% da receita (3.01)'], bp: ['1', '% do ativo total'], dva: ['7.01', '% das receitas (7.01)'] };

  function celula(ds, cd, p, modo) {
    var M = P.M, a = M.agg(ds, cd, p, S.base);
    if (modo === 'ah') { var b = M.agg(ds, cd, M.desloca(p, 4), S.base); return ok(a) && ok(b) && b !== 0 && (a < 0) === (b < 0) ? a / b - 1 : null; }
    if (modo === 'av') { var d = M.agg(ds, DEN[ds][0], p, S.base); return ok(a) && ok(d) && d !== 0 ? a / d : null; }
    return a;
  }
  function modoValido(ds) { if (S.modo === 'av' && !DEN[ds]) return 'v'; return S.modo; }
  function linhasDemo(ds, cols, filtroNivel) {
    var M = P.M, modo = modoValido(ds), out = [];
    M.linhas(ds).forEach(function (l) {
      if (ds === 'dre' && l.cd_conta.indexOf('3.99') === 0) return;
      if (filtroNivel && !RESUMO[ds](l)) return;
      var vals = cols.map(function (p) { return celula(ds, l.cd_conta, p, modo); });
      if (!vals.some(ok)) return;
      var fm = modo === 'v' ? P.fN : function (x) { return !ok(x) ? '—' : (modo === 'ah' ? P.fPct(x) : f1(x * 100) + '%'); };
      out.push({ id: l.cd_conta, cd: l.cd_conta, conta: l.cd_conta + '  ' + l.conta, nivel: l.nivel, vals: vals, cel: vals.map(fm),
        cls: TOT[ds].indexOf(l.cd_conta) >= 0 ? 'tot' : (l.nivel <= 2 ? 'l1' : '') });
    });
    return out;
  }
  function paginaDemo(ds, titulo) {
    var ref = {};
    return {
      init: function (el) {
        var selConta = h('select', { id: 'sel-conta-' + ds, 'aria-label': 'Conta' });
        P.M.linhas(ds).forEach(function (l) { if (!(ds === 'dre' && l.cd_conta.indexOf('3.99') === 0)) selConta.appendChild(new Option(l.cd_conta + '  ' + l.conta, l.cd_conta)); });
        selConta.value = S.sel[ds] || PADRAO[ds]; if (selConta.selectedIndex < 0) selConta.selectedIndex = 0;
        selConta.addEventListener('change', function () { S.sel[ds] = selConta.value; render(); });
        var modos = [['v', 'Valores'], ['ah', 'Variação % a/a']].concat(DEN[ds] ? [['av', DEN[ds][1]]] : []);
        var selModo = P.select('modo-' + ds, modos, S.modo, function (v) { S.modo = v; render(); }, 'Exibir');
        var selNiv = P.select('niv-' + ds, [['r', 'Resumo'], ['d', 'Detalhado']], S.niv[ds], function (v) { S.niv[ds] = v; render(); }, 'Nível');
        ref.selModo = selModo; ref.selNiv = selNiv; ref.selConta = selConta;
        ref.titulo = h('h2'); ref.chart = P.chart('c-' + ds); ref.tb = h('table');
        el.append(
          h('div', { class: 'controls' }, P.label('Conta', selConta), P.label('Exibir', selModo), P.label('Nível', selNiv),
            h('button', { class: 'btn', type: 'button', onclick: function () { exportaDemo(ds); } }, 'Baixar CSV')),
          h('div', { class: 'card wide', style: 'margin-bottom:14px' }, ref.titulo, h('p', { class: 'note' }, NOTA_DS[ds]), ref.chart),
          h('div', { class: 'sec' }, h('h2', null, titulo)),
          h('div', { class: 'twrap' }, ref.tb));
      },
      render: function () {
        var cols = P.lista(ds), modo = modoValido(ds), l = P.M.linha(ds, ref.selConta.value) || P.M.linhas(ds)[0];
        if (S.modo !== modo) S.modo = modo;
        ref.selModo.value = modo; ref.selNiv.value = S.niv[ds];
        ref.titulo.textContent = l.cd_conta + '  ' + l.conta;
        var vals = cols.map(function (p) { return celula(ds, l.cd_conta, p, modo); });
        G.barras(ref.chart, cols.map(P.rot), modo === 'v' ? vals : vals.map(function (v) { return ok(v) ? v * 100 : null; }), l.conta, modo === 'v' ? P.fN : function (x) { return f1(x) + '%'; });
        P.tabela(ref.tb, 'R$ milhões', cols.map(P.rot), linhasDemo(ds, cols, S.niv[ds] === 'r'));
      }
    };
  }
  function exportaDemo(ds) {
    var cols = P.lista(ds), modo = S.modo === 'av' && !DEN[ds] ? 'v' : S.modo, ls = linhasDemo(ds, cols, S.niv[ds] === 'r');
    P.csv('vibra_' + ds + '_' + S.base + '.csv', ['cd_conta', 'conta'].concat(cols.map(P.rot)), ls.map(function (l) { return [l.cd, l.conta.slice(l.cd.length + 2)].concat(l.vals.map(function (v) { return numCsv(modo === 'v' ? v : (ok(v) ? v * 100 : null)); })); }));
  }

  // ---------- outras demonstrações (DVA, DRA, DMPL) ----------
  function paginaOutras() {
    var ref = { sub: 'dva', dva: paginaDemo('dva'), dra: paginaDemo('dra') };
    return {
      init: function (el) {
        ref.caixa = h('div'); ref.tb = h('table'); ref.dmplBox = h('div', { hidden: true });
        var sel = P.select('sel-outras', [['dva', 'DVA – valor adicionado'], ['dra', 'DRA – resultado abrangente'], ['dmpl', 'DMPL – mutações do patrimônio líquido']], ref.sub, function (v) { ref.sub = v; render(); }, 'Demonstração');
        ref.dvaEl = h('div'); ref.draEl = h('div'); ref.dva.init(ref.dvaEl); ref.dra.init(ref.draEl);
        // DMPL
        ref.dmpl = { p: null, col: '' };
        ref.dmplSel = P.select('sel-dmpl-p', [], null, function (v) { ref.dmpl.p = v; renderDmpl(); }, 'Data de referência');
        ref.dmplTb = h('table');
        ref.dmplEl = h('div', null,
          h('div', { class: 'controls' }, P.label('Data de referência (acumulado do ano até)', ref.dmplSel),
            h('button', { class: 'btn', type: 'button', onclick: function () { exportaDmpl(); } }, 'Baixar CSV')),
          h('p', { class: 'note' }, 'R$ milhões. Cada coluna é um componente do patrimônio líquido; as linhas são as mutações acumuladas desde o início do exercício até a data. Fonte: DFP/ITR (DMPL consolidada).'),
          h('div', { class: 'twrap' }, ref.dmplTb));
        el.append(h('div', { class: 'controls' }, P.label('Demonstração', sel)), ref.dvaEl, ref.draEl, ref.dmplEl);
      },
      render: function () {
        document.getElementById('sel-outras').value = ref.sub;
        ref.dvaEl.hidden = ref.sub !== 'dva'; ref.draEl.hidden = ref.sub !== 'dra'; ref.dmplEl.hidden = ref.sub !== 'dmpl';
        P.$('ctl-tempo').hidden = ref.sub === 'dmpl';
        if (ref.sub === 'dva') ref.dva.render(); else if (ref.sub === 'dra') ref.dra.render(); else { initDmpl(); renderDmpl(); }
      }
    };
    function dmplDados() { return P.D.dmpl; }
    function initDmpl() {
      var d = dmplDados(); if (!d || ref.dmpl.p) return;
      var ps = d.periodos.slice().reverse().map(function (p) { return [p, p]; });
      P.opcoes(ref.dmplSel, ps, ps[0][0]); ref.dmpl.p = ps[0][0];
    }
    function dmplMatriz() {
      var d = dmplDados(), p = ref.dmpl.p, map = {};
      d.valores.forEach(function (v) { if (v[0] === p) map[v[1] + '|' + v[2]] = v[3]; });
      var cols = d.colunas.filter(function (c) { return d.valores.some(function (v) { return v[0] === p && v[2] === c; }); });
      var linhas = d.contas.filter(function (c) { return cols.some(function (k) { return map[c.cd_conta + '|' + k] != null; }); });
      return { cols: cols, linhas: linhas, map: map };
    }
    function renderDmpl() {
      if (!dmplDados()) return;
      var m = dmplMatriz();
      P.tabela(ref.dmplTb, 'R$ milhões', m.cols, m.linhas.map(function (c) {
        var cel = m.cols.map(function (k) { return P.fN(m.map[c.cd_conta + '|' + k]); });
        return { cd: c.cd_conta, conta: c.cd_conta + '  ' + c.conta, nivel: c.cd_conta.split('.').length, cel: cel, cls: ['5.01', '5.03', '5.07'].indexOf(c.cd_conta) >= 0 ? 'tot' : '' };
      }));
    }
    function exportaDmpl() {
      var m = dmplMatriz();
      P.csv('vibra_dmpl_' + ref.dmpl.p + '.csv', ['cd_conta', 'conta'].concat(m.cols), m.linhas.map(function (c) { return [c.cd_conta, c.conta].concat(m.cols.map(function (k) { return numCsv(m.map[c.cd_conta + '|' + k]); })); }));
    }
  }

  // ---------- indicadores ----------
  function paginaIndicadores() {
    var ref = {};
    function linhasInd(cols) {
      var out = [], g = null;
      P.M.indicadores.forEach(function (i) {
        if (S.grupo && i.grupo !== S.grupo) return;
        var vals = cols.map(function (p) { return P.M.ind(i.id, p, S.base); });
        if (!vals.some(ok)) return;
        if (i.grupo !== g) { g = i.grupo; out.push({ grupo: g }); }
        out.push({ id: i.id, cd: i.id, conta: i.nome + (i.un === 'R$ mi' ? '' : '  (' + i.un + ')'), nivel: 2, vals: vals, cel: vals.map(function (v) { return P.fUn(i.un, v); }), cls: S.ind === i.id ? 'act' : '', i: i });
      });
      return out;
    }
    return {
      init: function (el) {
        var grupos = [['', 'Todos os grupos']].concat(Object.keys(P.M.grupos).map(function (k) { return [P.M.grupos[k], P.M.grupos[k]]; }));
        ref.chart = P.chart('c-ind'); ref.titulo = h('h2'); ref.formula = h('p', { class: 'note' }); ref.tb = h('table'); ref.tbD = h('table');
        el.append(
          h('div', { class: 'controls' }, P.label('Grupo', P.select('sel-grupo', grupos, S.grupo, function (v) { S.grupo = v; render(); }, 'Grupo')),
            h('button', { class: 'btn', type: 'button', onclick: exporta }, 'Baixar CSV')),
          h('div', { class: 'card wide', style: 'margin-bottom:14px' }, ref.titulo, ref.formula, ref.chart),
          h('h3', null, 'Decomposição do ROE (DuPont)'),
          h('p', { class: 'note' }, 'ROE consolidado = margem líquida × giro do ativo × alavancagem financeira, sempre nos últimos 12 meses (UDM). O produto dos três fatores fecha com o ROE consolidado.'),
          h('div', { class: 'twrap', style: 'margin-bottom:14px' }, ref.tbD),
          h('p', { class: 'note' }, 'Clique em uma linha para ver o gráfico. Indicadores de retorno, alavancagem e ciclo usam os últimos 12 meses (UDM) até cada data, qualquer que seja a base escolhida. Indicadores de saldo (liquidez, estrutura) usam a posição no fim do período.'),
          h('div', { class: 'twrap' }, ref.tb));
      },
      render: function () {
        var cols = P.lista('dre'), ind = P.M.indicadores.filter(function (i) { return i.id === S.ind; })[0] || P.M.indicadores[0];
        S.ind = ind.id;
        var vals = cols.map(function (p) { return P.M.ind(ind.id, p, S.base); });
        ref.titulo.textContent = ind.nome + (ind.un ? ' (' + ind.un + ')' : '');
        ref.formula.textContent = 'Fórmula: ' + ind.formula + '. ' + (ind.nota || '');
        var tipoLinha = ind.un === '%' || ind.un === 'x' || ind.un === 'dias';
        if (tipoLinha) G.linhas(ref.chart, cols.map(P.rot), [{ nome: ind.nome, vals: vals }], function (v) { return P.fUn(ind.un, v); });
        else G.barras(ref.chart, cols.map(P.rot), vals, ind.nome, function (v) { return P.fUn(ind.un, v); });
        var dp = [['mliqudm', 'Margem líquida'], ['giro', '× Giro do ativo'], ['alav', '× Alavancagem (ativo ÷ PL)'], ['roecons', '= ROE consolidado']];
        P.tabela(ref.tbD, 'Fator', cols.map(P.rot), dp.map(function (x, k) {
          var i = P.M.indicadores.filter(function (z) { return z.id === x[0]; })[0], vs = cols.map(function (p) { return P.M.ind(x[0], p, S.base); });
          return { id: x[0], conta: x[1], nivel: 2, vals: vs, cel: vs.map(function (v) { return P.fUn(i.un, v); }), cls: k === 3 ? 'tot' : '' };
        }), function (l) { S.ind = l.id; render(); });
        P.tabela(ref.tb, 'Indicador', cols.map(P.rot), linhasInd(cols), function (l) { S.ind = l.id; render(); });
      }
    };
    function exporta() {
      var cols = P.lista('dre'), ls = linhasInd(cols).filter(function (l) { return !l.grupo; });
      P.csv('vibra_indicadores_' + S.base + '.csv', ['grupo', 'indicador', 'unidade', 'formula'].concat(cols.map(P.rot)),
        ls.map(function (l) { return [l.i.grupo, l.i.nome, l.i.un, l.i.formula].concat(l.vals.map(numCsv)); }));
    }
  }

  // ---------- comparar períodos ----------
  function paginaComparar() {
    // C = escolha aplicada; E = edição pendente (só vale depois de Aplicar)
    var C = { modo: 'base', base: 'T', a: null, b: null, aIni: null, aFim: null, bIni: null, bFim: null, secao: 'todas', niv: 'r' }, E = null, ref = {};
    var copia = function (o) { return JSON.parse(JSON.stringify(o)); };
    var trims = function () { return P.M.periodos('dre', 'T'); };
    function lados(st) {   // [períodoA, baseA, períodoB, baseB]
      return st.modo === 'livre' ? [st.aFim, 'R:' + st.aIni, st.bFim, 'R:' + st.bIni] : [st.a, st.base, st.b, st.base];
    }
    function normaliza(st, forca) {
      var l = P.M.periodos('dre', st.base), t = trims();
      if (l.length) {
        if (forca || !l.includes(st.a)) st.a = l[l.length - 1];
        if (forca || !l.includes(st.b) || st.b === st.a) st.b = l.includes(P.M.desloca(st.a, 4)) ? P.M.desloca(st.a, 4) : l[0];
      }
      if (forca || !st.aFim) { st.aFim = t[t.length - 1]; st.aIni = P.M.desloca(st.aFim, 1); st.bFim = P.M.desloca(st.aFim, 4); st.bIni = P.M.desloca(st.aIni, 4); }
      if (Dados.ord(st.aIni) > Dados.ord(st.aFim)) st.aIni = st.aFim;
      if (Dados.ord(st.bIni) > Dados.ord(st.bFim)) st.bIni = st.bFim;
    }
    function preencheControles() {
      var l = P.M.periodos('dre', E.base).slice().reverse().map(function (p) { return [p, P.M.rotulo(p, E.base)]; });
      var t = trims().slice().reverse().map(function (p) { return [p, p]; });
      P.opcoes(ref.selA, l, E.a); P.opcoes(ref.selB, l, E.b);
      P.opcoes(ref.aIni, t, E.aIni); P.opcoes(ref.aFim, t, E.aFim); P.opcoes(ref.bIni, t, E.bIni); P.opcoes(ref.bFim, t, E.bFim);
      ref.selModo.value = E.modo; ref.selBase.value = E.base; ref.selSec.value = E.secao; ref.selNiv.value = E.niv;
      ref.boxBase.hidden = E.modo !== 'base'; ref.boxLivre.hidden = E.modo !== 'livre';
      var mud = JSON.stringify(E) !== JSON.stringify(C);
      ref.aplicar.disabled = !mud; ref.aplicar.className = 'btn' + (mud ? ' sel' : ''); ref.aplicar.textContent = mud ? 'Aplicar' : 'Aplicado';
    }
    function montaLinhas() {
      var M = P.M, out = [], L = lados(C), pA = L[0], bA = L[1], pB = L[2], bB = L[3];
      var rotA = M.rotulo(pA, bA), rotB = M.rotulo(pB, bB);
      var par = function (a, b, un) {
        var d = ok(a) && ok(b) ? a - b : null, rel = ok(a) && ok(b) && b !== 0 && (a < 0) === (b < 0) ? a / b - 1 : null;
        if (un === '%') return [P.fUn('%', a), P.fUn('%', b), ok(d) ? (d >= 0 ? '+' : '−') + f1(Math.abs(d)) + ' p.p.' : '—', '—'];
        if (un && un !== 'R$ mi') return [P.fUn(un, a), P.fUn(un, b), ok(d) ? (d >= 0 ? '+' : '−') + P.fUn(un, Math.abs(d)) : '—', '—'];
        return [P.fN(a), P.fN(b), P.fN(d), P.fPct(rel)];
      };
      var csvRows = [];
      ['dre', 'bp', 'dfc', 'dva'].forEach(function (ds) {
        if (C.secao !== 'todas' && C.secao !== ds) return;
        out.push({ grupo: NOME_DS[ds] + (ds === 'bp' ? ' (saldo no fim de cada período)' : '') });
        M.linhas(ds).forEach(function (l) {
          if (ds === 'dre' && l.cd_conta.indexOf('3.99') === 0) return;
          if (C.niv === 'r' && !RESUMO[ds](l)) return;
          var a = M.agg(ds, l.cd_conta, pA, bA), b = M.agg(ds, l.cd_conta, pB, bB);
          if (!ok(a) && !ok(b)) return;
          out.push({ id: ds + l.cd_conta, conta: l.cd_conta + '  ' + l.conta, nivel: l.nivel, cel: par(a, b), cls: TOT[ds].indexOf(l.cd_conta) >= 0 ? 'tot' : (l.nivel <= 2 ? 'l1' : '') });
          csvRows.push([NOME_DS[ds], l.cd_conta, l.conta, numCsv(a), numCsv(b), numCsv(ok(a) && ok(b) ? a - b : null)]);
        });
      });
      if (C.secao === 'todas' || C.secao === 'ind') {
        out.push({ grupo: 'Indicadores' });
        M.indicadores.forEach(function (i) {
          var a = M.ind(i.id, pA, bA), b = M.ind(i.id, pB, bB);
          if (!ok(a) && !ok(b)) return;
          out.push({ id: 'i' + i.id, conta: i.nome + '  (' + i.un + ')', nivel: 2, cel: par(a, b, i.un), cls: '' });
          csvRows.push(['Indicadores', i.id, i.nome + ' (' + i.un + ')', numCsv(a), numCsv(b), numCsv(ok(a) && ok(b) ? a - b : null)]);
        });
      }
      var nA = C.modo === 'livre' ? Dados.ord(C.aFim) - Dados.ord(C.aIni) + 1 : 0, nB = C.modo === 'livre' ? Dados.ord(C.bFim) - Dados.ord(C.bIni) + 1 : 0;
      return { out: out, csv: csvRows, rotA: rotA, rotB: rotB, aviso: nA !== nB ? 'Atenção: o período A tem ' + nA + ' trimestre(s) e o B tem ' + nB + '; os fluxos não são diretamente comparáveis.' : '' };
    }
    return {
      init: function (el) {
        var self = this;
        normaliza(C, true); E = copia(C);
        var sel = function (lbl, campo) { var s = h('select', { 'aria-label': lbl }); s.addEventListener('change', function () { E[campo] = s.value; normaliza(E, false); preencheControles(); }); return s; };
        ref.selA = sel('Período A', 'a'); ref.selB = sel('Período B', 'b');
        ref.aIni = sel('A: de', 'aIni'); ref.aFim = sel('A: até', 'aFim'); ref.bIni = sel('B: de', 'bIni'); ref.bFim = sel('B: até', 'bFim');
        ref.selModo = P.select('cmp-modo', [['base', 'Períodos padrão'], ['livre', 'Intervalo livre (somar trimestres)']], E.modo, function (v) { E.modo = v; preencheControles(); }, 'Modo');
        ref.selBase = P.select('cmp-base', Object.keys(Dados.BASES).map(function (k) { return [k, Dados.BASES[k]]; }), E.base, function (v) { E.base = v; normaliza(E, true); preencheControles(); }, 'Base');
        ref.selSec = P.select('cmp-sec', [['todas', 'Tudo'], ['dre', 'Resultado'], ['bp', 'Balanço'], ['dfc', 'Fluxo de caixa'], ['dva', 'DVA'], ['ind', 'Indicadores']], E.secao, function (v) { E.secao = v; preencheControles(); }, 'Seção');
        ref.selNiv = P.select('cmp-niv', [['r', 'Resumo'], ['d', 'Detalhado']], E.niv, function (v) { E.niv = v; preencheControles(); }, 'Nível');
        ref.aplicar = h('button', { class: 'btn', type: 'button', onclick: function () { C = copia(E); self.render(); } }, 'Aplicado');
        ref.tb = h('table'); ref.tit = h('h2'); ref.aviso = h('div', { class: 'aviso', hidden: true });
        ref.boxBase = h('div', { class: 'controls' }, P.label('Base', ref.selBase), P.label('Período A', ref.selA), P.label('Período B', ref.selB));
        ref.boxLivre = h('div', { class: 'controls' }, h('span', { class: 'kl' }, 'A'), P.label('de', ref.aIni), P.label('até', ref.aFim), h('span', { class: 'kl' }, 'B'), P.label('de', ref.bIni), P.label('até', ref.bFim));
        // atalhos: aplicam na hora
        var atalho = function (txt, f) { return h('button', { class: 'btn', type: 'button', onclick: function () { E = copia(C); f(E); normaliza(E, false); C = copia(E); self.render(); } }, txt); };
        var ultT = function () { var t = trims(); return t[t.length - 1]; };
        var ultCom = function (base) { var l = P.M.periodos('dre', base); return l[l.length - 1]; };
        var padrao = function (base) { return function (s) { s.modo = 'base'; s.base = base; s.a = ultCom(base); s.b = P.M.desloca(s.a, 4); }; };
        el.append(
          h('div', { class: 'controls' }, P.label('Modo', ref.selModo), P.label('Seção', ref.selSec), P.label('Nível', ref.selNiv), ref.aplicar,
            h('button', { class: 'btn', type: 'button', onclick: function () { var r = montaLinhas(); P.csv('vibra_comparacao_' + r.rotA + '_vs_' + r.rotB + '.csv', ['secao', 'cd_conta', 'conta', r.rotA, r.rotB, 'diferenca'], r.csv); } }, 'Baixar CSV')),
          ref.boxBase, ref.boxLivre,
          h('div', { class: 'controls' }, h('span', { class: 'kl' }, 'Atalhos (aplicam na hora):'),
            h('div', { class: 'chips' },
              atalho('Trimestre a/a', padrao('T')), atalho('Semestre a/a', padrao('S')), atalho('9 meses a/a', padrao('9M')), atalho('Ano a/a', padrao('AN')), atalho('12 meses a/a', padrao('LTM')),
              atalho('Trimestre × anterior', function (s) { s.modo = 'base'; s.base = 'T'; s.a = ultT(); s.b = P.M.desloca(s.a, 1); }),
              atalho('2º semestre a/a', function (s) { var l = P.M.periodos('dre', 'S').filter(function (p) { return p[0] === '4'; }); s.modo = 'base'; s.base = 'S'; s.a = l[l.length - 1]; s.b = P.M.desloca(s.a, 4); }))),
          h('p', { class: 'note' }, 'Períodos padrão: trimestre, semestre, 9 meses, acumulado no ano, 12 meses ou ano. Intervalo livre: soma os trimestres escolhidos (por exemplo 2T25 a 1T26 contra 2T24 a 1T25); o balanço usa o saldo no último trimestre de cada intervalo. Indicadores de retorno, alavancagem e valuation usam sempre os 12 meses até o fim de cada período. A variação percentual só é calculada quando os dois valores têm o mesmo sinal; indicadores em % mostram a diferença em pontos percentuais.'),
          ref.tit, ref.aviso, h('div', { class: 'twrap' }, ref.tb));
        preencheControles();
      },
      render: function () {
        normaliza(C, false); E = copia(C); preencheControles();
        var r = montaLinhas();
        ref.tit.textContent = r.rotA + ' (A) contra ' + r.rotB + ' (B)';
        ref.aviso.hidden = !r.aviso; ref.aviso.textContent = r.aviso;
        P.tabela(ref.tb, 'R$ milhões', [r.rotA, r.rotB, 'A − B', 'A ÷ B − 1'], r.out);
      }
    };
  }

  // ---------- análise automática (MD&A do painel) ----------
  function paginaMda() {
    var A = { base: 'T', p: null }, ref = {}, ultimo = null;
    function lista() { return P.M.periodos('dre', A.base).filter(function (p) { return P.M.agg('dre', '3.01', P.M.desloca(p, 4), A.base) !== null; }); }
    function iniciaP(forca) { var l = lista(); if (forca || !l.includes(A.p)) A.p = l[l.length - 1]; P.opcoes(ref.selP, l.slice().reverse().map(function (p) { return [p, P.M.rotulo(p, A.base)]; }), A.p); }
    return {
      init: function (el) {
        var self = this;
        var marca = function () { var mud = ref.selP.value !== A.p || ref.selBase.value !== A.base; ref.apl.disabled = !mud; ref.apl.className = 'btn' + (mud ? ' sel' : ''); ref.apl.textContent = mud ? 'Aplicar' : 'Aplicado'; };
        ref.selP = h('select', { 'aria-label': 'Período' }); ref.selP.addEventListener('change', marca);
        ref.selBase = P.select('mda-base', Object.keys(Dados.BASES).map(function (k) { return [k, Dados.BASES[k]]; }), A.base, function (v) {
          var l = P.M.periodos('dre', v).filter(function (p) { return P.M.agg('dre', '3.01', P.M.desloca(p, 4), v) !== null; });
          P.opcoes(ref.selP, l.slice().reverse().map(function (p) { return [p, P.M.rotulo(p, v)]; }), l[l.length - 1]); marca();
        }, 'Base');
        ref.apl = h('button', { class: 'btn', type: 'button', disabled: 'disabled', onclick: function () { A.base = ref.selBase.value; A.p = ref.selP.value; self.render(); } }, 'Aplicado');
        ref.texto = h('div', { class: 'mda' }); ref.ponte = P.chart('c-ponte'); ref.ponteCard = P.card('Ponte do lucro líquido', 'Variação do lucro líquido consolidado entre os dois períodos, por componente da DRE (R$ milhões).', ref.ponte, true);
        el.append(
          h('div', { class: 'controls' }, P.label('Base', ref.selBase), P.label('Período', ref.selP), ref.apl,
            h('button', { class: 'btn', type: 'button', onclick: function () { if (ultimo && navigator.clipboard) navigator.clipboard.writeText(txt(ultimo)).catch(function () { }); } }, 'Copiar texto'),
            h('button', { class: 'btn', type: 'button', onclick: function () { if (ultimo) P.texto('analise_' + ultimo.periodo + '_' + ultimo.base + '.txt', txt(ultimo)); } }, 'Baixar texto')),
          h('div', { class: 'aviso' }, 'Análise gerada automaticamente por regras, a partir das demonstrações consolidadas da CVM e dos indicadores do painel. Descreve o que mudou e em quanto; não explica as causas. Não substitui o Comentário do Desempenho (MD&A) nem o item 10 do Formulário de Referência da Companhia.'),
          ref.ponteCard, ref.texto);
        iniciaP(true);
      },
      render: function () {
        ref.selBase.value = A.base; iniciaP(false); ref.apl.disabled = true; ref.apl.className = 'btn'; ref.apl.textContent = 'Aplicado';
        var r = Mda.gerar(P.M, A.p, A.base, { seg: P.D.seg, conferencias: P.D.conf });
        ultimo = r;
        ref.texto.replaceChildren(h('h2', null, r.titulo + ' (comparação com ' + r.referencia + ')'));
        r.blocos.forEach(function (b) {
          ref.texto.appendChild(h('h3', null, b.titulo));
          b.paragrafos.forEach(function (t) { ref.texto.appendChild(h('p', null, t)); });
          if (b.itens.length) ref.texto.appendChild(h('ul', null, b.itens.map(function (t) { return h('li', null, t); })));
        });
        r.avisos.forEach(function (t) { ref.texto.appendChild(h('div', { class: 'aviso' }, t)); });
        var a = P.M.agg('dre', '3.11', A.p, A.base), b = P.M.agg('dre', '3.11', P.M.desloca(A.p, 4), A.base);
        ref.ponteCard.hidden = !(r.ponte.length && ok(a) && ok(b));
        if (!ref.ponteCard.hidden) G.cascata(ref.ponte, { rot: 'Lucro ' + r.referencia, v: b }, r.ponte.filter(function (x) { return Math.abs(x.v) >= 0.5; }).map(function (x) { return { rot: x.rot, v: x.v }; }), { rot: 'Lucro ' + P.M.rotulo(A.p, A.base), v: a }, P.fN);
      }
    };
    function txt(r) {
      var l = [r.titulo + ' (comparação com ' + r.referencia + ')', ''];
      r.blocos.forEach(function (b) { l.push(b.titulo.toUpperCase()); b.paragrafos.forEach(function (t) { l.push(t); }); b.itens.forEach(function (t) { l.push('- ' + t); }); l.push(''); });
      return l.concat(r.avisos).join('\n');
    }
  }

  // ---------- visão executiva ----------
  var KPIS = [
    { rot: 'Receita', id: 'receita' }, { rot: 'Resultado bruto', id: 'rbruto' }, { rot: 'EBITDA contábil (CVM)', id: 'ebitda' },
    { rot: 'Lucro líquido', id: 'lucro' }, { rot: 'Fluxo de caixa operacional', id: 'fco' }, { rot: 'Fluxo de caixa livre', id: 'fcl' },
    { rot: 'Dívida líquida', id: 'dliq', bom: 'desce' }, { rot: 'Dívida líquida ÷ EBITDA (UDM)', id: 'dlebitda', bom: 'desce' }, { rot: 'ROE (UDM)', id: 'roe' }
  ];
  function paginaExec() {
    var ref = {};
    return {
      init: function (el) {
        ref.kpis = h('div', { class: 'grid kpis' });
        var ids = ['receita', 'lucro', 'ebitda', 'margens', 'caixa', 'divida', 'alav', 'roe', 'mcap', 'mult'];
        ref.mkt = h('div'); ref.mktCards = h('div', { class: 'grid kpis' }); ref.mktNota = h('p', { class: 'note' });
        ref.mkt.append(h('h3', null, 'Mercado'), ref.mktNota, ref.mktCards);
        ref.ipe = h('div', { class: 'card', style: 'margin-bottom:14px' });
        ref.ch = {}; ids.forEach(function (i) { ref.ch[i] = P.chart('x-' + i); });
        el.append(ref.kpis, ref.mkt, ref.ipe, h('div', { class: 'grid' },
          P.card('Receita', 'CVM, conta 3.01, R$ milhões. Inclui a marcação a mercado do trading de energia.', ref.ch.receita),
          P.card('Lucro líquido', 'CVM, conta 3.11 (consolidado, inclui não controladores), R$ milhões.', ref.ch.lucro),
          P.card('EBITDA', 'R$ milhões. Contábil: calculado da CVM (EBIT sem equivalência + D&A). Ajustado: release, medida da Companhia (só na base trimestre).', ref.ch.ebitda),
          P.card('Margens', 'Em % da receita.', ref.ch.margens),
          P.card('Fluxo de caixa', 'DFC da CVM, R$ milhões. Livre = operacional + investimentos em imobilizado e intangível.', ref.ch.caixa),
          P.card('Dívida líquida', 'R$ milhões, fim do período. Dívida bruta inclui arrendamentos; menos caixa e aplicações.', ref.ch.divida),
          P.card('Alavancagem', 'Dívida líquida ÷ EBITDA contábil dos últimos 12 meses (x).', ref.ch.alav),
          P.card('Retorno sobre o patrimônio', 'ROE: lucro dos controladores UDM ÷ PL dos controladores médio (%).', ref.ch.roe),
          P.card('Valor de mercado', 'R$ milhões ao fim de cada período: cotação da B3 × ações em circulação (CVM). Disponível a partir de 1T20.', ref.ch.mcap),
          P.card('Múltiplos', 'Ao fim de cada período, com lucro e EBITDA dos últimos 12 meses (x).', ref.ch.mult)));
      },
      render: function () {
        var M = P.M, cols = P.lista('dre'), ult = M.periodos('dre', S.base).slice(-1)[0];
        ref.kpis.replaceChildren();
        KPIS.forEach(function (k) {
          var i = M.indicadores.filter(function (x) { return x.id === k.id; })[0], a = M.ind(k.id, ult, S.base);
          if (!ok(a)) return;
          var tt = S.base === 'T' || S.base === 'LTM' ? M.ind(k.id, M.desloca(ult, 1), S.base) : null, aa = M.ind(k.id, M.desloca(ult, 4), S.base);
          var dl = function (b) {
            var s = h('span');
            if (!ok(b)) { s.textContent = '—'; return s; }
            var v, txt;
            if (i.un === 'R$ mi') { if (b === 0 || (a < 0) !== (b < 0)) { s.textContent = 'n/d'; return s; } v = a / b - 1; txt = P.fPct(v); }
            else { v = a - b; txt = (v >= 0 ? '+' : '−') + (i.un === '%' ? f1(Math.abs(v)) + ' p.p.' : P.fUn(i.un, Math.abs(v))); }
            s.textContent = txt; if (v !== 0) s.className = ((v > 0) === ((k.bom || 'sobe') === 'sobe')) ? 'up' : 'down'; return s;
          };
          var valor = i.un === 'R$ mi' ? P.fBi(a) : P.fUn(i.un, a);
          ref.kpis.appendChild(h('div', { class: 'card' }, h('div', { class: 'kl' }, k.rot + ' · ' + M.rotulo(ult, S.base)), h('div', { class: 'kv' }, valor),
            h('div', { class: 'kd' }, tt !== null || S.base === 'T' || S.base === 'LTM' ? h('span', null, 't/t ', dl(tt)) : null, h('span', null, 'a/a ', dl(aa)))));
        });
        var docs = P.D.ipe && P.D.ipe.documentos && P.ipeGrupo ? P.D.ipe.documentos.filter(P.ipeGrupo('chave')[2]).slice(0, 6) : [];
        ref.ipe.hidden = !docs.length; ref.ipe.replaceChildren();
        if (docs.length) {
          ref.ipe.append(h('div', { class: 'sec', style: 'margin:0 0 6px' }, h('h2', null, 'Últimos fatos relevantes, comunicados e avisos'), h('a', { href: '#ipe' }, 'Ver todos')),
            h('ul', { class: 'lista-ipe' }, docs.map(function (d) {
              return h('li', null, h('span', { class: 'kl' }, P.fData(d.data_entrega) + ' · ' + d.categoria), h('br'), d.link ? h('a', { href: d.link, target: '_blank', rel: 'noopener noreferrer' }, d.assunto || d.tipo || d.categoria) : (d.assunto || d.tipo));
            })));
        }
        var cotUlt = M.ultimaCotacao();
        ref.mkt.hidden = !cotUlt; ref.mktCards.replaceChildren();
        if (cotUlt) {
          var dtc = cotUlt.d.split('-').reverse().join('/');
          ref.mktNota.textContent = 'Cotação de fechamento da B3 em ' + dtc + ' (R$ ' + P.f2(cotUlt.p) + ') com as demonstrações de ' + M.rotulo(M.periodos('dre', 'T').slice(-1)[0], 'T') + '. Valores em R$ milhões, múltiplos sobre os últimos 12 meses.';
          [['Valor de mercado', 'mcap'], ['Valor da firma (EV)', 'ev'], ['P/L', 'pl'], ['P/VP', 'pvp'], ['EV/EBITDA contábil', 'evebitda'], ['FCL ÷ valor de mercado', 'fcfy'], ['Proventos pagos ÷ valor de mercado', 'dy']].forEach(function (x) {
            var i = M.indicadores.filter(function (z) { return z.id === x[1]; })[0], val = M.indAtual(x[1]);
            if (!ok(val)) return;
            ref.mktCards.appendChild(h('div', { class: 'card', title: i.formula }, h('div', { class: 'kl' }, x[0]), h('div', { class: 'kv' }, i.un === 'R$ mi' ? P.fBi(val) : P.fUn(i.un, val))));
          });
        }
        var rs = cols.map(P.rot), v = function (id) { return cols.map(function (p) { return M.ind(id, p, S.base); }); };
        G.barras(ref.ch.mcap, rs, v('mcap'), 'Valor de mercado', P.fN);
        G.linhas(ref.ch.mult, rs, [{ nome: 'P/L', vals: v('pl') }, { nome: 'EV/EBITDA', vals: v('evebitda') }, { nome: 'P/VP', vals: v('pvp') }], function (x) { return f1(x) + 'x'; });
        G.barras(ref.ch.receita, rs, v('receita'), 'Receita', P.fN);
        G.barras(ref.ch.lucro, rs, v('lucro'), 'Lucro líquido', P.fN);
        var aj = P.D.seg ? P.D.seg.linhas.filter(function (l) { return l.cd_conta === 'EBITDA'; })[0] : null;
        var series = [{ nome: 'EBITDA contábil (CVM)', vals: v('ebitda') }];
        if (aj && S.base === 'T') series.push({ nome: 'EBITDA Ajustado (release)', vals: cols.map(function (p) { return ok(aj[p]) ? aj[p] : null; }) });
        G.linhas(ref.ch.ebitda, rs, series, P.fN);
        G.linhas(ref.ch.margens, rs, [{ nome: 'Margem bruta', vals: v('mb') }, { nome: 'Margem EBITDA contábil', vals: v('mebitda') }, { nome: 'Margem líquida', vals: v('mliq') }], function (x) { return f1(x) + '%'; });
        G.linhas(ref.ch.caixa, rs, [{ nome: 'Operacional', vals: v('fco') }, { nome: 'Livre', vals: v('fcl') }], P.fN);
        G.barras(ref.ch.divida, rs, v('dliq'), 'Dívida líquida', P.fN);
        G.linhas(ref.ch.alav, rs, [{ nome: 'Dív. líq. ÷ EBITDA (x)', vals: v('dlebitda') }], function (x) { return f2(x) + 'x'; });
        G.linhas(ref.ch.roe, rs, [{ nome: 'ROE (UDM)', vals: v('roe') }], function (x) { return f1(x) + '%'; });
        // frase do topo
        var tk = P.$('take'); tk.replaceChildren();
        var u = M.periodos('dre', 'T').slice(-1)[0], l = M.ind('lucro', u, 'T'), la = M.ind('lucro', M.desloca(u, 4), 'T'), e = M.ind('ebitda', u, 'T'), ea = M.ind('ebitda', M.desloca(u, 4), 'T');
        if (ok(l)) {
          var d = function (a, b) { var s = h('span'); if (ok(a) && ok(b) && b > 0 && a > 0) { var r = a / b - 1; s.textContent = P.fPct(r); s.className = r >= 0 ? 'up' : 'down'; } else s.textContent = 'sem base de comparação'; return s; };
          tk.append('Lucro líquido do ' + u + ': ' + P.fBi(l) + ' (', d(l, la), ' contra o mesmo trimestre do ano anterior). EBITDA contábil: ' + P.fBi(e) + ' (', d(e, ea), ' a/a).');
        }
      }
    };
  }

  // ---------- registro e ciclo de vida ----------
  P.registra = function (id, titulo, pagina, usaTempo) { P.paginas[id] = { titulo: titulo, obj: pagina, usaTempo: !!usaTempo, el: null, pronto: false }; P.ordem.push(id); };
  P.nucleo = function () {
    P.registra('exec', 'Visão executiva', paginaExec(), true);
    P.registra('dre', 'Resultado', paginaDemo('dre', NOME_DS.dre), true);
    P.registra('bp', 'Balanço', paginaDemo('bp', NOME_DS.bp), true);
    P.registra('dfc', 'Fluxo de caixa', paginaDemo('dfc', NOME_DS.dfc), true);
    P.registra('outras', 'DVA, DRA e DMPL', paginaOutras(), true);
    P.registra('ind', 'Indicadores', paginaIndicadores(), true);
    P.registra('comp', 'Comparar períodos', paginaComparar(), false);
    P.registra('mda', 'Análise automática', paginaMda(), false);
  };
  function render() {
    var pg = P.paginas[S.aba]; if (!pg || !P.M) return;
    if (!pg.pronto) { pg.pronto = true; pg.obj.init(pg.el); }
    P.$('ctl-tempo').hidden = !pg.usaTempo;
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (e) { e.hidden = e.id !== 'p-' + S.aba; });
    Array.prototype.forEach.call(document.querySelectorAll('nav.tabs button'), function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === S.aba)); });
    Array.prototype.forEach.call(document.querySelectorAll('.chips button'), function (b) { b.classList.toggle('sel', false); });
    pg.obj.render();
  }
  P.render = render;
  P.aba = function (id) { S.aba = id; try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignora */ } render(); };
  P.montaAbas = function () {
    var nav = P.$('tabs'), main = P.$('pages');
    P.ordem.forEach(function (id) {
      var pg = P.paginas[id];
      if (!(P.ocultas && P.ocultas[id])) nav.appendChild(h('button', { role: 'tab', 'data-tab': id, 'aria-selected': 'false', onclick: function () { P.aba(id); } }, pg.titulo));
      pg.el = h('section', { class: 'page', id: 'p-' + id, hidden: true }); main.appendChild(pg.el);
    });
  };
  P.iniciaTempo = function () { montaTempo(); ajustaIntervalo(true); };
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 150); });
})();
