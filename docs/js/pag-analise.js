/* Vibra em Números — Comparar (A × B com análise vertical e horizontal) e MD&A. */
(function () {
  'use strict';
  var P = window.P, G = window.Graficos, h = P.h, ok = P.ok, S = P.S, Dados = window.Dados;

  // par comparado: períodos padrão (A e B do seletor) ou intervalo personalizado (soma de trimestres)
  var CMP = { modo: 'per', livre: null, secao: 'dre', niv: 'r' };
  P.CMP = CMP;
  P.ladoA = function () { if (CMP.modo === 'livre' && CMP.livre) return { p: CMP.livre.aFim, base: 'R:' + CMP.livre.aIni }; return P.x(S.a); };
  P.ladoB = function () { if (CMP.modo === 'livre' && CMP.livre) return { p: CMP.livre.bFim, base: 'R:' + CMP.livre.bIni }; return P.x(S.b); };
  P.rotLado = function (l) { return P.M.rotulo(l.p, l.base); };

  var KEY = [['Receita líquida', 'dre', '3.01'], ['Lucro bruto', 'dre', '3.03'], ['EBITDA Ajustado', 'aj', 'CONS'], ['Resultado financeiro', 'dre', '3.06'], ['Lucro líquido', 'dre', '3.11'],
    ['Caixa operacional', 'dfc', '6.01'], ['Investimentos', 'dfc', '6.02']];
  function valor(tipo, cd, l) { return tipo === 'aj' ? P.M.aj(cd, l.p, l.base) : P.M.agg(tipo, cd, l.p, l.base); }

  function linhasComparacao(secao) {
    var M = P.M, A = P.ladoA(), B = P.ladoB(), out = [], csv = [];
    var dif = function (a, b) { return ok(a) && ok(b) ? a - b : null; }, rel = function (a, b) { return ok(a) && ok(b) && b !== 0 && (a < 0) === (b < 0) ? a / b - 1 : null; };
    var celsVal = function (a, b, avA, avB) {
      var d = dif(a, b), r = rel(a, b);
      return { cel: [P.fN(a), avA, P.fN(b), avB, P.fN(d), P.fPct(r)], cclass: ['', 'av', '', 'av', ok(d) ? (d >= 0 ? 'pos' : 'neg') : '', ok(r) ? (r >= 0 ? 'pos' : 'neg') : ''] };
    };
    var demos = secao === 'tudo' ? ['dre', 'bp', 'dfc', 'dva'] : (['dre', 'bp', 'dfc', 'dva'].indexOf(secao) >= 0 ? [secao] : []);
    demos.forEach(function (ds) {
      out.push({ grupo: P.NOME_DS[ds] + (ds === 'bp' ? ' (saldos no fim de cada período)' : '') });
      var den = P.DEN[ds], dA = den ? M.agg(ds, den, A.p, A.base) : null, dB = den ? M.agg(ds, den, B.p, B.base) : null;
      M.linhas(ds).forEach(function (l) {
        if (ds === 'dre' && l.cd_conta.indexOf('3.99') === 0) return;
        if (CMP.niv === 'r' && !P.RESUMO[ds](l)) return;
        var a = M.agg(ds, l.cd_conta, A.p, A.base), b = M.agg(ds, l.cd_conta, B.p, B.base);
        if (!ok(a) && !ok(b)) return;
        var av = function (v, d) { return den && ok(v) && ok(d) && d ? P.f1(v / d * 100) + '%' : '—'; };
        var c = celsVal(a, b, av(a, dA), av(b, dB));
        out.push({ id: ds + l.cd_conta, conta: l.cd_conta + '  ' + l.conta, nivel: l.nivel, cel: c.cel, cclass: c.cclass, a: a, b: b, cls: P.TOT[ds].indexOf(l.cd_conta) >= 0 ? 'tot' : (l.nivel <= 2 ? 'l1' : '') });
        csv.push([P.NOME_DS[ds], l.cd_conta, l.conta, P.numCsv(a), P.numCsv(b), P.numCsv(dif(a, b)), P.numCsv(rel(a, b))]);
      });
    });
    if (secao === 'oper' || secao === 'tudo') {
      out.push({ grupo: 'Operacional e EBITDA Ajustado' });
      var nomes = (P.D.aj && P.D.aj.segmentos) || {};
      var addOp = function (rot, fa, fb, fmt, cls) { var a = fa, b = fb; if (!ok(a) && !ok(b)) return; var d = dif(a, b), r = rel(a, b); out.push({ conta: rot, cel: [fmt(a), '', fmt(b), '', fmt(d), P.fPct(r)], cclass: ['', '', '', '', ok(d) ? (d >= 0 ? 'pos' : 'neg') : '', ok(r) ? (r >= 0 ? 'pos' : 'neg') : ''], cls: cls || '' }); csv.push(['Operacional', '', rot, P.numCsv(a), P.numCsv(b), P.numCsv(d), P.numCsv(r)]); };
      addOp('Volume total (mil m³)', P.oper('CONS', 'vol', A.p, A.base), P.oper('CONS', 'vol', B.p, B.base), P.fN, 'tot');
      ['REDE', 'B2B', 'GC', 'AVI', 'OUT'].forEach(function (s) { addOp('Volume — ' + (nomes[s] || s), P.oper(s, 'vol', A.p, A.base), P.oper(s, 'vol', B.p, B.base), P.fN); });
      addOp('EBITDA Ajustado (R$ mi)', M.aj('CONS', A.p, A.base), M.aj('CONS', B.p, B.base), P.fN, 'tot');
      ['REDE', 'B2B', 'REN', 'GC', 'AVI', 'OUT', 'CORP'].forEach(function (s) { addOp('EBITDA Ajustado — ' + (nomes[s] || s), M.aj(s, A.p, A.base), M.aj(s, B.p, B.base), P.fN); });
      addOp('Margem EBITDA Ajustado (R$/m³)', P.oper('CONS', 'margem_m3', A.p, A.base), P.oper('CONS', 'margem_m3', B.p, B.base), P.fInt, 'tot');
      ['REDE', 'B2B'].forEach(function (s) { addOp('Margem — ' + nomes[s] + ' (R$/m³)', P.oper(s, 'margem_m3', A.p, A.base), P.oper(s, 'margem_m3', B.p, B.base), P.fInt); });
    }
    if (secao === 'ind' || secao === 'tudo') {
      out.push({ grupo: 'Indicadores' });
      var g = null;
      M.indicadores.forEach(function (i) {
        var a = M.ind(i.id, A.p, A.base), b = M.ind(i.id, B.p, B.base);
        if (!ok(a) && !ok(b)) return;
        if (i.grupo !== g && secao === 'ind') { g = i.grupo; out.push({ grupo: g }); }
        var d = dif(a, b), dtx = i.un === '%' ? P.fPP(d) : (i.un === 'R$ mi' ? P.fN(d) : (ok(d) ? (d >= 0 ? '+' : '−') + P.fUn(i.un, Math.abs(d)) : '—'));
        out.push({ conta: i.nome + (i.un === 'R$ mi' ? '' : ' (' + i.un + ')'), info: i.formula + '. ' + (i.nota || ''), cel: [P.fUn(i.un, a), '', P.fUn(i.un, b), '', dtx, i.un === 'R$ mi' ? P.fPct(rel(a, b)) : '—'], cclass: ['', '', '', '', ok(d) ? (d >= 0 ? 'pos' : 'neg') : '', ''] });
        csv.push(['Indicadores', i.id, i.nome + ' (' + i.un + ')', P.numCsv(a), P.numCsv(b), P.numCsv(d), '']);
      });
    }
    return { out: out, csv: csv, A: A, B: B };
  }
  P.linhasComparacao = linhasComparacao;

  function paginaComparar() {
    var ref = {};
    function trims() { return P.M.periodos('dre', 'T'); }
    function livrePadrao() { var t = trims(), f = t[t.length - 1]; return { aIni: P.M.desloca(f, 3), aFim: f, bIni: P.M.desloca(f, 7), bFim: P.M.desloca(f, 4) }; }
    return {
      init: function (el) {
        ref.modo = h('div', { class: 'controls' }); ref.livre = h('div', { class: 'controls' }); ref.ctl = h('div', { class: 'controls' });
        ref.tit = h('h2'); ref.aviso = h('div', { class: 'aviso', hidden: true }); ref.tb = h('table'); ref.pares = P.chart('c-pares'); ref.var = P.chart('c-var');
        el.append(ref.modo, ref.livre, ref.ctl,
          h('div', { class: 'grid' }, P.card('Principais números', 'R$ milhões. A em verde, B em cinza.', ref.pares), P.card('Maiores variações', 'Linhas da seção escolhida com maior variação absoluta (A − B), R$ milhões.', ref.var)),
          h('div', { class: 'sec' }, h('h2', null, 'Pontes de B para A')),
          h('p', { class: 'note', style: 'margin-top:-4px' }, 'Cada ponte parte do valor de um período e chega ao do outro, linha a linha. Os grupos sem conta própria são calculados por diferença, e por isso cada ponte fecha exatamente com os totais das demonstrações.'),
          h('div', { class: 'grid' }, P.card(ref.tLuc = h('span'), 'R$ milhões. Variação de cada linha do resultado entre os dois períodos.', ref.pLuc = P.chart('c-pluc')),
            P.card(ref.tDiv = h('span'), ref.nDiv = h('span'), ref.pDiv = P.chart('c-pdiv'))),
          h('div', { class: 'grid' }, P.card(ref.tAt = h('span'), 'R$ milhões, saldos no fim de cada período.', ref.pAt = P.chart('c-pat')),
            P.card(ref.tPa = h('span'), 'R$ milhões, saldos no fim de cada período. Dívida: empréstimos, financiamentos e arrendamentos.', ref.pPa = P.chart('c-ppa'))),
          ref.tit, ref.aviso, h('div', { class: 'twrap' }, ref.tb),
          h('p', { class: 'note', style: 'margin-top:10px' }, 'AV: análise vertical (% da receita na DRE, do ativo total no balanço, das receitas na DVA). Δ % (análise horizontal): variação de A sobre B, calculada quando os dois valores têm o mesmo sinal. Indicadores em % mostram a diferença em pontos percentuais. Retorno, alavancagem e valuation usam sempre os 12 meses até o fim de cada período.'));
      },
      render: function () {
        ref.modo.replaceChildren(P.segmentado([['per', 'Períodos'], ['livre', 'Intervalo personalizado']], CMP.modo, function (v) { CMP.modo = v; if (v === 'livre' && !CMP.livre) CMP.livre = livrePadrao(); P.render(); }, 'Modo de comparação'));
        P.$('periodo').hidden = CMP.modo === 'livre';
        ref.livre.hidden = CMP.modo !== 'livre';
        if (CMP.modo === 'livre') {
          var t = trims().slice().reverse().map(function (p) { return [p, p]; }), pend = JSON.parse(JSON.stringify(CMP.livre));
          var sel = function (k, rot) { return P.label(rot, P.select('cl-' + k, t, pend[k], function (v) { pend[k] = v; }, rot)); };
          ref.livre.replaceChildren(h('span', { class: 'per-t' }, 'A'), sel('aIni', 'de'), sel('aFim', 'até'), h('span', { class: 'per-t' }, 'B'), sel('bIni', 'de'), sel('bFim', 'até'),
            h('button', { class: 'btn sel', type: 'button', onclick: function () { ['a', 'b'].forEach(function (s) { if (Dados.ord(pend[s + 'Ini']) > Dados.ord(pend[s + 'Fim'])) pend[s + 'Ini'] = pend[s + 'Fim']; }); CMP.livre = pend; P.render(); } }, 'Aplicar'));
        }
        ref.ctl.replaceChildren(
          P.segmentado([['dre', 'Resultado'], ['bp', 'Balanço'], ['dfc', 'Fluxo de caixa'], ['dva', 'DVA'], ['oper', 'Operacional'], ['ind', 'Indicadores'], ['tudo', 'Tudo']], CMP.secao, function (v) { CMP.secao = v; P.render(); }, 'Seção'),
          P.segmentado([['r', 'Resumo'], ['d', 'Detalhado']], CMP.niv, function (v) { CMP.niv = v; P.render(); }, 'Nível'),
          h('button', { class: 'btn', type: 'button', onclick: function () { var r = linhasComparacao(CMP.secao), a = P.rotLado(r.A), b = P.rotLado(r.B); P.csv('vibra_comparacao_' + a + '_vs_' + b + '.csv', ['secao', 'cd_conta', 'conta', a, b, 'A − B', 'Δ %'], r.csv); } }, 'Baixar para Excel'));
        var r = linhasComparacao(CMP.secao), rA = P.rotLado(r.A), rB = P.rotLado(r.B);
        ref.tit.textContent = rA + ' (A) × ' + rB + ' (B)';
        var nA = Dados.trimestresBase(r.A.base, r.A.p), nB = Dados.trimestresBase(r.B.base, r.B.p);
        ref.aviso.hidden = nA === nB; ref.aviso.textContent = nA === nB ? '' : 'Atenção: A soma ' + nA + ' trimestre(s) e B soma ' + nB + '; os fluxos não são diretamente comparáveis.';
        P.tabela(ref.tb, 'R$ milhões', [rA, 'AV', rB, 'AV', 'A − B', 'Δ %'], r.out);
        G.pares(ref.pares, KEY.map(function (k) { return { rot: k[0], a: valor(k[1], k[2], r.A), b: valor(k[1], k[2], r.B) }; }), rA, rB, P.fN);
        var cand = r.out.filter(function (l) { return !l.grupo && ok(l.a) && ok(l.b) && l.cls !== 'tot' && (l.nivel || 2) >= 3; });
        if (cand.length < 4) cand = r.out.filter(function (l) { return !l.grupo && ok(l.a) && ok(l.b) && l.cls !== 'tot'; });
        cand.sort(function (x, y) { return Math.abs(y.a - y.b) - Math.abs(x.a - x.b); });
        pontes(r.A, r.B, rA, rB, nA === nB);
        G.variacoes(ref.var, cand.slice(0, 8).filter(function (l) { return Math.abs(l.a - l.b) >= 1; }).map(function (l) { return { rot: l.conta.replace(/^[\d.]+\s+/, ''), v: l.a - l.b }; }), P.fN);
      },
      manchete: function () { return P.manchete.comparar(); }
    };
    function pontes(A, B, rA, rB, comparavel) {
      var E = P.M.estrutura, fimA = A.p, fimB = B.p;
      ref.tLuc.textContent = 'Lucro líquido: de ' + rB + ' para ' + rA;
      var pl = comparavel ? E.ponteLucro(A, B) : null;
      if (pl) { pl.inicio.rot = 'Lucro ' + rB; pl.fim.rot = 'Lucro ' + rA; G.ponte(ref.pLuc, pl.inicio, pl.passos, pl.fim, P.fN); }
      else G.falha(ref.pLuc, comparavel ? 'Sem dados para os dois períodos' : 'A e B têm números de trimestres diferentes; a ponte do lucro não se aplica');
      ref.tAt.textContent = 'Ativo: de ' + fimB + ' para ' + fimA;
      ref.tPa.textContent = 'Passivo e patrimônio líquido: de ' + fimB + ' para ' + fimA;
      var ba = E.ponteBalanco(fimB, fimA, 'ativo'), bp = E.ponteBalanco(fimB, fimA, 'passivo');
      if (ba) G.ponte(ref.pAt, ba.inicio, ba.passos, ba.fim, P.fN); else G.falha(ref.pAt);
      if (bp) G.ponte(ref.pPa, bp.inicio, bp.passos, bp.fim, P.fN); else G.falha(ref.pPa);
      // dívida líquida: sempre do período mais antigo para o mais recente, pelos fluxos de caixa do intervalo
      var o = P.M.ord, p0 = o(fimA) < o(fimB) ? fimA : fimB, p1 = p0 === fimA ? fimB : fimA;
      ref.tDiv.textContent = 'Dívida líquida: de ' + p0 + ' para ' + p1;
      ref.nDiv.textContent = 'R$ milhões, dívida líquida como divulgada no release. Fluxos de caixa de ' + P.M.desloca(p0, -1) + ' a ' + p1 + '. Verde: reduz a dívida; amarelo: aumenta. "Outros sem efeito no caixa": juros apropriados acima dos pagos, novos arrendamentos, câmbio e marcação a mercado de swaps, entre outros.';
      var pd = p0 !== p1 ? E.ponteDivida(p0, p1) : null;
      if (pd) G.ponte(ref.pDiv, pd.inicio, pd.passos, pd.fim, P.fN, { reduzBom: true }); else G.falha(ref.pDiv, p0 === p1 ? 'A e B terminam no mesmo trimestre' : 'Sem dívida líquida divulgada para os dois períodos');
    }
  }

  function paginaMda() {
    var ref = {}, ultimo = null;
    return {
      init: function (el) {
        ref.acoes = h('div', { class: 'controls' }); ref.texto = h('article', { class: 'mda' }); ref.lado = h('aside', { class: 'mda-lado' });
        el.append(ref.acoes, h('div', { class: 'mda-grid' }, ref.texto, ref.lado));
      },
      render: function () {
        var A = P.x(S.a), B = P.x(S.b);
        var r = window.Mda.gerar(P.M, A, B, { oper: P.oper, textos: P.D.reltxt, fre: P.D.fre10, ia: P.D.mdaIa && P.D.mdaIa.liberado ? P.D.mdaIa : null, ipe: P.D.ipe, aj: P.D.aj, rotulo: P.rotuloLongo, perA: S.a, perB: S.b });
        ultimo = r;
        ref.acoes.replaceChildren(
          h('button', { class: 'btn', type: 'button', onclick: function () { P.arquivo('MDA_' + r.rotA + '_x_' + r.rotB + '.doc', window.Mda.html(r), 'application/msword'); } }, 'Baixar para Word'),
          h('button', { class: 'btn', type: 'button', onclick: function () { P.exportaPdf(); } }, 'Baixar em PDF'),
          h('button', { class: 'btn', type: 'button', onclick: function () { if (navigator.clipboard) navigator.clipboard.writeText(window.Mda.texto(r)).catch(function () { }); } }, 'Copiar texto'));
        ref.texto.replaceChildren();
        ref.texto.appendChild(h('h1', { class: 'mda-t' }, r.titulo));
        ref.texto.appendChild(h('p', { class: 'mda-sub' }, r.subtitulo));
        r.secoes.forEach(function (s) {
          ref.texto.appendChild(h('h2', null, s.titulo));
          (s.paragrafos || []).forEach(function (p) { ref.texto.appendChild(h('p', null, p)); });
          if (s.itens && s.itens.length) ref.texto.appendChild(h('ul', null, s.itens.map(function (t) { return h('li', null, t); })));
          (s.citacoes || []).forEach(function (c) { ref.texto.appendChild(h('blockquote', null, c.texto, h('cite', null, ' — ', c.link ? h('a', { href: c.link, target: '_blank', rel: 'noopener noreferrer' }, c.fonte) : c.fonte))); });
          if (s.ponte) { var ch = P.chart('mda-' + s.id); ref.texto.appendChild(ch); G.cascata(ch, s.ponte.inicio, s.ponte.passos, s.ponte.fim, P.fN); }
        });
        ref.texto.appendChild(h('h2', null, 'Fontes'));
        ref.texto.appendChild(h('ul', { class: 'fontes' }, r.fontes.map(function (f) { return h('li', null, f.link ? h('a', { href: f.link, target: '_blank', rel: 'noopener noreferrer' }, f.nome) : f.nome); })));
        // quadro lateral A × B
        ref.lado.replaceChildren(h('h2', null, 'Números-chave'), (function () { var tb = h('table'); P.tabela(tb, '', [r.rotA, r.rotB, 'Δ'], r.quadro.map(function (q) { return { conta: q.rot, cel: [q.a, q.b, q.d], cclass: ['', '', q.cls || ''] }; })); return h('div', { class: 'twrap' }, tb); })());
      },
      manchete: function () { return ultimo ? ultimo.manchete : null; }
    };
  }

  P.paginasAnalise = function () {
    P.registra('comp', 'Comparar', paginaComparar(), 'ab');
    P.registra('mda', 'MD&A', paginaMda(), 'ab');
  };
})();
