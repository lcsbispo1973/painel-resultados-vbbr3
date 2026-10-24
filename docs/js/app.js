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
  function montaTempo() {
    var box = P.$('ctl-tempo'); box.replaceChildren();
    box.appendChild(P.label('Base', P.select('sel-base', Object.keys(Dados.BASES).map(function (k) { return [k, Dados.BASES[k]]; }), S.base, function (v) { S.base = v; ajustaIntervalo(); render(); }, 'Base de período')));
    box.appendChild(P.label('De', P.select('sel-de', [], null, function (v) { S.de = v; render(); }, 'Período inicial')));
    box.appendChild(P.label('Até', P.select('sel-ate', [], null, function (v) { S.ate = v; render(); }, 'Período final')));
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Atalhos de período' });
    [['8', 'Últimos 8'], ['12', 'Últimos 12'], ['20', 'Últimos 20'], ['0', 'Tudo']].forEach(function (c) {
      chips.appendChild(h('button', { class: 'btn', type: 'button', 'data-n': c[0], onclick: function () {
        var l = P.M.periodos('dre', S.base), n = +c[0]; S.ate = l[l.length - 1]; S.de = n ? l[Math.max(0, l.length - n)] : l[0]; ajustaIntervalo(true); render();
      } }, c[1]));
    });
    box.appendChild(chips);
  }
  function ajustaIntervalo(forca) {
    var l = P.M.periodos('dre', S.base);
    if (!l.length) return;
    var nel = function (p, dir) {  // ajusta para o período válido mais próximo
      if (!p) return dir < 0 ? l[Math.max(0, l.length - 12)] : l[l.length - 1];
      var c = l.filter(function (x) { return dir < 0 ? ord(x) >= ord(p) : ord(x) <= ord(p); });
      return c.length ? (dir < 0 ? c[0] : c[c.length - 1]) : (dir < 0 ? l[0] : l[l.length - 1]);
    };
    if (!S.de && !forca) S.de = l[Math.max(0, l.length - 12)];
    S.de = nel(S.de, -1); S.ate = nel(S.ate, 1);
    if (ord(S.de) > ord(S.ate)) S.de = S.ate;
    var opts = l.map(function (p) { return [p, P.M.rotulo(p, S.base)]; });
    P.opcoes(P.$('sel-de'), opts, S.de); P.opcoes(P.$('sel-ate'), opts, S.ate);
    P.$('sel-base').value = S.base;
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
        ref.chart = P.chart('c-ind'); ref.titulo = h('h2'); ref.formula = h('p', { class: 'note' }); ref.tb = h('table');
        el.append(
          h('div', { class: 'controls' }, P.label('Grupo', P.select('sel-grupo', grupos, S.grupo, function (v) { S.grupo = v; render(); }, 'Grupo')),
            h('button', { class: 'btn', type: 'button', onclick: exporta }, 'Baixar CSV')),
          h('div', { class: 'card wide', style: 'margin-bottom:14px' }, ref.titulo, ref.formula, ref.chart),
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
    var C = { base: 'T', a: null, b: null, secao: 'todas', niv: 'r' }, ref = {};
    function periodos() { return P.M.periodos('dre', C.base); }
    function iniciaPeriodos(forca) {
      var l = periodos(); if (!l.length) return;
      if (forca || !l.includes(C.a)) C.a = l[l.length - 1];
      if (forca || !l.includes(C.b) || C.b === C.a) C.b = l.includes(P.M.desloca(C.a, 4)) ? P.M.desloca(C.a, 4) : l[0];
      var op = l.slice().reverse().map(function (p) { return [p, P.M.rotulo(p, C.base)]; });
      P.opcoes(ref.selA, op, C.a); P.opcoes(ref.selB, op, C.b);
    }
    function montaLinhas() {
      var M = P.M, out = [], rotA = M.rotulo(C.a, C.base), rotB = M.rotulo(C.b, C.base);
      var par = function (a, b, un) {
        var d = ok(a) && ok(b) ? a - b : null, rel = ok(a) && ok(b) && b !== 0 && (a < 0) === (b < 0) ? a / b - 1 : null;
        if (un === '%') return [P.fUn('%', a), P.fUn('%', b), ok(d) ? (d >= 0 ? '+' : '−') + f1(Math.abs(d)) + ' p.p.' : '—', '—'];
        if (un && un !== 'R$ mi') return [P.fUn(un, a), P.fUn(un, b), ok(d) ? (d >= 0 ? '+' : '−') + P.fUn(un, Math.abs(d)) : '—', '—'];
        return [P.fN(a), P.fN(b), P.fN(d), P.fPct(rel)];
      };
      var csvRows = [];
      ['dre', 'bp', 'dfc', 'dva'].forEach(function (ds) {
        if (C.secao !== 'todas' && C.secao !== ds) return;
        out.push({ grupo: NOME_DS[ds] });
        M.linhas(ds).forEach(function (l) {
          if (ds === 'dre' && l.cd_conta.indexOf('3.99') === 0) return;
          if (C.niv === 'r' && !RESUMO[ds](l)) return;
          var a = M.agg(ds, l.cd_conta, C.a, C.base), b = M.agg(ds, l.cd_conta, C.b, C.base);
          if (!ok(a) && !ok(b)) return;
          var c = par(a, b);
          out.push({ id: ds + l.cd_conta, conta: l.cd_conta + '  ' + l.conta, nivel: l.nivel, cel: c, cls: TOT[ds].indexOf(l.cd_conta) >= 0 ? 'tot' : (l.nivel <= 2 ? 'l1' : '') });
          csvRows.push([NOME_DS[ds], l.cd_conta, l.conta, numCsv(a), numCsv(b), numCsv(ok(a) && ok(b) ? a - b : null)]);
        });
      });
      if (C.secao === 'todas' || C.secao === 'ind') {
        out.push({ grupo: 'Indicadores' });
        var g = null;
        M.indicadores.forEach(function (i) {
          var a = M.ind(i.id, C.a, C.base), b = M.ind(i.id, C.b, C.base);
          if (!ok(a) && !ok(b)) return;
          out.push({ id: 'i' + i.id, conta: i.nome + '  (' + i.un + ')', nivel: 2, cel: par(a, b, i.un), cls: '' });
          csvRows.push(['Indicadores', i.id, i.nome + ' (' + i.un + ')', numCsv(a), numCsv(b), numCsv(ok(a) && ok(b) ? a - b : null)]);
        });
      }
      return { out: out, csv: csvRows, rotA: rotA, rotB: rotB };
    }
    return {
      init: function (el) {
        ref.selA = h('select', { 'aria-label': 'Período A' }); ref.selB = h('select', { 'aria-label': 'Período B' });
        ref.selA.addEventListener('change', function () { C.a = ref.selA.value; this.render(); }.bind(this));
        ref.selB.addEventListener('change', function () { C.b = ref.selB.value; this.render(); }.bind(this));
        var self = this;
        ref.selBase = P.select('cmp-base', Object.keys(Dados.BASES).map(function (k) { return [k, Dados.BASES[k]]; }), C.base, function (v) { C.base = v; iniciaPeriodos(true); self.render(); }, 'Base');
        ref.selSec = P.select('cmp-sec', [['todas', 'Tudo'], ['dre', 'Resultado'], ['bp', 'Balanço'], ['dfc', 'Fluxo de caixa'], ['dva', 'DVA'], ['ind', 'Indicadores']], C.secao, function (v) { C.secao = v; self.render(); }, 'Seção');
        ref.selNiv = P.select('cmp-niv', [['r', 'Resumo'], ['d', 'Detalhado']], C.niv, function (v) { C.niv = v; self.render(); }, 'Nível');
        ref.tb = h('table'); ref.tit = h('h2');
        var atalho = function (k, txt) { return h('button', { class: 'btn', type: 'button', onclick: function () { var l = periodos(); C.a = l[l.length - 1]; var b = P.M.desloca(C.a, k); C.b = l.includes(b) ? b : l[0]; self.render(); } }, txt); };
        el.append(
          h('div', { class: 'controls' }, P.label('Base', ref.selBase), P.label('Período A', ref.selA), P.label('Período B', ref.selB)),
          h('div', { class: 'controls' }, P.label('Seção', ref.selSec), P.label('Nível', ref.selNiv), atalho(4, 'Último × mesmo período do ano anterior'), atalho(1, 'Último × período anterior'),
            h('button', { class: 'btn', type: 'button', onclick: function () { var r = montaLinhas(); P.csv('vibra_comparacao_' + r.rotA + '_vs_' + r.rotB + '.csv', ['secao', 'cd_conta', 'conta', r.rotA, r.rotB, 'diferenca'], r.csv); } }, 'Baixar CSV')),
          h('p', { class: 'note' }, 'Compare quaisquer dois períodos, na mesma base (trimestre, acumulado no ano, últimos 12 meses ou ano). A variação percentual só é calculada quando os dois valores têm o mesmo sinal; indicadores em % mostram a diferença em pontos percentuais.'),
          ref.tit, h('div', { class: 'twrap' }, ref.tb));
        iniciaPeriodos(true);
      },
      render: function () {
        ref.selBase.value = C.base; ref.selSec.value = C.secao; ref.selNiv.value = C.niv;
        iniciaPeriodos(false);
        var r = montaLinhas();
        ref.tit.textContent = r.rotA + ' (A) contra ' + r.rotB + ' (B)';
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
        ref.selP = h('select', { 'aria-label': 'Período' }); ref.selP.addEventListener('change', function () { A.p = ref.selP.value; self.render(); });
        ref.selBase = P.select('mda-base', Object.keys(Dados.BASES).map(function (k) { return [k, Dados.BASES[k]]; }), A.base, function (v) { A.base = v; iniciaP(true); self.render(); }, 'Base');
        ref.texto = h('div', { class: 'mda' }); ref.ponte = P.chart('c-ponte'); ref.ponteCard = P.card('Ponte do lucro líquido', 'Variação do lucro líquido consolidado entre os dois períodos, por componente da DRE (R$ milhões).', ref.ponte, true);
        el.append(
          h('div', { class: 'controls' }, P.label('Base', ref.selBase), P.label('Período', ref.selP),
            h('button', { class: 'btn', type: 'button', onclick: function () { if (ultimo && navigator.clipboard) navigator.clipboard.writeText(txt(ultimo)).catch(function () { }); } }, 'Copiar texto'),
            h('button', { class: 'btn', type: 'button', onclick: function () { if (ultimo) P.texto('analise_' + ultimo.periodo + '_' + ultimo.base + '.txt', txt(ultimo)); } }, 'Baixar texto')),
          h('div', { class: 'aviso' }, 'Análise gerada automaticamente por regras, a partir das demonstrações consolidadas da CVM e dos indicadores do painel. Descreve o que mudou e em quanto; não explica as causas. Não substitui o Comentário do Desempenho (MD&A) nem o item 10 do Formulário de Referência da Companhia.'),
          ref.ponteCard, ref.texto);
        iniciaP(true);
      },
      render: function () {
        ref.selBase.value = A.base; iniciaP(false);
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
        var ids = ['receita', 'lucro', 'ebitda', 'margens', 'caixa', 'divida', 'alav', 'roe'];
        ref.ch = {}; ids.forEach(function (i) { ref.ch[i] = P.chart('x-' + i); });
        el.append(ref.kpis, h('div', { class: 'grid' },
          P.card('Receita', 'CVM, conta 3.01, R$ milhões. Inclui a marcação a mercado do trading de energia.', ref.ch.receita),
          P.card('Lucro líquido', 'CVM, conta 3.11 (consolidado, inclui não controladores), R$ milhões.', ref.ch.lucro),
          P.card('EBITDA', 'R$ milhões. Contábil: calculado da CVM (EBIT sem equivalência + D&A). Ajustado: release, medida da Companhia (só na base trimestre).', ref.ch.ebitda),
          P.card('Margens', 'Em % da receita.', ref.ch.margens),
          P.card('Fluxo de caixa', 'DFC da CVM, R$ milhões. Livre = operacional + investimentos em imobilizado e intangível.', ref.ch.caixa),
          P.card('Dívida líquida', 'R$ milhões, fim do período. Dívida bruta inclui arrendamentos; menos caixa e aplicações.', ref.ch.divida),
          P.card('Alavancagem', 'Dívida líquida ÷ EBITDA contábil dos últimos 12 meses (x).', ref.ch.alav),
          P.card('Retorno sobre o patrimônio', 'ROE: lucro dos controladores UDM ÷ PL dos controladores médio (%).', ref.ch.roe)));
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
        var rs = cols.map(P.rot), v = function (id) { return cols.map(function (p) { return M.ind(id, p, S.base); }); };
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
      nav.appendChild(h('button', { role: 'tab', 'data-tab': id, 'aria-selected': 'false', onclick: function () { P.aba(id); } }, pg.titulo));
      pg.el = h('section', { class: 'page', id: 'p-' + id, hidden: true }); main.appendChild(pg.el);
    });
  };
  P.iniciaTempo = function () { montaTempo(); ajustaIntervalo(true); };
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 150); });
})();
