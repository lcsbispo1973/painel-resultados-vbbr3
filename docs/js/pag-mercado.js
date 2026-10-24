/* Vibra em Números — Mercado (ação e múltiplos, dividendos e retorno, Vibra × Ipiranga), Dívida e Simulador. */
(function () {
  'use strict';
  var P = window.P, G = window.Graficos, h = P.h, ok = P.ok, S = P.S, Dados = window.Dados;

  // ---------- Ipiranga (releases da Ultrapar): soma de trimestres; margem = EBITDA ÷ volume ----------
  P.ipi = function (met, p, base) {
    var I = P.D.ipiranga; if (!I) return null;
    base = base || 'T';
    if (!Dados.fechaBase(base, p)) return null;
    var k = Dados.trimestresBase(base, p), n = Dados.ord(p);
    var soma = function (m) { var s = 0; for (var i = n - k + 1; i <= n; i++) { var x = I.series[Dados.lab(i)]; if (!x || !x[m] || !ok(x[m].v)) return null; s += x[m].v; } return s; };
    if (met === 'margem_m3') { var e = soma('ebitda'), v = soma('vol'); return ok(e) && v ? e / v * 1000 : null; }
    return soma(met);
  };

  // ---------- proventos: totais da DMPL (destinação do lucro do exercício) ----------
  P.proventosAno = function (ano) {
    var d = P.D.dmpl; if (!d) return null;
    var yy = String(ano % 100).padStart(2, '0'), alvo = null;
    ['4T', '3T', '2T', '1T'].some(function (q) { var p = q + yy; if (d.periodos.indexOf(p) >= 0) { alvo = p; return true; } return false; });
    if (!alvo) return null;
    var v = function (cd) { var x = d.valores.filter(function (r) { return r[0] === alvo && r[1] === cd && r[2] === 'Lucros ou Prejuízos Acumulados'; })[0]; return x ? x[3] : 0; };
    var div = -v('5.04.06'), jcp = -v('5.04.07'), tot = div + jcp;
    var luc = alvo[0] === '4' ? P.M.agg('dre', '3.11.01', alvo, 'AN') : null;
    var mc = alvo[0] === '4' ? P.M.ind('mcap', alvo, 'T') : null;
    return { ano: ano, ate: alvo, dividendos: div, jcp: jcp, total: tot, payout: ok(luc) && luc > 0 ? tot / luc * 100 : null, dy: ok(mc) && mc > 0 ? tot / mc * 100 : null, lucro: luc };
  };

  // retorno total (preço + proventos reinvestidos) da VBBR3 e do BOVA11, base 100
  function retornoTotal(desde) {
    var b3 = P.D.b3; if (!b3) return null;
    // provento entra no primeiro pregão depois da data com (quando o aviso da CVM não foi localizado, vale a data do site de RI)
    var ev = ((P.D.div && P.D.div.linhas) || []).map(function (e) { return { d: e.data_com || e.data_ex, v: e.valor_acao }; }).filter(function (e) { return e.d && ok(e.v); }).sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    var dias = b3.dias.filter(function (x) { return x[0] >= desde; }), out = [], idx = 100, k = 0;
    while (k < ev.length && ev[k].d < (dias[0] || [''])[0]) k++;
    for (var i = 0; i < dias.length; i++) {
      if (i > 0) {
        var dv = 0; while (k < ev.length && ev[k].d < dias[i][0]) { dv += ev[k].v; k++; }   // provento entra no primeiro pregão após a data com
        idx *= (dias[i][2] + dv) / dias[i - 1][2];
      }
      out.push([dias[i][0], idx]);
    }
    var bv = (b3.bova11 || []).filter(function (x) { return x[0] >= desde; }), bi = bv.length ? bv.map(function (x) { return [x[0], x[1] / bv[0][1] * 100]; }) : [];
    return { vbbr: out, bova: bi };
  }
  function amostraMensal(s) { var out = [], ult = null; s.forEach(function (x) { var m = x[0].slice(0, 7); if (m !== ult) { out.push(x); ult = m; } else out[out.length - 1] = x; }); return out; }

  function paginaMercado() {
    var ref = {}, SUBS = [['acao', 'Ação e múltiplos'], ['div', 'Dividendos e retorno'], ['ipi', 'Vibra × Ipiranga']];
    function sub() { return P.sub('mer', 'acao'); }
    return {
      init: function (el) { ref.nav = h('div', { class: 'subnav' }); ref.corpo = h('div'); el.append(ref.nav, ref.corpo); },
      render: function () {
        var s = sub();
        ref.nav.replaceChildren(P.segmentado(SUBS, s, function (v) { S.sub.mer = v; P.render(); }, 'Mercado'));
        ref.corpo.replaceChildren();
        if (s === 'acao') acao(ref.corpo); else if (s === 'div') dividendos(ref.corpo); else ipiranga(ref.corpo);
      },
      manchete: function () { var s = sub(); return s === 'div' ? P.manchete.dividendos() : s === 'ipi' ? P.manchete.ipiranga() : P.manchete.mercado(); }
    };
    function acao(el) {
      var b3 = P.D.b3, x = P.x(S.a), cP = P.chart('m-preco'), cM = P.chart('m-mult'), tb = h('table');
      el.append(h('div', { class: 'grid' }, P.card('Cotação de fechamento (VBBR3)', 'R$ por ação, fim de cada mês; até 21/10/2021 o código era BRDT3. Preço como negociado, sem ajuste por proventos.', cP),
        P.card('Múltiplos ao fim de cada período', 'P/L e EV/EBITDA Ajustado sobre os 12 meses; P/VP sobre o patrimônio dos controladores.', cM)),
        h('div', { class: 'sec' }, h('h2', null, 'Indicadores de mercado')), h('div', { class: 'twrap' }, tb));
      var mens = amostraMensal(b3.dias.map(function (d) { return [d[0], d[2]]; }));
      G.linhas(cP, mens.map(function (d) { return d[0].slice(5, 7) + '/' + d[0].slice(2, 4); }), [{ nome: 'VBBR3', vals: mens.map(function (d) { return d[1]; }) }], function (v) { return P.f2(v); });
      var lh = P.hist(x.base === 'T' ? 12 : 8);
      G.linhas(cM, lh.map(P.rotP), [{ nome: 'P/L', vals: lh.map(function (p) { return P.M.ind('pl', p, x.base); }) }, { nome: 'EV/EBITDA Aj.', vals: lh.map(function (p) { return P.M.ind('evebitda', p, x.base); }) }, { nome: 'P/VP', vals: lh.map(function (p) { return P.M.ind('pvp', p, x.base); }) }], function (v) { return P.f1(v) + 'x'; }, { destaque: P.rotulo(S.a) });
      var cols = P.hist(5), ids = P.M.indicadores.filter(function (i) { return i.grupo === P.M.grupos.mer; });
      P.tabela(tb, '', cols.map(P.rotP), ids.map(function (i) { return { conta: i.nome, info: i.formula + '. ' + (i.nota || ''), cel: cols.map(function (p) { return P.fUn(i.un, P.M.ind(i.id, p, x.base)); }) }; }));
    }
    function dividendos(el) {
      var anos = P.M.anos(), linhas = anos.map(function (a) { return P.proventosAno(a); }).filter(function (r) { return r && r.ano >= 2017; });
      var cT = P.chart('d-tot'), cR = P.chart('d-ret'), tb = h('table'), tbEv = h('table'), tbR = h('table');
      el.append(h('div', { class: 'grid' }, P.card('Proventos declarados por exercício', 'R$ milhões: dividendos e juros sobre capital próprio destinados do lucro de cada exercício (DMPL, CVM). O ano corrente mostra o acumulado até o último trimestre divulgado.', cT),
        P.card('Retorno total desde o IPO (base 100)', 'VBBR3 com proventos reinvestidos na data ex (valores por ação do site de RI) × BOVA11 (ETF do Ibovespa). Fechamentos da B3.', cR)),
        h('div', { class: 'sec' }, h('h2', null, 'Proventos e payout por exercício')), h('div', { class: 'twrap' }, tb),
        h('div', { class: 'sec' }, h('h2', null, 'Retorno por ano')), h('div', { class: 'twrap' }, tbR),
        h('div', { class: 'sec' }, h('h2', null, 'Eventos de proventos')), h('p', { class: 'note' }, 'Eventos e valores totais do site de Relações com Investidores. Valor por ação (todas as casas) e data com conferidos com o aviso arquivado na CVM, quando localizado; * data informada no site de RI, sem aviso localizado.'), h('div', { class: 'twrap' }, tbEv));
      G.empilhado(cT, linhas.map(function (r) { return String(r.ano) + (r.ate[0] === '4' ? '' : '*'); }), [{ nome: 'JCP', vals: linhas.map(function (r) { return r.jcp; }) }, { nome: 'Dividendos', vals: linhas.map(function (r) { return r.dividendos; }) }], null, P.fN);
      P.tabela(tb, 'Exercício', ['Dividendos', 'JCP', 'Total', 'Lucro dos controladores', 'Payout', 'Rendimento s/ valor de mercado'], linhas.slice().reverse().map(function (r) {
        return { conta: String(r.ano) + (r.ate[0] === '4' ? '' : ' (até ' + r.ate + ')'), cel: [P.fN(r.dividendos), P.fN(r.jcp), P.fN(r.total), P.fN(r.lucro), P.fUn('%', r.payout), P.fUn('%', r.dy)] };
      }));
      var rt = retornoTotal('2017-12-15');
      if (rt) {
        var mv = amostraMensal(rt.vbbr), mb = {}; amostraMensal(rt.bova).forEach(function (x) { mb[x[0].slice(0, 7)] = x[1]; });
        G.linhas(cR, mv.map(function (d) { return d[0].slice(5, 7) + '/' + d[0].slice(2, 4); }), [{ nome: 'VBBR3 (retorno total)', vals: mv.map(function (d) { return d[1]; }) }, { nome: 'BOVA11', vals: mv.map(function (d) { return mb[d[0].slice(0, 7)] || null; }) }], function (v) { return P.f1(v); });
        var porAno = {}; rt.vbbr.forEach(function (x) { porAno[x[0].slice(0, 4)] = porAno[x[0].slice(0, 4)] || { ini: null }; });
        var fimAno = function (s, a) { var r = null; s.forEach(function (x) { if (x[0].slice(0, 4) === a) r = x[1]; }); return r; };
        var anosR = Object.keys(porAno).sort(), linR = [];
        anosR.forEach(function (a, i) {
          var v1 = fimAno(rt.vbbr, a), v0 = i ? fimAno(rt.vbbr, anosR[i - 1]) : 100, b1 = fimAno(rt.bova, a), b0 = i ? fimAno(rt.bova, anosR[i - 1]) : (rt.bova[0] || [0, 100])[1];
          linR.push({ conta: a + (i === 0 ? ' (desde 15/12)' : '') + (a === new Date().getFullYear() + '' ? ' (até hoje)' : ''), cel: [P.fPct(v1 / v0 - 1), ok(b1) && ok(b0) ? P.fPct(b1 / b0 - 1) : '—'] });
        });
        P.tabela(tbR, 'Ano', ['VBBR3 (retorno total)', 'BOVA11'], linR.reverse());
      }
      var dc = function (e) { return e.data_com || e.data_ex; };
      var ev = ((P.D.div && P.D.div.linhas) || []).slice().sort(function (a, b) { return dc(a) < dc(b) ? 1 : -1; });
      var pa = function (v) { var s = String(v).split('.')[1] || ''; return s.length > 2 ? v.toFixed(5).replace('.', ',') : P.f2(v); };
      P.tabela(tbEv, 'Data com', ['Tipo', 'Exercício', 'Valor total (R$ mi)', 'Por ação (R$)', 'Pagamento', 'Aviso'], ev.map(function (e) {
        return { conta: P.fData(dc(e)) + (e.data_com ? '' : ' *'), cel: [e.provento, String(e.referencia), P.fN(e.valor_total / 1e6), pa(e.valor_acao), P.fData(e.data_pagamento),
          e.aviso ? h('a', { href: e.aviso, target: '_blank', rel: 'noopener noreferrer' }, P.fData(e.aviso_data)) : '—'] };
      }));
    }
    function ipiranga(el) {
      var x = P.x(S.a), lh = P.hist(x.base === 'T' ? 12 : 8), rs = lh.map(P.rotP), dest = { destaque: P.rotulo(S.a) };
      var cM = P.chart('ip-m3'), cV = P.chart('ip-vol'), cE = P.chart('ip-eb'), tb = h('table');
      var vDist = function (p) { var e = P.M.aj('CONS', p, x.base), r = P.M.aj('REN', p, x.base); return ok(e) ? e - (ok(r) ? r : 0) : null; };
      el.append(h('div', { class: 'grid' },
        P.card('Margem EBITDA Ajustado (R$/m³)', 'Vibra Consolidada: EBITDA Ajustado consolidado da nota de segmentos ÷ volume. Vibra Distribuição: sem Renováveis. Ipiranga: EBITDA Ajustado ÷ volume, releases da Ultrapar.', cM),
        P.card('Volume de vendas', 'Mil m³.', cV), P.card('EBITDA Ajustado', 'R$ milhões. Vibra Consolidada, Vibra Distribuição (sem Renováveis) e Ipiranga.', cE)),
        h('div', { class: 'sec' }, h('h2', null, 'Comparação no ' + P.rotuloLongo(S.a))), h('div', { class: 'twrap' }, tb),
        h('p', { class: 'note', style: 'margin-top:10px' }, 'Visão principal: Vibra Consolidada × Ipiranga; complementar: Vibra Distribuição × Ipiranga. A Ipiranga é um segmento da Ultrapar; seus números vêm dos releases da Ultrapar arquivados na CVM, sem eliminações entre segmentos. Definições de EBITDA Ajustado de cada companhia podem diferir. Até 2021 a Ultrapar apresentava o EBITDA do segmento sem a palavra "ajustado".'));
      var mCons = function (p) { var e = P.M.aj('CONS', p, x.base), v = P.oper('CONS', 'vol', p, x.base); return ok(e) && v ? e / v * 1000 : null; };
      G.linhas(cM, rs, [{ nome: 'Vibra Consolidada', vals: lh.map(mCons) }, { nome: 'Ipiranga', vals: lh.map(function (p) { return P.ipi('margem_m3', p, x.base); }) }, { nome: 'Vibra Distribuição', vals: lh.map(function (p) { return P.oper('CONS', 'margem_m3', p, x.base); }) }], P.fInt, dest);
      G.linhas(cV, rs, [{ nome: 'Vibra', vals: lh.map(function (p) { return P.oper('CONS', 'vol', p, x.base); }) }, { nome: 'Ipiranga', vals: lh.map(function (p) { return P.ipi('vol', p, x.base); }) }], P.fN, dest);
      G.linhas(cE, rs, [{ nome: 'Vibra Consolidada', vals: lh.map(function (p) { return P.M.aj('CONS', p, x.base); }) }, { nome: 'Ipiranga', vals: lh.map(function (p) { return P.ipi('ebitda', p, x.base); }) }, { nome: 'Vibra Distribuição', vals: lh.map(vDist) }], P.fN, dest);
      var vc = function (f) { return f(x.p); };
      var lin = [
        ['Volume (mil m³)', P.oper('CONS', 'vol', x.p, x.base), P.oper('CONS', 'vol', x.p, x.base), P.ipi('vol', x.p, x.base), P.fN],
        ['EBITDA Ajustado (R$ mi)', P.M.aj('CONS', x.p, x.base), vc(vDist), P.ipi('ebitda', x.p, x.base), P.fN],
        ['Margem EBITDA (R$/m³)', null, P.oper('CONS', 'margem_m3', x.p, x.base), P.ipi('margem_m3', x.p, x.base), P.fInt]
      ];
      lin[2][1] = mCons(x.p);
      var dif = function (a, b2, f) { var d = ok(a) && ok(b2) ? a - b2 : null; return [ok(d) ? (d >= 0 ? '+' : '−') + f(Math.abs(d)) : '—', ok(d) ? (d >= 0 ? 'pos' : 'neg') : '']; };
      P.tabela(tb, '', ['Vibra Consolidada', 'Ipiranga', 'Consolidada − Ipiranga', 'Vibra Distribuição', 'Distribuição − Ipiranga'], lin.map(function (l) { var d1 = dif(l[1], l[3], l[4]), d2 = dif(l[2], l[3], l[4]); return { conta: l[0], cel: [l[4](l[1]), l[4](l[3]), d1[0], l[4](l[2]), d2[0]], cclass: ['', '', d1[1], '', d2[1]] }; }));
    }
  }

  // ---------- Dívida ----------
  function paginaDivida() {
    var ref = {};
    return {
      init: function (el) {
        ref.cr = P.chart('dv-cr'); ref.hist = P.chart('dv-hist'); ref.alav = P.chart('dv-alav'); ref.tb = h('table'); ref.rat = h('div'); ref.tit = h('h2');
        el.append(h('div', { class: 'grid' }, h('div', { class: 'card' }, ref.tit, h('p', { class: 'note' }, 'R$ milhões por ano de vencimento: financiamentos no país e no exterior (nota explicativa de empréstimos e financiamentos; não inclui arrendamentos).'), ref.cr),
          P.card('Dívida bruta e líquida', 'R$ milhões, fim de cada período. Bruta: empréstimos, financiamentos e arrendamentos (balanço). Líquida: como divulgada no release (dívida bruta + swap − disponibilidades).', ref.hist),
          P.card('Alavancagem', 'Dívida líquida divulgada ÷ EBITDA Ajustado dos últimos 12 meses (nota de segmentos). Linha preta: valor divulgado pela Companhia no release, com uma casa decimal.', ref.alav)),
          h('div', { class: 'sec' }, h('h2', null, 'Cronograma de vencimentos')), h('div', { class: 'twrap' }, ref.tb), ref.rat);
      },
      render: function () {
        var d = P.D.divida, x = P.x(S.a);
        if (d && d.periodos.length) {
          var p = d.periodos.filter(function (q) { return Dados.ord(q) <= Dados.ord(x.p); }).pop() || d.periodos[0], c = d.cronograma[p];
          ref.tit.textContent = 'Vencimentos dos financiamentos em ' + P.fData(c.data_base);
          G.barras(ref.cr, c.colunas.map(function (k) { return k; }), c.total, 'Vencimentos', P.fN);
          var hs = d.periodos.slice(-6);
          P.tabela(ref.tb, 'Data-base', ['Total'].concat(['País', 'Exterior']), hs.slice().reverse().map(function (q) { var y = d.cronograma[q]; return { conta: P.fData(y.data_base), cel: [P.fN(y.total_consolidado), P.fN(y.pais), P.fN(y.exterior)] }; }));
        }
        var lh = P.hist(x.base === 'T' ? 12 : 8), rs = lh.map(P.rotP);
        G.linhas(ref.hist, rs, [{ nome: 'Dívida bruta', vals: lh.map(function (q) { return P.M.ind('dbruta', q, x.base); }) }, { nome: 'Dívida líquida', vals: lh.map(function (q) { return P.M.ind('dliq', q, x.base); }) }], P.fN, { destaque: P.rotulo(S.a) });
        var dr = P.D.dlrel && P.D.dlrel.series;
        G.linhas(ref.alav, rs, [{ nome: 'Dív. líq. ÷ EBITDA Aj.', vals: lh.map(function (q) { return P.M.ind('dlebitda', q, x.base); }) },
          { nome: 'Divulgada (release)', vals: lh.map(function (q) { return dr && dr[q] ? dr[q].alav_divulgada : null; }) }], function (v) { return P.f2(v) + 'x'; }, { destaque: P.rotulo(S.a) });
        ref.rat.replaceChildren();
        if (d && d.rating && d.rating.length) ref.rat.append(h('div', { class: 'sec' }, h('h2', null, 'Relatórios de agências de rating arquivados na CVM')),
          h('ul', { class: 'lista-ipe' }, d.rating.slice(0, 8).map(function (r) { return h('li', null, h('span', { class: 'kl' }, P.fData(r.data)), h('br'), h('a', { href: r.link, target: '_blank', rel: 'noopener noreferrer' }, (r.documento || 'Relatório de rating').replace(/&amp;?/g, '&'))); })));
      },
      manchete: function () { return P.manchete.divida(); }
    };
  }

  // ---------- Simulador ----------
  function paginaSimulador() {
    var ref = {}, est = null;
    function base() {   // últimos 12 meses
      var u = P.M.ultimoPar(), p = u.p;
      var vol = P.oper('CONS', 'vol', p, 'LTM'), aj = P.M.aj('CONS', p, 'LTM'), ren = P.M.aj('REN', p, 'LTM') || 0, corp = P.M.aj('CORP', p, 'LTM') || 0;
      var dist = ok(aj) ? aj - ren : null, m3 = ok(dist) && vol ? (dist - corp) / vol * 1000 : null;
      return { p: p, vol: vol, m3: m3, ren: ren, corp: corp, dl: P.M.ind('dliq', p, 'T'), aj: aj };
    }
    function calc(e) { var eb = e.vol * e.m3 / 1000 + e.corp + e.ren; return { eb: eb, alav: eb > 0 ? e.dl / eb : null }; }
    return {
      init: function (el) {
        var b = base(); est = { vol: Math.round(b.vol), m3: Math.round(b.m3), ren: Math.round(b.ren), corp: Math.round(b.corp), dl: Math.round(b.dl) };
        ref.b = b; ref.form = h('div', { class: 'sim' }); ref.res = h('div', { class: 'grid kpis' }); ref.tb = h('table');
        el.append(h('p', { class: 'note' }, 'Ponto de partida: últimos 12 meses até ' + b.p + ' (volume dos releases; EBITDA Ajustado da nota de segmentos; dívida líquida do balanço). A margem dos segmentos de distribuição exclui o Corporativo, que entra separado. Altere os valores e veja o efeito.'),
          ref.form, ref.res, h('div', { class: 'sec' }, h('h2', null, 'Sensibilidade do EBITDA Ajustado (R$ milhões, 12 meses)')), h('div', { class: 'twrap' }, ref.tb));
      },
      render: function () {
        var campo = function (k, rot, passo, un) {
          var i = h('input', { type: 'number', step: passo, value: est[k], 'aria-label': rot, inputmode: 'decimal' });
          i.addEventListener('input', function () { var v = parseFloat(i.value); if (isFinite(v)) { est[k] = v; desenha(); } });
          return h('label', { class: 'campo' }, h('span', null, rot), i, h('small', null, un));
        };
        ref.form.replaceChildren(campo('vol', 'Volume vendido', 100, 'mil m³ em 12 meses'), campo('m3', 'Margem EBITDA da distribuição', 5, 'R$/m³, sem o Corporativo'), campo('corp', 'Corporativo e reconciliação', 10, 'R$ milhões'),
          campo('ren', 'EBITDA de Renováveis', 10, 'R$ milhões'), campo('dl', 'Dívida líquida', 100, 'R$ milhões'),
          h('button', { class: 'btn', type: 'button', onclick: function () { var b = ref.b; est = { vol: Math.round(b.vol), m3: Math.round(b.m3), ren: Math.round(b.ren), corp: Math.round(b.corp), dl: Math.round(b.dl) }; P.render(); } }, 'Voltar ao último período'));
        desenha();
      },
      manchete: function () { return P.manchete.simulador(); }
    };
    function desenha() {
      var r = calc(est);
      ref.res.replaceChildren(
        h('div', { class: 'card kpi' }, h('div', { class: 'kl' }, 'EBITDA Ajustado simulado (12 meses)'), h('div', { class: 'kv' }, P.fBi(r.eb)), h('div', { class: 'kl' }, 'Realizado: ' + P.fBi(ref.b.aj))),
        h('div', { class: 'card kpi' }, h('div', { class: 'kl' }, 'Alavancagem simulada'), h('div', { class: 'kv' }, ok(r.alav) ? P.f2(r.alav) + 'x' : '—'), h('div', { class: 'kl' }, 'Dívida líquida ÷ EBITDA Ajustado')),
        h('div', { class: 'card kpi' }, h('div', { class: 'kl' }, 'Cada R$ 10/m³ de margem'), h('div', { class: 'kv' }, P.fMi(est.vol * 10 / 1000)), h('div', { class: 'kl' }, 'de EBITDA em 12 meses')));
      var ms = [-40, -20, 0, 20, 40], vs = [-0.05, 0, 0.05];
      P.tabela(ref.tb, 'Margem (R$/m³) \\ Volume', vs.map(function (v) { return (v ? P.fPct(v) : 'Atual') + ' · ' + P.fN(est.vol * (1 + v)); }), ms.map(function (dm) {
        return { conta: (dm ? (dm > 0 ? '+' : '−') + Math.abs(dm) + ' · ' : 'Atual · ') + P.fInt(est.m3 + dm), cel: vs.map(function (v) { return P.fN(calc({ vol: est.vol * (1 + v), m3: est.m3 + dm, corp: est.corp, ren: est.ren, dl: est.dl }).eb); }), cls: dm === 0 ? 'tot' : '' };
      }));
    }
  }

  P.paginasMercado = function () {
    P.registra('mer', 'Mercado', paginaMercado(), 'a');
    P.registra('div', 'Dívida', paginaDivida(), 'a');
    P.registra('sim', 'Simulador', paginaSimulador(), false);
  };
})();
