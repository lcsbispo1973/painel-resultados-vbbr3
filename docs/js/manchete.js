/* Vibra em Números — manchetes da faixa verde: uma por aba, escritas a partir dos números do período escolhido.
   Regra: só afirma o que é calculado; cada oração só entra se o número existir. */
(function () {
  'use strict';
  var P = window.P, ok = P.ok, S = P.S;
  var M = function () { return P.M; };
  var b = function (t) { var e = document.createElement('b'); e.textContent = t; return e; };
  var pct = function (a, c) { return ok(a) && ok(c) && c !== 0 && (a < 0) === (c < 0) ? a / c - 1 : null; };
  function frase(partes) { return partes.filter(Boolean); }
  function recorde(valores, v) {   // maior/menor do histórico (mesmo tipo de período)
    var vs = valores.filter(ok); if (vs.length < 4 || !ok(v)) return null;
    if (v >= Math.max.apply(null, vs)) return 'o maior da série';
    if (v <= Math.min.apply(null, vs)) return 'o menor da série';
    return null;
  }
  var H = P.manchete = {};
  // último exercício encerrado com DFP publicada (o FRE traz também a previsão do exercício corrente)
  P.anoFechado = function () { var l = (P.M.periodos('dre', 'T') || []).filter(function (p) { return p[0] === '4'; }); return l.length ? 2000 + +l[l.length - 1].slice(2) : null; };
  P.exRemuneracao = function () { var s = P.D.freSeries, af = P.anoFechado(); return Array.from(new Set(s.remuneracao.map(function (r) { return r.exercicio; }))).filter(function (e) { return !af || +e <= af; }).sort(); };
  var per = function () { return P.rotuloLongo(S.a); };
  var x = function () { return P.x(S.a); };

  H.geral = function () {
    var X = x(), aj = M().aj('CONS', X.p, X.base), lucro = P.indA('lucro'), m3 = P.oper('CONS', 'margem_m3', X.p, X.base), alav = P.indA('dlebitda');
    var hs = M().historico(X, 12), rec = recorde(hs.map(function (p) { return M().aj('CONS', p, X.base); }), aj);
    var t = ['No ' + per() + ', '];
    if (ok(aj)) t.push('EBITDA Ajustado de ', b(P.fBi(aj)), rec ? ' (' + rec + ')' : '');
    if (ok(lucro)) t.push(ok(aj) ? ' e lucro líquido de ' : 'lucro líquido de ', b(P.fBi(lucro)));
    t.push('.');
    if (ok(m3)) t.push(' Margem de ', b('R$ ' + P.fInt(m3) + '/m³'));
    if (ok(alav)) t.push(ok(m3) ? ' e alavancagem de ' : ' Alavancagem de ', b(P.f2(alav) + 'x'), ' o EBITDA Ajustado de 12 meses');
    if (ok(m3) || ok(alav)) t.push('.');
    return t;
  };
  H.demonstracoes = function (ds) {
    var X = x(), g = function (d, cd) { return M().agg(d, cd, X.p, X.base); };
    if (ds === 'dre') {
      var r = g('dre', '3.01'), l = g('dre', '3.11'), lb = g('dre', '3.03');
      return frase(['No ' + per() + ', receita de ', b(P.fBi(r)), ', lucro bruto de ', b(P.fBi(lb)), ok(r) && ok(lb) ? ' (margem bruta de ' + P.f1(lb / r * 100) + '%)' : '', ' e lucro líquido de ', b(P.fBi(l)), ok(r) && ok(l) ? ' (margem líquida de ' + P.f1(l / r * 100) + '%).' : '.']);
    }
    if (ds === 'bp') {
      var at = g('bp', '1'), pl = g('bp', '2.03'), dl = P.indA('dliq'), al = P.indA('dlebitda');
      return frase(['Ao fim do ' + per() + ': ativo total de ', b(P.fBi(at)), ', patrimônio líquido de ', b(P.fBi(pl)), ' e dívida líquida de ', b(P.fBi(dl)), ok(al) ? ' (' + P.f2(al) + 'x o EBITDA Ajustado de 12 meses).' : '.']);
    }
    if (ds === 'dfc') {
      var fco = g('dfc', '6.01'), inv = g('dfc', '6.02'), fcl = P.indA('fcl'), dv = g('dfc', '6.03.05');
      return frase(['No ' + per() + ', caixa operacional de ', b(P.fBi(fco)), ', investimentos de ', b(P.fBi(ok(inv) ? -inv : null)), ' e fluxo de caixa livre de ', b(P.fBi(fcl)), ok(dv) && dv < 0 ? '; ' + P.fBi(-dv) + ' pagos em dividendos e JCP.' : '.']);
    }
    if (ds === 'dva') {
      var va = g('dva', '7.07'), trib = g('dva', '7.08.02');
      return frase(['No ' + per() + ', valor adicionado a distribuir de ', b(P.fBi(va)), ok(va) && ok(trib) && va ? ', dos quais ' + P.f1(trib / va * 100) + '% em impostos, taxas e contribuições.' : '.']);
    }
    if (ds === 'dra') { var ra = g('dra', '4.03'); return frase(['Resultado abrangente de ', b(P.fBi(ra)), ' no ' + per() + '.']); }
    return ['Mutações do patrimônio líquido acumuladas no ano até ' + X.p + '.'];
  };
  H.indicadores = function () {
    var roe = P.indA('roe'), roic = P.indA('roic'), al = P.indA('dlebitda'), lc = P.indA('lcor');
    return frase(['No ' + per() + ': ROE de ', b(P.fUn('%', roe)), ', ROIC aproximado de ', b(P.fUn('%', roic)), ', alavancagem de ', b(P.fUn('x', al)), ' e liquidez corrente de ', b(P.f2(lc)), ' (12 meses até o fim do período).']);
  };
  H.operacional = function () {
    var X = x(), vol = P.oper('CONS', 'vol', X.p, X.base), m3 = P.oper('CONS', 'margem_m3', X.p, X.base), rede = M().aj('REDE', X.p, X.base), b2b = M().aj('B2B', X.p, X.base), ren = M().aj('REN', X.p, X.base);
    var seg = [rede, b2b, ren].filter(ok).reduce(function (a, v) { return a + v; }, 0);
    return frase(['No ' + per() + ', volume de ', b(P.fN(vol) + ' mil m³'), ' e margem EBITDA de ', b('R$ ' + P.fInt(m3) + '/m³'), ok(rede) && seg > 0 ? '; a Rede de Postos respondeu por ' + P.f1(rede / seg * 100) + '% do EBITDA dos segmentos.' : '.']);
  };
  H.comparar = function () {
    var A = P.ladoA(), B = P.ladoB(), rA = P.rotLado(A), rB = P.rotLado(B);
    var v = function (f) { return [f(A), f(B)]; };
    var aj = v(function (l) { return M().aj('CONS', l.p, l.base); }), lu = v(function (l) { return M().agg('dre', '3.11', l.p, l.base); }), re = v(function (l) { return M().agg('dre', '3.01', l.p, l.base); });
    var t = [b(rA + ' × ' + rB) , ': '];
    var item = function (nome, par, ultimo) { var d = pct(par[0], par[1]); if (!ok(par[0])) return; t.push(nome + ' ', b(ok(d) ? P.fPct(d) : P.fBi(par[0])), ok(d) ? ' (' + P.fBi(par[0]) + ' contra ' + P.fBi(par[1]) + ')' : '', ultimo ? '.' : '; '); };
    item('EBITDA Ajustado', aj); item('lucro líquido', lu); item('receita', re, true);
    return t;
  };
  H.mercado = function () {
    var c = M().ultimaCotacao(); if (!c) return null;
    return frase(['VBBR3 a ', b('R$ ' + P.f2(c.p)), ' em ' + P.fData(c.d) + ': valor de mercado de ', b(P.fBi(M().indAtual('mcap'))), ', P/L de ', b(P.fUn('x', M().indAtual('pl'))), ' e EV/EBITDA Ajustado de ', b(P.fUn('x', M().indAtual('evebitda'))), '.']);
  };
  H.divida = function () {
    var d = P.D.divida; if (!d || !d.periodos.length) return null;
    var X = x(), p = d.periodos.filter(function (q) { return window.Dados.ord(q) <= window.Dados.ord(X.p); }).pop() || d.periodos[d.periodos.length - 1], c = d.cronograma[p];
    var curto = c.total[0] + (c.total[1] || 0), ext = ok(c.exterior) ? c.exterior / c.total_consolidado : null;
    return frase(['Financiamentos de ', b(P.fBi(c.total_consolidado)), ' em ' + P.fData(c.data_base) + '; ', b(P.f1(curto / c.total_consolidado * 100) + '%'), ' vencem até o fim de ' + c.colunas[1], ok(ext) ? '; ' + P.f1(ext * 100) + '% no exterior.' : '.']);
  };
  H.ipiranga = function () {
    var X = x(), I = P.D.ipiranga; if (!I) return null;
    var vm = P.oper('CONS', 'margem_m3', X.p, X.base), im = P.ipi('margem_m3', X.p, X.base), vv = P.oper('CONS', 'vol', X.p, X.base), iv = P.ipi('vol', X.p, X.base);
    var ec = M().aj('CONS', X.p, X.base), mc = ok(ec) && vv ? ec / vv * 1000 : null;
    return frase(['No ' + per() + ', margem EBITDA Ajustado de ', b('R$ ' + P.fInt(mc) + '/m³'), ' na Vibra Consolidada (R$ ' + P.fInt(vm) + '/m³ na Distribuição) contra ', b('R$ ' + P.fInt(im) + '/m³'), ' na Ipiranga; volume de ', b(P.fN(vv) + ' mil m³'), ' contra ', b(P.fN(iv) + ' mil m³'), '.']);
  };
  H.dividendos = function () {
    var r = P.proventosAno ? P.proventosAno(S.a.ano) : null;
    if (!r || !ok(r.total)) return null;
    var parcial = r.ate[0] !== '4';
    return frase([parcial ? 'De janeiro ao fim do ' + P.rotuloLongo({ ano: S.a.ano, tipo: r.ate.slice(0, 2) }) + ', ' : 'No exercício de ' + S.a.ano + ', ', b(P.fBi(r.total)), ' em dividendos e JCP declarados', parcial ? ' (registrados nas demonstrações até ' + r.ate + ')' : '', parcial ? '' : ok(r.payout) ? ' (' + P.f1(r.payout) + '% do lucro dos controladores)' : '', ok(r.dy) ? '; rendimento de ' + P.f1(r.dy) + '% sobre o valor de mercado no fim do ano.' : '.']);
  };
  H.governanca = function () {
    var s = P.D.freSeries; if (!s) return null;
    var anos = P.exRemuneracao(), u = anos[anos.length - 1];
    var tot = s.remuneracao.filter(function (r) { return r.exercicio === u; }).reduce(function (a, r) { return a + (r.total_rs_mi || 0); }, 0);
    var ac = s.acionistas[s.acionistas.length - 1];
    return frase(['Remuneração total da administração de ', b('R$ ' + P.f1(tot) + ' mi'), ' em ' + u, ac && ok(ac.pf) ? '; ' + P.fN(ac.pf) + ' acionistas pessoas físicas no Formulário de Referência de ' + ac.ano_fre + '.' : '.']);
  };
  H.comunicados = function () {
    var d = P.D.ipe && P.D.ipe.documentos.filter(function (x) { return x.categoria === 'Fato Relevante'; })[0];
    return d ? frase(['Último fato relevante, em ' + P.fData(d.data_entrega) + ': ', b(d.assunto || d.tipo || 'ver documento'), '.']) : null;
  };
  H.simulador = function () { return ['Simule o EBITDA Ajustado e a alavancagem a partir de volume e margem por m³, com base no último período divulgado.']; };
})();
