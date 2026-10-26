/* Vibra em Números — abas de consulta: Visão geral, Demonstrações, Indicadores e Operacional.
   Mostram o período escolhido (A) e o histórico do mesmo tipo de período; as comparações ficam na aba Comparar. */
(function () {
  'use strict';
  var P = window.P, G = window.Graficos, h = P.h, ok = P.ok, S = P.S;
  P.hist = function (n) { var x = P.x(S.a); return x ? P.M.historico(x, n) : []; };
  P.rotP = function (p) { return P.M.rotulo(p, P.x(S.a).base); };
  P.sub = function (pagina, padrao) { return S.sub[pagina] || padrao; };
  var ind = function (id, p) { return P.M.ind(id, p, P.x(S.a).base); };
  var indA = function (id) { var x = P.x(S.a); return P.M.ind(id, x.p, x.base); };
  P.indA = indA;

  // ---------- operacional (releases): soma de trimestres; margem = EBITDA ÷ volume ----------
  P.oper = function (seg, met, p, base) {
    var O = P.D.oper; if (!O) return null;
    var get = function (pp, m) {
      var s = O.series[pp]; if (!s) return null;
      var x = seg === 'CONS' ? ((s.CONS && s.CONS[m]) || (s.DIST && s.DIST[m])) : (s[seg] && s[seg][m]);
      return x && ok(x.v) ? x.v : null;
    };
    base = base || 'T';
    if (!window.Dados.fechaBase(base, p)) return null;
    var k = window.Dados.trimestresBase(base, p), n = window.Dados.ord(p);
    var exercicio = function (m) {   // ano sem os 4 trimestres (2016, antes do IPO): total anual divulgado no release do 4T17
      var e = k === 4 && p[0] === '4' && O.exercicios && O.exercicios[String(2000 + +p.slice(2))], x = e && e[seg] && e[seg][m];
      return x && ok(x.v) ? x.v : null;
    };
    var comparativo = function (pp, m) {
      var q = O.series[pp], x = q && (seg === 'CONS' ? ((q.CONS && q.CONS[m]) || (q.DIST && q.DIST[m])) : (q[seg] && q[seg][m]));
      return !!(x && x.fonte && /comparativo/.test(x.fonte.como || ''));
    };
    var soma = function (m) {
      var s = 0, comp = false;
      for (var i = n - k + 1; i <= n; i++) { var pp = window.Dados.lab(i), v = get(pp, m); if (v === null) return exercicio(m); s += v; comp = comp || comparativo(pp, m); }
      // ano completo: total divulgado no release do 4º trimestre quando algum trimestre vem de comparativo (2017: base
      // diferente entre releases) ou quando a soma só difere dele por arredondamento
      var ex = exercicio(m); return ok(ex) && (comp || Math.abs(s - ex) <= Math.max(3, Math.abs(ex) * 0.0002)) ? ex : s;
    };
    if (met === 'margem_m3') {   // EBITDA Ajustado (nota de segmentos) ÷ volume do release
      var e = seg === 'CONS' ? P.M.aj('CONS', p, base) : P.M.aj(seg, p, base), q = soma('vol');
      if (seg === 'CONS' && ok(e) && P.M.aj('REN', p, base) !== null) e -= P.M.aj('REN', p, base);   // a partir de 2025, margem só da Distribuição
      return ok(e) && q ? e / q * 1000 : null;
    }
    return soma(met);
  };

  // ---------- Visão geral ----------
  var KPIS = [
    { id: 'receita', rot: 'Receita líquida', fmt: 'bi' },
    { id: 'ebitda', rot: 'EBITDA Ajustado', fmt: 'bi' },
    { id: '_m3', rot: 'Margem EBITDA Ajustado', fmt: 'm3', info: 'EBITDA Ajustado ÷ volume vendido (release), em R$ por m³. A partir de 2025, só da Distribuição (sem Renováveis), como a Companhia divulga.' },
    { id: 'lucro', rot: 'Lucro líquido', fmt: 'bi' },
    { id: 'fco', rot: 'Fluxo de caixa operacional', fmt: 'bi' },
    { id: 'dliq', rot: 'Dívida líquida', fmt: 'bi' },
    { id: 'dlebitda', rot: 'Dívida líquida ÷ EBITDA Aj.', fmt: 'x' },
    { id: 'roe', rot: 'ROE (12 meses)', fmt: '%' }
  ];
  function kpiValor(k, p, base) {
    if (k.id === '_m3') return P.oper('CONS', 'margem_m3', p, base);
    return P.M.ind(k.id, p, base);
  }
  function kpiFmt(k, v) { return k.fmt === 'bi' ? P.fBi(v) : k.fmt === 'm3' ? (ok(v) ? 'R$ ' + P.fInt(v) + '/m³' : '—') : k.fmt === 'x' ? P.fUn('x', v) : P.fUn('%', v); }
  function paginaGeral() {
    var ref = {};
    return {
      init: function (el) {
        ref.kpis = h('div', { class: 'grid kpis' }); ref.mkt = h('div', { class: 'grid kpis' }); ref.mktNota = h('p', { class: 'note' }); ref.ipe = h('div', { class: 'card', style: 'margin-bottom:14px' });
        ref.ch = {}; ['eb', 'm3', 'luc', 'cx', 'div', 'alav'].forEach(function (i) { ref.ch[i] = P.chart('g-' + i); });
        el.append(ref.kpis,
          h('div', { class: 'sec' }, h('h2', null, 'Mercado'), ref.mktNota), ref.mkt, ref.ipe,
          h('div', { class: 'grid' },
            P.card('EBITDA Ajustado por segmento', 'R$ milhões. Barras: segmentos; marcador: consolidado (inclui o Corporativo).', ref.ch.eb, false, 'Nota de informações por segmento das ITRs/DFPs; de 4T17 a 4T21, release de resultados (4T16 a 3T17: comparativos dos releases de 2018).'),
            P.card('Margem EBITDA Ajustado', 'R$ por m³ vendido.', ref.ch.m3),
            P.card('Lucro líquido', 'R$ milhões (consolidado, DRE 3.11).', ref.ch.luc),
            P.card('Geração de caixa', 'R$ milhões. Livre = operacional + investimentos em imobilizado e intangível.', ref.ch.cx),
            P.card('Dívida líquida', 'R$ milhões, fim do período, como divulgada pela Companhia no release (dívida bruta + swap − disponibilidades).', ref.ch.div),
            P.card('Alavancagem', 'Dívida líquida ÷ EBITDA Ajustado dos últimos 12 meses.', ref.ch.alav)));
      },
      render: function () {
        var M = P.M, x = P.x(S.a), hs = P.hist(x.base === 'T' ? 8 : 6), rs = hs.map(P.rotP);
        ref.kpis.replaceChildren();
        KPIS.forEach(function (k) {
          var i = M.indicadores.filter(function (z) { return z.id === k.id; })[0], v = kpiValor(k, x.p, x.base);
          var sp = h('div', { class: 'spark' }); G.spark(sp, hs.map(function (p) { return kpiValor(k, p, x.base); }));
          ref.kpis.appendChild(h('div', { class: 'card kpi' }, h('div', { class: 'kl' }, k.rot, P.info(k.info || (i ? i.formula + '. ' + (i.nota || '') : ''))), h('div', { class: 'kv' }, kpiFmt(k, v)), sp));
        });
        // mercado: fim do período escolhido × último pregão
        var mc = P.mercadoComparado(S.a); ref.mkt.replaceChildren();
        ref.mktNota.textContent = (mc.qA ? 'Fim do ' + P.rotuloLongo(S.a) + ': fechamento de ' + P.fData(mc.qA.d) + ' (R$ ' + P.f2(mc.qA.p) + ')' : 'Sem cotação no fim do período') +
          ' × último pregão: ' + P.fData(mc.qU.d) + ' (R$ ' + P.f2(mc.qU.p) + '), com as demonstrações de ' + mc.ult + '.';
        mc.linhas.forEach(function (l) {
          if (!ok(l.a) && !ok(l.u)) return;
          var v = P.varMerc(l.un, l.a, l.u);
          ref.mkt.appendChild(h('div', { class: 'card kpi mini' }, h('div', { class: 'kl' }, l.rot, P.info(l.info)), h('div', { class: 'kv' }, P.fmtMerc(l.un, l.a)),
            h('div', { class: 'kl hoje' }, 'Último pregão: ', h('b', null, P.fmtMerc(l.un, l.u)), v !== '—' ? h('span', { class: /^−/.test(v) ? 'neg' : 'pos' }, ' (' + v + ')') : null)));
        });
        // comunicados
        var docs = P.D.ipe && P.ipeGrupo ? P.D.ipe.documentos.filter(P.ipeGrupo('chave')[2]).slice(0, 4) : [];
        ref.ipe.hidden = !docs.length; ref.ipe.replaceChildren();
        if (docs.length) ref.ipe.append(h('div', { class: 'sec', style: 'margin:0 0 8px' }, h('h2', null, 'Últimos fatos relevantes, comunicados e avisos'), h('a', { href: '#ipe' }, 'Ver todos')),
          h('ul', { class: 'lista-ipe' }, docs.map(function (d) { return h('li', null, h('span', { class: 'kl' }, P.fData(d.data_entrega) + ' · ' + d.categoria), h('br'), d.link ? h('a', { href: d.link, target: '_blank', rel: 'noopener noreferrer' }, d.assunto || d.tipo) : d.assunto); })));
        // gráficos (histórico do mesmo tipo de período, com A em destaque)
        var dest = { destaque: P.rotulo(S.a) }, segs = ['REDE', 'B2B', 'REN', 'GC', 'AVI', 'OUT'].filter(function (s) { return hs.some(function (p) { return M.aj(s, p, x.base) !== null; }); });
        var nomes = (P.D.aj && P.D.aj.segmentos) || {};
        G.empilhado(ref.ch.eb, rs, segs.map(function (s) { return { nome: nomes[s] || s, vals: hs.map(function (p) { return M.aj(s, p, x.base); }) }; }), { nome: 'Consolidado', vals: hs.map(function (p) { return M.aj('CONS', p, x.base); }) }, P.fN);
        G.linhas(ref.ch.m3, rs, [{ nome: 'Consolidado', vals: hs.map(function (p) { return P.oper('CONS', 'margem_m3', p, x.base); }) }, { nome: 'Rede de Postos', vals: hs.map(function (p) { return P.oper('REDE', 'margem_m3', p, x.base); }) }, { nome: 'B2B', vals: hs.map(function (p) { return P.oper('B2B', 'margem_m3', p, x.base); }) }], P.fInt, dest);
        G.barras(ref.ch.luc, rs, hs.map(function (p) { return ind('lucro', p); }), 'Lucro líquido', P.fN, dest);
        G.linhas(ref.ch.cx, rs, [{ nome: 'Operacional', vals: hs.map(function (p) { return ind('fco', p); }) }, { nome: 'Livre', vals: hs.map(function (p) { return ind('fcl', p); }) }], P.fN, dest);
        G.barras(ref.ch.div, rs, hs.map(function (p) { return ind('dliq', p); }), 'Dívida líquida', P.fN, dest);
        G.linhas(ref.ch.alav, rs, [{ nome: 'Dívida líquida ÷ EBITDA Aj.', vals: hs.map(function (p) { return ind('dlebitda', p); }) }], function (v) { return P.f2(v) + 'x'; }, dest);
      },
      manchete: function () { return P.manchete.geral(); }
    };
  }

  // ---------- Demonstrações (Resultado, Balanço, Fluxo de caixa, DVA, DRA, DMPL) ----------
  var RESUMO = {
    dre: function (l) { return l.nivel === 2 && l.cd_conta.indexOf('3.99') !== 0; },
    bp: function (l) { return l.nivel <= 3; },
    dfc: function (l) { return ['6.01', '6.02', '6.03', '6.04', '6.05', '6.05.01', '6.05.02'].indexOf(l.cd_conta) >= 0; },
    dva: function (l) { return l.nivel <= 2; },
    dra: function (l) { return l.nivel <= 2; }
  };
  var TOT = { dre: ['3.03', '3.05', '3.07', '3.09', '3.11'], bp: ['1', '2'], dfc: ['6.05'], dva: ['7.03', '7.05', '7.07'], dra: ['4.03'] };
  var PADRAO = { dre: '3.11', bp: '1', dfc: '6.01', dva: '7.03', dra: '4.03' };
  P.NOME_DS = { dre: 'Demonstração do resultado', bp: 'Balanço patrimonial', dfc: 'Fluxo de caixa', dva: 'Valor adicionado (DVA)', dra: 'Resultado abrangente (DRA)', dmpl: 'Mutações do patrimônio (DMPL)' };
  var NOTA_DS = {
    dre: 'R$ milhões, consolidado. O 4º trimestre é a diferença entre o ano e o acumulado de nove meses. A receita (3.01) inclui a marcação a mercado do trading de energia.',
    bp: 'R$ milhões, saldos no fim de cada período. Empréstimos e financiamentos incluem arrendamentos.',
    dfc: 'R$ milhões, método indireto. Trimestres obtidos pela diferença dos acumulados do ano.',
    dva: 'R$ milhões. Trimestres obtidos pela diferença dos acumulados do ano.',
    dra: 'R$ milhões. O 4º trimestre é a diferença entre o ano e o acumulado de nove meses.'
  };
  var DEN = { dre: '3.01', bp: '1', dva: '7.01' };
  P.RESUMO = RESUMO; P.TOT = TOT; P.DEN = DEN;
  function paginaDemonstracoes() {
    var ref = {}, SUBS = [['dre', 'Resultado'], ['bp', 'Balanço'], ['dfc', 'Fluxo de caixa'], ['dva', 'DVA'], ['dra', 'DRA'], ['dmpl', 'DMPL']];
    var est = { niv: 'r', av: false, conta: {} };
    function sub() { return P.sub('dem', 'dre'); }
    function linhas(ds, cols, tend) {   // tend: períodos do minigráfico de tendência de cada linha (opcional)
      var M = P.M, x = P.x(S.a), out = [];
      M.linhas(ds).forEach(function (l) {
        if (ds === 'dre' && l.cd_conta.indexOf('3.99') === 0) return;
        if (est.niv === 'r' && !RESUMO[ds](l)) return;
        var vals = cols.map(function (p) { return M.agg(ds, l.cd_conta, p, x.base); });
        if (!vals.some(ok)) return;
        var cel = vals.map(P.fN), cls = [];
        if (est.av && DEN[ds]) {
          var av = cols.map(function (p, i) { var d = M.agg(ds, DEN[ds], p, x.base); return ok(vals[i]) && ok(d) && d ? vals[i] / d : null; });
          cel = []; vals.forEach(function (v, i) { cel.push(P.fN(v)); cel.push(ok(av[i]) ? P.f1(av[i] * 100) + '%' : '—'); cls.push('', 'av'); });
        }
        if (tend) { var sp = h('div', { class: 'spk', 'aria-hidden': 'true' }); G.spark(sp, tend.map(function (p) { return M.agg(ds, l.cd_conta, p, x.base); })); cel = cel.concat([sp]); }
        out.push({ id: l.cd_conta, cd: l.cd_conta, conta: l.cd_conta + '  ' + l.conta, nivel: l.nivel, vals: vals, cel: cel, cclass: cls, cls: TOT[ds].indexOf(l.cd_conta) >= 0 ? 'tot' : (l.nivel <= 2 ? 'l1' : '') });
      });
      return out;
    }
    return {
      init: function (el) {
        ref.nav = h('div', { class: 'subnav' }); ref.ctl = h('div', { class: 'controls' });
        ref.sTit = h('h2'); ref.sNota = h('p', { class: 'note' }); ref.sin = P.chart('d-sintese'); ref.sAviso = h('p', { class: 'note' });
        ref.titulo = h('h2'); ref.chart = P.chart('d-chart'); ref.nota = h('p', { class: 'note' }); ref.tb = h('table');
        ref.hist = h('div', { class: 'card wide', style: 'margin-top:14px' }, ref.titulo, h('p', { class: 'note' }, 'Histórico da linha escolhida na tabela (toque em outra linha para trocar).'), ref.chart);
        ref.tTit = h('h2', { style: 'margin:18px 0 4px' });
        ref.box = h('div', null, ref.tTit, ref.nota, h('div', { class: 'twrap' }, ref.tb), ref.hist);
        ref.dmpl = h('div'); ref.dmplTb = h('table');
        el.append(ref.nav, ref.ctl, h('div', { class: 'card wide', style: 'margin-bottom:14px' }, ref.sTit, ref.sNota, ref.sin, ref.sAviso), ref.box, ref.dmpl);
      },
      render: function () {
        var ds = sub(), x = P.x(S.a);
        ref.nav.replaceChildren(P.segmentado(SUBS.map(function (s) { return [s[0], s[1]]; }), ds, function (v) { S.sub.dem = v; P.render(); }, 'Demonstração'));
        ref.box.hidden = ds === 'dmpl'; ref.dmpl.hidden = ds !== 'dmpl';
        sintese(ds, x);
        if (ds === 'dmpl') return renderDmpl();
        var cols = P.hist(5), tend = P.hist(8);
        ref.ctl.replaceChildren(
          P.segmentado([['r', 'Resumo'], ['d', 'Detalhado']], est.niv, function (v) { est.niv = v; P.render(); }, 'Nível'),
          DEN[ds] ? P.segmentado([['n', 'Valores'], ['s', 'Com análise vertical']], est.av ? 's' : 'n', function (v) { est.av = v === 's'; P.render(); }, 'Análise vertical') : null,
          h('button', { class: 'btn', type: 'button', onclick: function () { exporta(ds, cols); } }, 'Baixar para Excel'));
        var cd = est.conta[ds] || PADRAO[ds], l = P.M.linha(ds, cd) || P.M.linhas(ds)[0], lh = P.hist(x.base === 'T' ? 12 : 8);
        ref.titulo.textContent = l.cd_conta + '  ' + l.conta;
        G.barras(ref.chart, lh.map(P.rotP), lh.map(function (p) { return P.M.agg(ds, l.cd_conta, p, x.base); }), l.conta, P.fN, { destaque: P.rotulo(S.a) });
        ref.tTit.textContent = P.NOME_DS[ds] + ' — ' + P.rotulo(S.a) + ' e períodos anteriores';
        ref.nota.textContent = NOTA_DS[ds];
        var heads = []; cols.forEach(function (p) { heads.push(P.rotP(p)); if (est.av && DEN[ds]) heads.push('AV'); });
        heads.push('Tendência (' + tend.length + ' períodos)');
        P.tabela(ref.tb, 'R$ milhões', heads, linhas(ds, cols, tend), function (r) {
          est.conta[ds] = r.cd; P.render();
          if (ref.hist.scrollIntoView) ref.hist.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      },
            manchete: function () { return P.manchete.demonstracoes(sub()); }
    };
    // gráfico-síntese de cada demonstração no período A (estruturas de Dados: fecham com os totais da CVM)
    function sintese(ds, x) {
      var E = P.M.estrutura, rot = P.rotulo(S.a), fim = P.M.fimPeriodo(x.p).split('-').reverse().join('/'), r = null, aviso = '';
      ref.sAviso.textContent = '';
      if (ds === 'dre') {
        r = E.resultado(x.p, x.base);
        ref.sTit.textContent = 'Do lucro bruto ao lucro líquido — ' + rot;
        ref.sNota.textContent = r ? 'R$ milhões. Receita líquida de ' + P.fN(r.receita) + ' e custo de ' + P.fN(r.custo) + ' resultam no lucro bruto de ' + P.fN(r.inicio.v) + ' (margem bruta de ' + P.f1(r.inicio.v / r.receita * 100) + '%). Verde: aumenta o lucro; amarelo: reduz.' : '';
        if (r) G.ponte(ref.sin, r.inicio, r.passos, r.fim, P.fN); else G.falha(ref.sin);
      } else if (ds === 'bp') {
        r = E.balanco(x.p);
        ref.sTit.textContent = 'Composição do balanço em ' + fim;
        ref.sNota.textContent = 'R$ milhões e % do total. Dívida: empréstimos, financiamentos e arrendamentos. "Outros" e "Realizável a longo prazo e investimentos" são calculados por diferença para fechar com os totais.';
        // cores: ativo em verdes (do mais líquido ao menos líquido); no passivo, dívida em amarelo e PL em verde-escuro
        var CA = [['--c4', 1], ['--c1', 1], ['--c1', 0.7], ['--c1', 0.45], ['--c3', 0.8], ['--c2', 0.8], ['--c2', 0.5]], CP = [['--c3', 1], ['--c5', 1], ['--c3', 0.6], ['--c5', 0.65], ['--c3', 0.35], ['--c4', 1]];
        if (r) G.blocos(ref.sin, [{ nome: 'Ativo', total: r.totAtivo, partes: r.ativo.map(function (x, i) { return { rot: x.rot, v: x.v, cor: CA[i] }; }) },
          { nome: 'Passivo e PL', total: r.totPassivo, partes: r.passivo.map(function (x, i) { return { rot: x.rot, v: x.v, cor: CP[i] }; }) }], P.fN); else G.falha(ref.sin);
      } else if (ds === 'dfc') {
        r = E.caixa(x.p, x.base);
        ref.sTit.textContent = 'Do caixa inicial ao final — ' + rot;
        ref.sNota.textContent = 'R$ milhões, caixa e equivalentes de caixa. Verde: entrada; amarelo: saída.';
        if (r) G.ponte(ref.sin, r.inicio, r.passos, r.fim, P.fN); else G.falha(ref.sin);
      } else if (ds === 'dva') {
        r = E.dva(x.p, x.base);
        ref.sTit.textContent = 'Para onde foi o valor adicionado — ' + rot;
        ref.sNota.textContent = r ? 'R$ milhões. Valor adicionado total a distribuir: ' + P.fN(r.total) + '. ' + r.itens.map(function (i) { return i.rot + ': ' + P.f1(i.v / r.total * 100) + '%'; }).join('; ') + '. Lucros retidos incluem a parcela dos não controladores. Valores negativos indicam créditos (ex.: impostos recuperados) maiores que os encargos.' : '';
        if (r) G.variacoes(ref.sin, r.itens, P.fN, 'Valor'); else G.falha(ref.sin);
      } else if (ds === 'dra') {
        r = E.dra(x.p, x.base);
        ref.sTit.textContent = 'Do lucro ao resultado abrangente — ' + rot;
        ref.sNota.textContent = 'R$ milhões. Outros resultados abrangentes: ajustes que vão direto ao patrimônio (conversão, hedge, benefícios a empregados).';
        if (r) G.ponte(ref.sin, r.inicio, r.passos, r.fim, P.fN); else G.falha(ref.sin);
      } else if (ds === 'dmpl') {
        var d = P.D.dmpl, p = d && d.periodos.indexOf(x.p) >= 0 ? x.p : (d ? d.periodos[d.periodos.length - 1] : null);
        r = p ? E.pl(p) : null;
        ref.sTit.textContent = 'Do patrimônio inicial ao final — acumulado do ano até ' + (p || rot);
        ref.sNota.textContent = 'R$ milhões, patrimônio líquido consolidado (inclui não controladores). Verde: aumenta o PL; amarelo: reduz.';
        if (r) G.ponte(ref.sin, r.inicio, r.passos, r.fim, P.fN); else G.falha(ref.sin);
      }
      if (r && r.fecha === false) aviso = 'Atenção: este gráfico não fechou com os totais da demonstração neste período.';
      ref.sAviso.textContent = aviso;
    }
    function exporta(ds, cols) {
      var ls = linhas(ds, cols);
      P.csv('vibra_' + ds + '_' + P.rotulo(S.a) + '.csv', ['cd_conta', 'conta'].concat(cols.map(P.rotP)), ls.map(function (l) { return [l.cd, l.conta.slice(l.cd.length + 2)].concat(l.vals.map(P.numCsv)); }));
    }
    function renderDmpl() {
      var d = P.D.dmpl; if (!d) return;
      var x = P.x(S.a), p = d.periodos.indexOf(x.p) >= 0 ? x.p : d.periodos[d.periodos.length - 1], map = {};
      d.valores.forEach(function (v) { if (v[0] === p) map[v[1] + '|' + v[2]] = v[3]; });
      var cols = d.colunas.filter(function (c) { return d.valores.some(function (v) { return v[0] === p && v[2] === c; }); });
      var ls = d.contas.filter(function (c) { return cols.some(function (k) { return map[c.cd_conta + '|' + k] != null; }); });
      ref.ctl.replaceChildren(h('span', { class: 'note' }, 'Acumulado do ano até ' + p + ' (DMPL consolidada da ITR/DFP).'));
      ref.dmpl.replaceChildren(h('div', { class: 'twrap' }, ref.dmplTb));
      P.tabela(ref.dmplTb, 'R$ milhões', cols, ls.map(function (c) {
        return { conta: c.cd_conta + '  ' + c.conta, nivel: c.cd_conta.split('.').length, cel: cols.map(function (k) { return P.fN(map[c.cd_conta + '|' + k]); }), cls: ['5.01', '5.03', '5.07'].indexOf(c.cd_conta) >= 0 ? 'tot' : '' };
      }));
    }
  }

  // ---------- Indicadores ----------
  function paginaIndicadores() {
    var ref = {}, est = { id: 'mebitda', grupo: '' };
    function linhas(cols) {
      var out = [], g = null, x = P.x(S.a);
      P.M.indicadores.forEach(function (i) {
        if (est.grupo && i.grupo !== est.grupo) return;
        var vals = cols.map(function (p) { return P.M.ind(i.id, p, x.base); });
        if (!vals.some(ok)) return;
        if (i.grupo !== g) { g = i.grupo; out.push({ grupo: g }); }
        out.push({ id: i.id, conta: i.nome + (i.un === 'R$ mi' ? '' : '  (' + i.un + ')'), nivel: 2, vals: vals, cel: vals.map(function (v) { return P.fUn(i.un, v); }), cls: est.id === i.id ? 'act' : '', info: i.formula + '. ' + (i.nota || ''), i: i });
      });
      return out;
    }
    return {
      init: function (el) {
        ref.ctl = h('div', { class: 'controls' }); ref.titulo = h('h2'); ref.formula = h('p', { class: 'note' }); ref.chart = P.chart('i-chart'); ref.tb = h('table'); ref.dup = h('table');
        el.append(ref.ctl, h('div', { class: 'card wide', style: 'margin-bottom:14px' }, ref.titulo, ref.formula, ref.chart),
          h('div', { class: 'sec' }, h('h2', null, 'Decomposição do ROE (DuPont)')), h('p', { class: 'note' }, 'ROE consolidado = margem líquida × giro do ativo × alavancagem financeira, nos últimos 12 meses.'),
          h('div', { class: 'twrap', style: 'margin-bottom:14px' }, ref.dup),
          h('div', { class: 'sec' }, h('h2', null, 'Todos os indicadores')), h('div', { class: 'twrap' }, ref.tb));
      },
      render: function () {
        var x = P.x(S.a), cols = P.hist(5), grupos = [['', 'Todos']].concat(Object.keys(P.M.grupos).map(function (k) { return [P.M.grupos[k], P.M.grupos[k]]; }));
        ref.ctl.replaceChildren(P.label('Grupo', P.select('i-grupo', grupos, est.grupo, function (v) { est.grupo = v; P.render(); }, 'Grupo')),
          h('button', { class: 'btn', type: 'button', onclick: function () { var ls = linhas(cols).filter(function (l) { return !l.grupo; }); P.csv('vibra_indicadores_' + P.rotulo(S.a) + '.csv', ['grupo', 'indicador', 'unidade', 'formula'].concat(cols.map(P.rotP)), ls.map(function (l) { return [l.i.grupo, l.i.nome, l.i.un, l.i.formula].concat(l.vals.map(P.numCsv)); })); } }, 'Baixar para Excel'));
        var i = P.M.indicadores.filter(function (z) { return z.id === est.id; })[0] || P.M.indicadores[0], lh = P.hist(x.base === 'T' ? 12 : 8);
        ref.titulo.textContent = i.nome + (i.un ? ' (' + i.un + ')' : ''); ref.formula.textContent = i.formula + '. ' + (i.nota || '');
        var vals = lh.map(function (p) { return P.M.ind(i.id, p, x.base); }), f = function (v) { return P.fUn(i.un, v); };
        if (i.un === 'R$ mi') G.barras(ref.chart, lh.map(P.rotP), vals, i.nome, f, { destaque: P.rotulo(S.a) }); else G.linhas(ref.chart, lh.map(P.rotP), [{ nome: i.nome, vals: vals }], f, { destaque: P.rotulo(S.a) });
        P.tabela(ref.tb, 'Indicador', cols.map(P.rotP), linhas(cols), function (l) { est.id = l.id; P.render(); });
        var dp = [['mliqudm', 'Margem líquida'], ['giro', '× Giro do ativo'], ['alav', '× Alavancagem (ativo ÷ PL)'], ['roecons', '= ROE consolidado']];
        P.tabela(ref.dup, 'Fator', cols.map(P.rotP), dp.map(function (d, k) { var ii = P.M.indicadores.filter(function (z) { return z.id === d[0]; })[0]; return { conta: d[1], cel: cols.map(function (p) { return P.fUn(ii.un, P.M.ind(d[0], p, x.base)); }), cls: k === 3 ? 'tot' : '' }; }));
      },
      manchete: function () { return P.manchete.indicadores(); }
    };
  }

  // ---------- Operacional ----------
  function paginaOperacional() {
    var ref = {};
    var SEGS = ['REDE', 'B2B', 'REN', 'GC', 'AVI', 'OUT'];
    function linhas(cols, x) {
      var out = [], O = P.D.oper, nomes = (P.D.aj && P.D.aj.segmentos) || {};
      var L = function (rot, f, fmt, cls) { var v = cols.map(f); if (v.some(ok)) out.push({ conta: rot, vals: v, cel: v.map(fmt || P.fN), cls: cls || '' }); };
      out.push({ grupo: 'Volume de vendas (mil m³) — releases' });
      L('Total', function (p) { return P.oper('CONS', 'vol', p, x.base); }, null, 'tot');
      SEGS.forEach(function (s) { L(O.segmentos[s] || s, function (p) { return P.oper(s, 'vol', p, x.base); }); });
      out.push({ grupo: 'EBITDA Ajustado (R$ milhões) — nota de segmentos das ITRs/DFPs' });
      L('Consolidado', function (p) { return P.M.aj('CONS', p, x.base); }, null, 'tot');
      SEGS.forEach(function (s) { L(nomes[s] || s, function (p) { return P.M.aj(s, p, x.base); }); });
      L('Corporativo', function (p) { return P.M.aj('CORP', p, x.base); });
      out.push({ grupo: 'Margem EBITDA Ajustado (R$/m³)' });
      L('Consolidado (Distribuição a partir de 2025)', function (p) { return P.oper('CONS', 'margem_m3', p, x.base); }, P.fInt, 'tot');
      ['REDE', 'B2B', 'GC', 'AVI', 'OUT'].forEach(function (s) { L(nomes[s] || s, function (p) { return P.oper(s, 'margem_m3', p, x.base); }, P.fInt); });
      return out;
    }
    return {
      init: function (el) {
        ref.vol = P.chart('o-vol'); ref.eb = P.chart('o-eb'); ref.m3 = P.chart('o-m3'); ref.tb = h('table'); ref.fontes = h('div');
        el.append(h('div', { class: 'grid' },
          P.card('Volume de vendas por segmento', 'Mil m³ (releases). Marcador: volume total.', ref.vol),
          P.card('EBITDA Ajustado × contábil', 'R$ milhões. Ajustado: nota de segmentos das ITRs/DFPs (release até 2021). Contábil: calculado das demonstrações, para referência.', ref.eb),
          P.card('Margem EBITDA Ajustado por segmento', 'R$ por m³ vendido.', ref.m3)),
          h('div', { class: 'sec' }, h('h2', null, 'Indicadores operacionais'), h('button', { class: 'btn', type: 'button', onclick: function () { var x = P.x(S.a), cols = P.hist(5), ls = linhas(cols, x).filter(function (l) { return !l.grupo; }); P.csv('vibra_operacional_' + P.rotulo(S.a) + '.csv', ['indicador'].concat(cols.map(P.rotP)), ls.map(function (l) { return [l.conta].concat(l.vals.map(P.numCsv)); })); } }, 'Baixar para Excel')),
          h('div', { class: 'twrap' }, ref.tb), ref.fontes,
          h('p', { class: 'note', style: 'margin-top:10px' }, 'Segmentos conforme a divulgação de cada época: Grandes Consumidores e Aviação até 2019; B2B a partir de 2020, com Aviação incorporada a partir de 2023; Renováveis (Comerc) a partir de 2025. O EBITDA Ajustado da nota das demonstrações financeiras inclui efeitos extraordinários que o release às vezes exclui da manchete (por exemplo, a recuperação tributária do 3T24 no Corporativo).'));
      },
      render: function () {
        var x = P.x(S.a), lh = P.hist(x.base === 'T' ? 12 : 8), rs = lh.map(P.rotP), O = P.D.oper, nomes = (P.D.aj && P.D.aj.segmentos) || {}, dest = { destaque: P.rotulo(S.a) };
        var sv = SEGS.filter(function (s) { return lh.some(function (p) { return ok(P.oper(s, 'vol', p, x.base)); }); });
        G.empilhado(ref.vol, rs, sv.map(function (s) { return { nome: O.segmentos[s] || s, vals: lh.map(function (p) { return P.oper(s, 'vol', p, x.base); }) }; }), { nome: 'Volume total', vals: lh.map(function (p) { return P.oper('CONS', 'vol', p, x.base); }) }, P.fN);
        G.linhas(ref.eb, rs, [{ nome: 'EBITDA Ajustado', vals: lh.map(function (p) { return P.M.aj('CONS', p, x.base); }) }, { nome: 'EBITDA contábil', vals: lh.map(function (p) { return P.M.ind('ebitdac', p, x.base); }) }], P.fN, dest);
        G.linhas(ref.m3, rs, ['REDE', 'B2B'].map(function (s) { return { nome: nomes[s], vals: lh.map(function (p) { return P.oper(s, 'margem_m3', p, x.base); }) }; }).concat([{ nome: 'Consolidado', vals: lh.map(function (p) { return P.oper('CONS', 'margem_m3', p, x.base); }) }]), P.fInt, dest);
        var cols = P.hist(5);
        P.tabela(ref.tb, '', cols.map(P.rotP), linhas(cols, x));
        // documentos de origem do período A
        ref.fontes.replaceChildren();
        var f = [];
        var fa = x.base === 'AN' && !P.M.ajFonte('CONS', P.M.desloca(x.p, 3)) && P.M.ajExercicio('CONS', 2000 + +x.p.slice(2)) ? P.M.ajExercicio('CONS', 2000 + +x.p.slice(2)) : P.M.ajFonte('CONS', x.p); if (fa && fa.fonte) f.push(h('a', { href: fa.fonte.link, target: '_blank', rel: 'noopener noreferrer' }, 'EBITDA Ajustado de ' + x.p + ': ' + (fa.fonte.tipo === 'release' ? 'release' : fa.fonte.tipo + ' (nota de segmentos)')));
        var so = O.series[x.p], c = so && (so.CONS || so.DIST), fv = c && c.vol && c.vol.fonte; if (fv) f.push(h('a', { href: fv.link, target: '_blank', rel: 'noopener noreferrer' }, 'Volumes de ' + x.p + ': release'));
        if (f.length) ref.fontes.append(h('p', { class: 'note', style: 'margin-top:10px' }, 'Documentos de origem (abrem na CVM): ', f.reduce(function (a, e, i) { if (i) a.push(' · '); a.push(e); return a; }, [])));
      },
      manchete: function () { return P.manchete.operacional(); }
    };
  }

  P.paginasConsulta = function () {
    P.registra('geral', 'Visão geral', paginaGeral(), 'a');
    P.registra('dem', 'Demonstrações', paginaDemonstracoes(), 'a');
    P.registra('ind', 'Indicadores', paginaIndicadores(), 'a');
    P.registra('oper', 'Operacional', paginaOperacional(), 'a');
  };
})();
