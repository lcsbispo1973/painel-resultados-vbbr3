/* Vibra em Números — MD&A gerado por regras para o par de períodos A × B.
   Números: demonstrações da CVM (ITR/DFP) e EBITDA Ajustado da nota de segmentos; volumes dos releases.
   Texto qualitativo: trechos dos releases e do item 10 do Formulário de Referência, sempre citados com a fonte. */
(function (raiz) {
  'use strict';
  var P = raiz.P;
  var ok = function (v) { return v !== null && v !== undefined && isFinite(v); };
  var pct = function (a, b) { return ok(a) && ok(b) && b !== 0 && (a < 0) === (b < 0) ? a / b - 1 : null; };
  function varTxt(a, b, tipo) {   // "alta de 12,3% (R$ 4,5 bi contra R$ 4,0 bi)"
    if (!ok(a)) return 'não disponível';
    if (!ok(b)) return P.fMi(a);
    var r = pct(a, b), f = tipo === 'm3' ? function (v) { return 'R$ ' + P.fInt(v) + '/m³'; } : tipo === 'x' ? function (v) { return P.f2(v) + 'x'; } : tipo === 'vol' ? function (v) { return P.fN(v) + ' mil m³'; } : P.fMi;
    if (tipo === 'x' || tipo === 'm3') { var d = a - b; return f(a) + ' (' + (d >= 0 ? '+' : '−') + (tipo === 'x' ? P.f2(Math.abs(d)) + 'x' : 'R$ ' + P.fInt(Math.abs(d)) + '/m³') + ' sobre ' + f(b) + ')'; }
    if (!ok(r)) return f(a) + ' (' + f(b) + ' no período de comparação)';
    var s = Math.abs(r) < 0.005 ? 'estável' : (r > 0 ? 'alta de ' : 'queda de ') + P.f1(Math.abs(r) * 100) + '%';
    return f(a) + ' (' + s + (s === 'estável' ? '' : ',') + ' contra ' + f(b) + ')';
  }
  function trimestres(x) { var k = raiz.Dados.trimestresBase(x.base, x.p), n = raiz.Dados.ord(x.p), out = []; for (var i = n - k + 1; i <= n; i++) out.push(raiz.Dados.lab(i)); return out; }
  function intervaloDatas(x) {
    var qs = trimestres(x), q0 = qs[0], q1 = qs[qs.length - 1];
    var ini = (2000 + +q0.slice(2)) + '-' + String((+q0[0] - 1) * 3 + 1).padStart(2, '0') + '-01';
    var fim = (2000 + +q1.slice(2)) + '-' + String(+q1[0] * 3).padStart(2, '0') + '-31';
    return [ini, fim];
  }

  function gerar(M, A, B, c) {
    var rA = M.rotulo(A.p, A.base), rB = M.rotulo(B.p, B.base), lA = c.rotulo(c.perA), lB = c.rotulo(c.perB);
    var g = function (ds, cd, x) { return M.agg(ds, cd, x.p, x.base); };
    var ind = function (id, x) { return M.ind(id, x.p, x.base); };
    var aj = function (s, x) { return M.aj(s, x.p, x.base); };
    var op = function (s, m, x) { return c.oper(s, m, x.p, x.base); };
    var fontes = [], vistos = {};
    var addFonte = function (nome, link) { link = link && link.replace(/^http:/, "https:"); if (link && !vistos[link]) { vistos[link] = 1; fontes.push({ nome: nome, link: link }); } };
    // releases dos trimestres de A (o último trimestre traz o acumulado)
    var qsA = trimestres(A), txt = c.textos && c.textos.trimestres ? c.textos.trimestres : {};
    var relUlt = txt[qsA[qsA.length - 1]] || null;
    var cita = function (tema, n) {
      var out = [];
      [qsA[qsA.length - 1]].concat(qsA.slice(0, -1).reverse()).forEach(function (q) {
        var r = txt[q]; if (!r || !r.temas[tema] || out.length >= (n || 1)) return;
        out.push({ texto: '“' + r.temas[tema][0] + '”', fonte: 'Release ' + q + ' (' + P.fData(r.data) + ')', link: r.link });
        addFonte('Release de resultados ' + q, r.link);
      });
      return out;
    };

    // ---- números ----
    var V = {
      rec: [g('dre', '3.01', A), g('dre', '3.01', B)], lb: [g('dre', '3.03', A), g('dre', '3.03', B)], cpv: [g('dre', '3.02', A), g('dre', '3.02', B)],
      dv: [g('dre', '3.04.01', A), g('dre', '3.04.01', B)], dga: [g('dre', '3.04.02', A), g('dre', '3.04.02', B)], dop: [g('dre', '3.04', A), g('dre', '3.04', B)],
      fin: [g('dre', '3.06', A), g('dre', '3.06', B)], ir: [g('dre', '3.08', A), g('dre', '3.08', B)], lair: [g('dre', '3.07', A), g('dre', '3.07', B)],
      luc: [g('dre', '3.11', A), g('dre', '3.11', B)], lucC: [g('dre', '3.11.01', A), g('dre', '3.11.01', B)],
      aj: [aj('CONS', A), aj('CONS', B)], ebc: [ind('ebitdac', A), ind('ebitdac', B)],
      vol: [op('CONS', 'vol', A), op('CONS', 'vol', B)], m3: [op('CONS', 'margem_m3', A), op('CONS', 'margem_m3', B)],
      fco: [g('dfc', '6.01', A), g('dfc', '6.01', B)], capex: [g('dfc', '6.02.01', A), g('dfc', '6.02.01', B)], fcl: [ind('fcl', A), ind('fcl', B)],
      divpg: [g('dfc', '6.03.05', A), g('dfc', '6.03.05', B)], dcx: [g('dfc', '6.05', A), g('dfc', '6.05', B)],
      dliq: [ind('dliq', A), ind('dliq', B)], dbr: [ind('dbruta', A), ind('dbruta', B)], alav: [ind('dlebitda', A), ind('dlebitda', B)],
      pl: [g('bp', '2.03', A), g('bp', '2.03', B)], roe: [ind('roe', A), ind('roe', B)], roic: [ind('roic', A), ind('roic', B)],
      pmr: [ind('pmr', A), ind('pmr', B)], pme: [ind('pme', A), ind('pme', B)], pmp: [ind('pmp', A), ind('pmp', B)], ciclo: [ind('cfin', A), ind('cfin', B)],
      conv: [ind('convfco', A), ind('convfco', B)], pl_m: [ind('pl', A), ind('pl', B)], ev: [ind('evebitda', A), ind('evebitda', B)]
    };
    var fA = M.ajFonte('CONS', qsA[qsA.length - 1]);
    if (fA && fA.fonte) addFonte((fA.fonte.tipo === 'release' ? 'Release ' : (fA.fonte.tipo || 'ITR') + ' — nota de informações por segmento, ') + (fA.fonte.documento || qsA[qsA.length - 1]), fA.fonte.link);

    var secoes = [];
    // 1. destaques
    secoes.push({ id: 'dest', titulo: 'Destaques do ' + lA, itens: [
      'Receita líquida de ' + varTxt(V.rec[0], V.rec[1]) + '.',
      'EBITDA Ajustado de ' + varTxt(V.aj[0], V.aj[1]) + (ok(V.m3[0]) ? ', com margem de ' + varTxt(V.m3[0], V.m3[1], 'm3') : '') + '.',
      'Lucro líquido de ' + varTxt(V.luc[0], V.luc[1]) + '.',
      'Caixa operacional de ' + varTxt(V.fco[0], V.fco[1]) + '; fluxo de caixa livre de ' + P.fMi(V.fcl[0]) + '.',
      ok(V.alav[0]) ? 'Alavancagem (dívida líquida ÷ EBITDA Ajustado de 12 meses) de ' + varTxt(V.alav[0], V.alav[1], 'x') + '.' : null
    ].filter(Boolean) });

    // 2. sumário executivo
    var s1 = 'No ' + lA + ', a Vibra vendeu ' + (ok(V.vol[0]) ? P.fN(V.vol[0]) + ' mil m³' + (ok(pct(V.vol[0], V.vol[1])) ? ' (' + P.fPct(pct(V.vol[0], V.vol[1])) + ' sobre o ' + lB + ')' : '') : 'volume não disponível') +
      ' e registrou EBITDA Ajustado de ' + P.fMi(V.aj[0]) + (ok(pct(V.aj[0], V.aj[1])) ? ', ' + (V.aj[0] >= V.aj[1] ? 'alta' : 'queda') + ' de ' + P.f1(Math.abs(pct(V.aj[0], V.aj[1])) * 100) + '%' : '') + '.';
    var s2 = ok(V.m3[0]) ? 'A margem EBITDA Ajustada foi de R$ ' + P.fInt(V.m3[0]) + '/m³' + (ok(V.m3[1]) ? ', contra R$ ' + P.fInt(V.m3[1]) + '/m³ no ' + lB : '') + '.' : '';
    var s3 = 'O lucro líquido somou ' + P.fMi(V.luc[0]) + (ok(V.luc[1]) ? ' (' + P.fMi(V.luc[1]) + ' no ' + lB + ')' : '') + ', e o caixa operacional, ' + P.fMi(V.fco[0]) + '.';
    secoes.push({ id: 'sum', titulo: 'Sumário executivo', paragrafos: [s1 + ' ' + s2 + ' ' + s3], citacoes: cita('MSG', 1).concat(cita('CONS', 1)) });

    // 3. operacional por segmento
    var nomes = (c.aj && c.aj.segmentos) || {};
    var itensOp = ['REDE', 'B2B', 'REN', 'GC', 'AVI', 'OUT'].filter(function (s) { return ok(aj(s, A)) || ok(op(s, 'vol', A)); }).map(function (s) {
      var partes = [nomes[s] || s + ':'];
      var v = op(s, 'vol', A), e = aj(s, A), m = op(s, 'margem_m3', A);
      return (nomes[s] || s) + ': ' + [ok(v) ? 'volume de ' + varTxt(v, op(s, 'vol', B), 'vol') : null, ok(e) ? 'EBITDA Ajustado de ' + varTxt(e, aj(s, B)) : null, ok(m) && s !== 'REN' ? 'margem de ' + varTxt(m, op(s, 'margem_m3', B), 'm3') : null].filter(Boolean).join('; ') + '.';
    });
    var corp = aj('CORP', A);
    if (ok(corp)) itensOp.push('Corporativo e reconciliação: ' + P.fMi(corp) + (ok(aj('CORP', B)) ? ' (' + P.fMi(aj('CORP', B)) + ' no ' + lB + ')' : '') + '.');
    secoes.push({ id: 'op', titulo: 'Desempenho operacional', paragrafos: ['EBITDA Ajustado conforme a nota de informações por segmento das demonstrações financeiras; volumes conforme os releases.'], itens: itensOp,
      citacoes: cita('REDE', 1).concat(cita('B2B', 1), cita('REN', 1)) });

    // 4. resultado
    var mb = function (i) { return ok(V.lb[i]) && ok(V.rec[i]) && V.rec[i] ? V.lb[i] / V.rec[i] * 100 : null; };
    var aliq = function (i) { return ok(V.ir[i]) && ok(V.lair[i]) && V.lair[i] > 0 ? -V.ir[i] / V.lair[i] * 100 : null; };
    var outras = function (i) { return ok(V.dop[i]) ? V.dop[i] - (V.dv[i] || 0) - (V.dga[i] || 0) : null; };
    var pr = [
      'A receita líquida foi de ' + varTxt(V.rec[0], V.rec[1]) + ', e o lucro bruto, de ' + varTxt(V.lb[0], V.lb[1]) + (ok(mb(0)) ? ', com margem bruta de ' + P.f1(mb(0)) + '%' + (ok(mb(1)) ? ' (' + P.f1(mb(1)) + '% no ' + lB + ')' : '') : '') + '.',
      'As despesas com vendas somaram ' + P.fMi(ok(V.dv[0]) ? -V.dv[0] : null) + ' e as gerais e administrativas, ' + P.fMi(ok(V.dga[0]) ? -V.dga[0] : null) + '; outras receitas e despesas operacionais (incluindo equivalência) líquidas foram de ' + P.fMi(outras(0)) + (ok(outras(1)) ? ' (' + P.fMi(outras(1)) + ' no ' + lB + ')' : '') + '.',
      ok(V.aj[0]) && ok(V.ebc[0]) ? 'O EBITDA contábil, calculado das demonstrações, foi de ' + P.fMi(V.ebc[0]) + '; a diferença de ' + P.fMi(V.aj[0] - V.ebc[0]) + ' para o EBITDA Ajustado corresponde aos ajustes definidos pela Companhia na nota de segmentos.' : null,
      'O resultado financeiro foi de ' + varTxt(V.fin[0], V.fin[1]) + '. O imposto de renda e a contribuição social somaram ' + P.fMi(ok(V.ir[0]) ? -V.ir[0] : null) + (ok(aliq(0)) ? ', alíquota efetiva de ' + P.f1(aliq(0)) + '%' : '') + '.',
      'O lucro líquido foi de ' + varTxt(V.luc[0], V.luc[1]) + (ok(V.lucC[0]) && Math.abs(V.lucC[0] - V.luc[0]) >= 1 ? ', dos quais ' + P.fMi(V.lucC[0]) + ' atribuíveis aos controladores' : '') + '.'
    ].filter(Boolean);
    var ponte = null;
    if (ok(V.luc[0]) && ok(V.luc[1])) {
      var d = function (k) { return ok(V[k][0]) && ok(V[k][1]) ? V[k][0] - V[k][1] : 0; };
      var passos = [{ rot: 'Lucro bruto', v: d('lb') }, { rot: 'Despesas com vendas', v: d('dv') }, { rot: 'Gerais e administrativas', v: d('dga') },
        { rot: 'Outras operacionais', v: (outras(0) || 0) - (outras(1) || 0) }, { rot: 'Resultado financeiro', v: d('fin') }, { rot: 'IR e CS', v: d('ir') }];
      var resto = (V.luc[0] - V.luc[1]) - passos.reduce(function (a, p) { return a + p.v; }, 0);
      if (Math.abs(resto) >= 0.5) passos.push({ rot: 'Outros', v: resto });
      ponte = { inicio: { rot: 'Lucro ' + rB, v: V.luc[1] }, passos: passos.filter(function (p) { return Math.abs(p.v) >= 0.5; }), fim: { rot: 'Lucro ' + rA, v: V.luc[0] } };
    }
    secoes.push({ id: 'res', titulo: 'Resultado', paragrafos: pr, ponte: ponte, citacoes: cita('FIN', 1).concat(cita('LUCRO', 1)) });

    // 5. balanço
    secoes.push({ id: 'bal', titulo: 'Balanço, capital de giro e endividamento', paragrafos: [
      'Ao fim do período, a dívida bruta (empréstimos, financiamentos e arrendamentos) era de ' + P.fMi(V.dbr[0]) + ' e a dívida líquida, conforme o release, de ' + varTxt(V.dliq[0], V.dliq[1]) + '.' +
        (ok(V.alav[0]) ? ' A alavancagem medida por dívida líquida ÷ EBITDA Ajustado de 12 meses ficou em ' + varTxt(V.alav[0], V.alav[1], 'x') +
          (function () { var r = window.P && P.D.dlrel && P.D.dlrel.series[A.p]; return r && ok(r.alav_divulgada) ? ' (a Companhia divulgou ' + P.f1(r.alav_divulgada) + 'x no release)' : ''; })() + '.' : ''),
      ok(V.ciclo[0]) ? 'No capital de giro (12 meses), o prazo médio de recebimento foi de ' + P.f1(V.pmr[0]) + ' dias, o de estocagem de ' + P.f1(V.pme[0]) + ' e o de pagamento de ' + P.f1(V.pmp[0]) + ', resultando em ciclo de caixa de ' + P.f1(V.ciclo[0]) + ' dias' + (ok(V.ciclo[1]) ? ' (' + P.f1(V.ciclo[1]) + ' no ' + lB + ')' : '') + '.' : null,
      'O patrimônio líquido consolidado somava ' + varTxt(V.pl[0], V.pl[1]) + '.'
    ].filter(Boolean), citacoes: cita('DIV', 1) });

    // 6. fluxo de caixa
    secoes.push({ id: 'cx', titulo: 'Fluxo de caixa', paragrafos: [
      'O caixa gerado nas atividades operacionais foi de ' + varTxt(V.fco[0], V.fco[1]) + (ok(V.conv[0]) ? ', ' + P.f1(V.conv[0]) + '% do EBITDA Ajustado' : '') + '. Os investimentos em imobilizado e intangível somaram ' + P.fMi(ok(V.capex[0]) ? -V.capex[0] : null) + ', e o fluxo de caixa livre ficou em ' + P.fMi(V.fcl[0]) + '.',
      (ok(V.divpg[0]) && V.divpg[0] < 0 ? 'Foram pagos ' + P.fMi(-V.divpg[0]) + ' em dividendos e juros sobre capital próprio. ' : '') + 'O caixa e equivalentes variou ' + P.fMi(V.dcx[0]) + ' no período.'
    ], citacoes: cita('CAIXA', 1).concat(cita('CAPEX', 1)) });

    // 7. retorno e mercado
    secoes.push({ id: 'ret', titulo: 'Retorno e valuation', paragrafos: [
      'Nos 12 meses até o fim do período, o ROE foi de ' + P.fUn('%', V.roe[0]) + (ok(V.roe[1]) ? ' (' + P.fUn('%', V.roe[1]) + ' no ' + lB + ')' : '') + ' e o ROIC aproximado, de ' + P.fUn('%', V.roic[0]) + '.' +
        (ok(V.pl_m[0]) ? ' Com a cotação de fechamento do período, a ação negociava a ' + P.f2(V.pl_m[0]) + 'x o lucro e ' + P.f2(V.ev[0]) + 'x o EBITDA Ajustado de 12 meses.' : '')
    ] });

    // 8. eventos e visão da administração
    var di = intervaloDatas(A), ev = [];
    // mesmo assunto reapresentado em até 10 dias conta uma vez só (fica a primeira entrega)
    var frs = c.ipe && c.ipe.documentos ? c.ipe.documentos.filter(function (d) { return d.categoria === 'Fato Relevante' && d.data_entrega >= di[0] && d.data_entrega <= di[1]; })
      .sort(function (u, v) { return u.data_entrega < v.data_entrega ? -1 : 1; }) : [];
    var vistos = {};
    frs.forEach(function (d) {
      var k = (d.assunto || d.tipo || '').trim().toLowerCase(), t = Date.parse(d.data_entrega);
      if (vistos[k] && t - vistos[k] <= 10 * 864e5) return;
      vistos[k] = t;
      if (ev.length < 8) { ev.push(P.fData(d.data_entrega) + ' — ' + (d.assunto || d.tipo)); addFonte('Fato relevante de ' + P.fData(d.data_entrega), d.link); }
    });
    // Formulário de Referência: o primeiro entregue depois do fim do exercício de A comenta esse exercício
    var anoA = 2000 + +A.p.slice(2), fre = null, anoFre = null;
    // o FRE do ano N comenta o exercício N−1; para o exercício corrente (ainda sem FRE próprio) vale o mais recente
    if (c.fre && c.fre.anos) {
      var temSub = function (k) { var f = c.fre.anos[k]; return f && f.subitens && Object.keys(f.subitens).length; };
      var ks = Object.keys(c.fre.anos).filter(temSub).sort();
      anoFre = temSub(String(anoA + 1)) ? String(anoA + 1) : ks.filter(function (k) { return +k <= anoA + 1; }).pop() || null;
      fre = anoFre ? c.fre.anos[anoFre] : null;
    }
    var citFre = [];
    if (fre && fre.subitens) {
      ['a', 'f'].forEach(function (k) {
        var s = fre.subitens[k], ps = (s && s.paragrafos) || [];
        // parágrafo sobre o fechamento do exercício comentado (versões posteriores do FRE abrem com o trimestre mais recente)
        var marca = '31 de dezembro de ' + (anoFre - 1), pr = ps.filter(function (x) { return x.indexOf(marca) >= 0 && /R\$|%/.test(x); })[0];
        if (pr) { var i = pr.search(new RegExp('Em ' + marca)); if (i > 0) pr = pr.slice(i); }
        pr = pr || ps.filter(function (x) { return x.length >= 160 && /R\$|%/.test(x); })[0] || ps[0];
        if (pr) citFre.push({ texto: '“' + pr.slice(0, 900) + (pr.length > 900 ? '…' : '') + '”', fonte: 'Formulário de Referência ' + anoFre + ' (comentários sobre o exercício de ' + (anoFre - 1) + '; versão entregue em ' + P.fData(fre.recebido) + '), item 10.1 ' + k + ') ' + s.titulo.toLowerCase(), link: fre.link }); });
      if (citFre.length) addFonte('Formulário de Referência ' + anoFre + ' (item 10)', fre.link);
    }
    secoes.push({ id: 'ev', titulo: 'Eventos do período e visão da administração', paragrafos: ev.length ? ['Fatos relevantes divulgados no período:'] : ['Não houve fato relevante divulgado no período.'], itens: ev, citacoes: citFre });

    // quadro lateral e manchete
    var fmt = { bi: P.fMi, m3: function (v) { return ok(v) ? P.fInt(v) : '—'; }, x: function (v) { return ok(v) ? P.f2(v) + 'x' : '—'; }, pc: function (v) { return P.fUn('%', v); } };
    var quadro = [['Receita líquida', V.rec, 'bi'], ['EBITDA Ajustado', V.aj, 'bi'], ['Margem (R$/m³)', V.m3, 'm3'], ['Lucro líquido', V.luc, 'bi'], ['Caixa operacional', V.fco, 'bi'], ['Fluxo de caixa livre', V.fcl, 'bi'],
      ['Dívida líquida', V.dliq, 'bi'], ['Dív. líq. ÷ EBITDA Aj.', V.alav, 'x'], ['ROE (12 meses)', V.roe, 'pc']].map(function (q) {
      var a = q[1][0], b = q[1][1], dd = q[2] === 'bi' ? pct(a, b) : (ok(a) && ok(b) ? a - b : null);
      var dtx = !ok(dd) ? '—' : q[2] === 'bi' ? P.fPct(dd) : q[2] === 'pc' ? P.fPP(dd) : q[2] === 'x' ? (dd >= 0 ? '+' : '−') + P.f2(Math.abs(dd)) + 'x' : (dd >= 0 ? '+' : '−') + P.fInt(Math.abs(dd));
      return { rot: q[0], a: fmt[q[2]](a), b: fmt[q[2]](b), d: dtx, cls: ok(dd) ? (dd >= 0 ? 'pos' : 'neg') : '' };
    });
    var r = pct(V.aj[0], V.aj[1]);
    var manchete = ['MD&A do ' + lA + ': EBITDA Ajustado de ', P.fMi(V.aj[0]), ok(r) ? ' (' + P.fPct(r) + ' sobre o ' + lB + ')' : '', ', lucro de ', P.fMi(V.luc[0]), ok(V.alav[0]) ? ' e alavancagem de ' + P.f2(V.alav[0]) + 'x.' : '.'];
    return { titulo: 'Comentário do desempenho — ' + lA, subtitulo: 'Comparação com o ' + lB + '. Valores consolidados; EBITDA Ajustado conforme a nota de informações por segmento das demonstrações financeiras.',
      secoes: secoes, quadro: quadro, fontes: fontes, manchete: manchete, rotA: rA, rotB: rB };
  }

  function texto(r) {
    var l = [r.titulo, r.subtitulo, ''];
    r.secoes.forEach(function (s) {
      l.push(s.titulo.toUpperCase()); (s.paragrafos || []).forEach(function (p) { l.push(p); }); (s.itens || []).forEach(function (t) { l.push('• ' + t); });
      (s.citacoes || []).forEach(function (c) { l.push(c.texto + ' — ' + c.fonte); }); l.push('');
    });
    l.push('FONTES'); r.fontes.forEach(function (f) { l.push(f.nome + (f.link ? ': ' + f.link : '')); });
    return l.join('\n');
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function html(r) {   // documento Word (HTML compatível)
    var b = ['<html><head><meta charset="utf-8"><title>' + esc(r.titulo) + '</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#37373A}h1{color:#004415;font-size:18pt}h2{color:#268200;font-size:13pt;margin-top:16pt}blockquote{border-left:3px solid #268200;margin:6pt 0;padding-left:8pt;color:#555}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:3pt 6pt;text-align:right}td:first-child,th:first-child{text-align:left}</style></head><body>'];
    b.push('<h1>' + esc(r.titulo) + '</h1><p><i>' + esc(r.subtitulo) + '</i></p>');
    b.push('<table><tr><th></th><th>' + esc(r.rotA) + '</th><th>' + esc(r.rotB) + '</th><th>Δ</th></tr>' + r.quadro.map(function (q) { return '<tr><td>' + esc(q.rot) + '</td><td>' + esc(q.a) + '</td><td>' + esc(q.b) + '</td><td>' + esc(q.d) + '</td></tr>'; }).join('') + '</table>');
    r.secoes.forEach(function (s) {
      b.push('<h2>' + esc(s.titulo) + '</h2>'); (s.paragrafos || []).forEach(function (p) { b.push('<p>' + esc(p) + '</p>'); });
      if (s.itens && s.itens.length) b.push('<ul>' + s.itens.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>');
      (s.citacoes || []).forEach(function (c) { b.push('<blockquote>' + esc(c.texto) + '<br><small>— ' + esc(c.fonte) + '</small></blockquote>'); });
    });
    b.push('<h2>Fontes</h2><ul>' + r.fontes.map(function (f) { return '<li>' + esc(f.nome) + (f.link ? ' — ' + esc(f.link) : '') + '</li>'; }).join('') + '</ul>');
    b.push('<p><small>Gerado automaticamente pelo painel Vibra em Números a partir de documentos públicos arquivados na CVM.</small></p></body></html>');
    return b.join('');
  }
  raiz.Mda = { gerar: gerar, texto: texto, html: html };
})(window);
