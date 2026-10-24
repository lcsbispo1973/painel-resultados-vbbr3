/* Motor de dados do painel: agrega as séries trimestrais da CVM por base de período
 * (trimestre, acumulado no ano, últimos 12 meses, anual) e calcula os indicadores.
 * Sem dependência de navegador: roda também no Node (tests/test_dados.js). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Dados = fabrica();
})(this, function () {
  'use strict';

  // ---------- períodos ----------
  var ord = function (p) { return (+p.slice(2)) * 4 + (+p[0]); };
  var lab = function (n) { var a = Math.floor((n - 1) / 4), q = ((n - 1) % 4) + 1; return q + 'T' + String(a).padStart(2, '0'); };
  var tri = function (p) { return +p[0]; };
  var desloca = function (p, k) { return lab(ord(p) - k); };
  var BASES = { T: 'Trimestre', YTD: 'Acumulado no ano', LTM: 'Últimos 12 meses', AN: 'Ano (exercício)' };
  var ANCORA = { dre: '3.01', dfc: '6.01', dva: '7.01', dra: '4.01' };

  function rotulo(p, base) {
    var q = tri(p), a = p.slice(2);
    if (base === 'AN') return '20' + a;
    if (base === 'YTD') return q === 1 ? p : q === 2 ? '6M' + a : q === 3 ? '9M' + a : '12M' + a;
    if (base === 'LTM') return 'UDM ' + p;
    return p;
  }

  // ---------- operações com nulos ----------
  var ok = function (x) { return x !== null && x !== undefined && isFinite(x); };
  var nz = function (x) { return ok(x) ? x : 0; };
  var soma = function () { var s = 0; for (var i = 0; i < arguments.length; i++) { if (!ok(arguments[i])) return null; s += arguments[i]; } return s; };
  var sub = function (a, b) { return ok(a) && ok(b) ? a - b : null; };
  var div = function (a, b) { return ok(a) && ok(b) && b !== 0 ? a / b : null; };
  var mul = function (a, b) { return ok(a) && ok(b) ? a * b : null; };
  var media = function (a, b) { return ok(a) && ok(b) ? (a + b) / 2 : null; };

  // ---------- modelo ----------
  function criar(dados) {
    var m = { dados: dados }, idx = {}, per = {};
    ['dre', 'bp', 'dfc', 'dva', 'dra'].forEach(function (ds) {
      var t = dados[ds]; idx[ds] = {}; per[ds] = t ? t.periodos.slice() : [];
      if (t) t.linhas.forEach(function (l) { idx[ds][l.cd_conta] = l; });
    });
    m.linhas = function (ds) { return dados[ds] ? dados[ds].linhas : []; };
    m.linha = function (ds, cd) { return idx[ds][cd] || null; };
    m.todosPeriodos = function () {
      var s = {}; Object.keys(per).forEach(function (ds) { per[ds].forEach(function (p) { s[p] = 1; }); });
      return Object.keys(s).sort(function (a, b) { return ord(a) - ord(b); });
    };
    m.rotulo = rotulo; m.ord = ord; m.desloca = desloca; m.tri = tri;

    var q = function (ds, cd, p) { var l = idx[ds][cd]; if (!l) return null; var v = l[p]; return ok(v) ? v : null; };
    m.trim = q;

    // valor agregado de uma conta no período p, na base escolhida
    m.agg = function (ds, cd, p, base) {
      base = base || 'T';
      if (ds === 'bp') return base === 'AN' && tri(p) !== 4 ? null : q(ds, cd, p);
      if (ds === 'dfc' && cd === '6.05.02') return base === 'AN' && tri(p) !== 4 ? null : q(ds, cd, p);
      if (base === 'T') return q(ds, cd, p);
      var n = ord(p), k;
      if (base === 'YTD') k = tri(p);
      else if (base === 'LTM') k = 4;
      else if (base === 'AN') { if (tri(p) !== 4) return null; k = 4; }
      else return null;
      if (ds === 'dfc' && cd === '6.05.01') return q(ds, cd, lab(n - k + 1));
      var anc = ANCORA[ds], s = 0, algum = false;
      for (var i = n - k + 1; i <= n; i++) {
        var pp = lab(i);
        if (anc && q(ds, anc, pp) === null) return null;
        var v = q(ds, cd, pp);
        if (v !== null) { s += v; algum = true; }
      }
      return algum ? s : null;
    };

    // períodos com dados para a demonstração e a base
    m.periodos = function (ds, base) {
      base = base || 'T';
      var lista = per[ds] || [];
      if (base === 'T') return lista.slice();
      if (ds === 'bp') return lista.filter(function (p) { return base !== 'AN' || tri(p) === 4; });
      var anc = ANCORA[ds];
      return lista.filter(function (p) { return m.agg(ds, anc, p, base) !== null && (base !== 'LTM' || ord(p) - 3 >= ord(lista[0])); });
    };

    // ---------- indicadores ----------
    m.contexto = function (p, base) {
      var c = {
        p: p, base: base,
        t: function (ds, cd) { return m.agg(ds, cd, p, base); },        // fluxo na base escolhida
        u: function (ds, cd) { return m.agg(ds, cd, p, 'LTM'); },       // fluxo nos últimos 12 meses
        b: function (cd, k) { return q('bp', cd, desloca(p, k || 0)); }, // saldo no fim do período (ou k trimestres antes)
        acoes: function (k) { var a = dados.acoes && dados.acoes.valores[desloca(p, k || 0)]; return a && ok(a.total) ? a.total - nz(a.tesouro) : null; }
      };
      c.bm = function (cd) { return media(c.b(cd, 0), c.b(cd, 4)); };    // saldo médio: início e fim dos 12 meses
      c.ebitda = function (f) { f = f || c.t; var ebit = sub(f('dre', '3.05'), nz(f('dre', '3.04.06'))); return ok(ebit) && ok(f('dva', '7.04.01')) ? ebit - f('dva', '7.04.01') : null; };
      c.ebit = function (f) { f = f || c.t; return sub(f('dre', '3.05'), nz(f('dre', '3.04.06'))); };
      c.dbruta = function (k) { var a = c.b('2.01.04', k), b = c.b('2.02.01', k); return soma(a, b); };
      c.caixa = function (k) { var a = c.b('1.01.01', k); return ok(a) ? a + nz(c.b('1.01.02', k)) : null; };
      c.dliq = function (k) { return sub(c.dbruta(k), c.caixa(k)); };
      c.plc = function (k) { var pl = c.b('2.03', k); return ok(pl) ? pl - nz(c.b('2.03.09', k)) : null; };
      c.ncg = function (k) { var r = c.b('1.01.03', k), e = c.b('1.01.04', k), f = c.b('2.01.02', k); return ok(r) && ok(e) && ok(f) ? r + e - f : null; };
      return c;
    };

    var I = [];
    var add = function (grupo, id, nome, un, formula, f, nota) { I.push({ grupo: grupo, id: id, nome: nome, un: un, formula: formula, f: f, nota: nota || '' }); };
    var G = { mar: 'Margens e resultado', ren: 'Rentabilidade', liq: 'Liquidez', end: 'Endividamento e estrutura', efi: 'Capital de giro e ciclo', cx: 'Geração de caixa', acao: 'Por ação' };
    m.grupos = G;
    var NOTA_BASE = 'Usa a base de período escolhida.';
    var NOTA_UDM = 'Sempre calculado com os últimos 12 meses (UDM) até a data.';
    var NOTA_SALDO = 'Posição no fim do período.';

    add(G.mar, 'receita', 'Receita', 'R$ mi', 'Receita de venda de bens e serviços (3.01)', function (c) { return c.t('dre', '3.01'); }, 'Inclui a marcação a mercado do trading de energia (3.01.02).');
    add(G.mar, 'rbruto', 'Resultado bruto', 'R$ mi', '3.03', function (c) { return c.t('dre', '3.03'); });
    add(G.mar, 'ebit', 'EBIT (ex-equivalência)', 'R$ mi', '3.05 − 3.04.06', function (c) { return c.ebit(); }, 'Resultado antes do financeiro e dos tributos, sem o resultado de equivalência patrimonial.');
    add(G.mar, 'da', 'Depreciação e amortização', 'R$ mi', '− DVA 7.04.01', function (c) { var v = c.t('dva', '7.04.01'); return ok(v) ? -v : null; }, 'Linha de retenções da DVA.');
    add(G.mar, 'ebitda', 'EBITDA contábil (CVM)', 'R$ mi', 'EBIT (ex-equivalência) + depreciação e amortização', function (c) { return c.ebitda(); }, 'Calculado a partir das demonstrações da CVM. Não é o EBITDA Ajustado do release, que exclui outros efeitos definidos pela Companhia.');
    add(G.mar, 'rfin', 'Resultado financeiro', 'R$ mi', '3.06', function (c) { return c.t('dre', '3.06'); });
    add(G.mar, 'lucro', 'Lucro líquido consolidado', 'R$ mi', '3.11', function (c) { return c.t('dre', '3.11'); });
    add(G.mar, 'lucroc', 'Lucro atribuído aos controladores', 'R$ mi', '3.11.01', function (c) { return c.t('dre', '3.11.01'); });
    add(G.mar, 'mb', 'Margem bruta', '%', 'Resultado bruto (3.03) ÷ Receita (3.01)', function (c) { return div(c.t('dre', '3.03'), c.t('dre', '3.01')); });
    add(G.mar, 'mebit', 'Margem EBIT', '%', 'EBIT (ex-equivalência) ÷ Receita', function (c) { return div(c.ebit(), c.t('dre', '3.01')); });
    add(G.mar, 'mebitda', 'Margem EBITDA contábil', '%', 'EBITDA contábil ÷ Receita', function (c) { return div(c.ebitda(), c.t('dre', '3.01')); });
    add(G.mar, 'mliq', 'Margem líquida', '%', 'Lucro líquido consolidado (3.11) ÷ Receita (3.01)', function (c) { return div(c.t('dre', '3.11'), c.t('dre', '3.01')); });
    add(G.mar, 'dv', 'Despesas com vendas ÷ receita', '%', '− 3.04.01 ÷ 3.01', function (c) { return div(mul(-1, c.t('dre', '3.04.01')), c.t('dre', '3.01')); });
    add(G.mar, 'dga', 'Despesas gerais e administrativas ÷ receita', '%', '− 3.04.02 ÷ 3.01', function (c) { return div(mul(-1, c.t('dre', '3.04.02')), c.t('dre', '3.01')); });
    add(G.mar, 'aliq', 'Alíquota efetiva de IR/CS', '%', '− 3.08 ÷ 3.07', function (c) { var lair = c.t('dre', '3.07'); return ok(lair) && lair > 0 ? div(mul(-1, c.t('dre', '3.08')), lair) : null; }, 'Só calculada quando o resultado antes dos tributos é positivo.');

    add(G.ren, 'roe', 'ROE (UDM)', '%', 'Lucro dos controladores (3.11.01) UDM ÷ PL dos controladores médio', function (c) { return div(c.u('dre', '3.11.01'), media(c.plc(0), c.plc(4))); }, NOTA_UDM + ' PL médio = média simples do saldo no fim do período e quatro trimestres antes. PL dos controladores = 2.03 − 2.03.09.');
    add(G.ren, 'roa', 'ROA (UDM)', '%', 'Lucro líquido consolidado UDM ÷ Ativo total médio', function (c) { return div(c.u('dre', '3.11'), c.bm('1')); }, NOTA_UDM);
    add(G.ren, 'roic', 'ROIC aproximado (UDM)', '%', 'EBIT (ex-equivalência) UDM × (1 − 34%) ÷ (dívida líquida + PL) médio', function (c) {
      var ebit = c.ebit(c.u), nopat = ok(ebit) ? ebit * (1 - 0.34) : null;
      return div(nopat, media(soma(c.dliq(0), c.b('2.03', 0)), soma(c.dliq(4), c.b('2.03', 4))));
    }, NOTA_UDM + ' Aproximação: alíquota nominal de IRPJ/CSLL de 34% e dívida líquida conforme definida abaixo.');
    add(G.ren, 'giro', 'Giro do ativo (UDM)', 'x', 'Receita UDM ÷ Ativo total médio', function (c) { return div(c.u('dre', '3.01'), c.bm('1')); }, NOTA_UDM);
    add(G.ren, 'alav', 'Alavancagem financeira (ativo ÷ PL)', 'x', 'Ativo total médio ÷ PL consolidado médio', function (c) { return div(c.bm('1'), c.bm('2.03')); }, 'DuPont: ROE ≈ margem líquida × giro × alavancagem (com lucro e PL consolidados).');

    add(G.liq, 'lcor', 'Liquidez corrente', 'x', 'Ativo circulante (1.01) ÷ Passivo circulante (2.01)', function (c) { return div(c.b('1.01'), c.b('2.01')); }, NOTA_SALDO);
    add(G.liq, 'lsec', 'Liquidez seca', 'x', '(Ativo circulante − estoques 1.01.04) ÷ Passivo circulante', function (c) { return div(sub(c.b('1.01'), c.b('1.01.04')), c.b('2.01')); }, NOTA_SALDO);
    add(G.liq, 'limed', 'Liquidez imediata', 'x', '(Caixa 1.01.01 + aplicações 1.01.02) ÷ Passivo circulante', function (c) { return div(c.caixa(0), c.b('2.01')); }, NOTA_SALDO);
    add(G.liq, 'lger', 'Liquidez geral', 'x', '(Ativo circulante + realizável a longo prazo 1.02.01) ÷ (Passivo circulante + não circulante)', function (c) { return div(soma(c.b('1.01'), c.b('1.02.01')), soma(c.b('2.01'), c.b('2.02'))); }, NOTA_SALDO);
    add(G.liq, 'cgl', 'Capital de giro líquido', 'R$ mi', 'Ativo circulante − Passivo circulante', function (c) { return sub(c.b('1.01'), c.b('2.01')); }, NOTA_SALDO);

    add(G.end, 'dbruta', 'Dívida bruta', 'R$ mi', 'Empréstimos e financiamentos 2.01.04 + 2.02.01', function (c) { return c.dbruta(0); }, 'Na CVM essas contas incluem os passivos de arrendamento (financiamento por arrendamento). Não inclui instrumentos derivativos nem o financiamento de fornecimento de produtos (2.01.05.02.08).');
    add(G.end, 'caixa', 'Caixa e aplicações financeiras', 'R$ mi', '1.01.01 + 1.01.02', function (c) { return c.caixa(0); }, 'Não inclui caixa e aplicações restritas (1.01.08.03.05).');
    add(G.end, 'dliq', 'Dívida líquida', 'R$ mi', 'Dívida bruta − caixa e aplicações', function (c) { return c.dliq(0); }, 'Definição contábil a partir da CVM. A dívida líquida do release pode diferir (por exemplo, tratamento de derivativos).');
    add(G.end, 'dlebitda', 'Dívida líquida ÷ EBITDA contábil (UDM)', 'x', 'Dívida líquida ÷ EBITDA contábil UDM', function (c) { var e = c.ebitda(c.u); return ok(e) && e > 0 ? div(c.dliq(0), e) : null; }, NOTA_UDM + ' Só calculado com EBITDA positivo.');
    add(G.end, 'dlpl', 'Dívida líquida ÷ PL', 'x', 'Dívida líquida ÷ PL consolidado (2.03)', function (c) { return div(c.dliq(0), c.b('2.03')); }, NOTA_SALDO);
    add(G.end, 'dbpl', 'Dívida bruta ÷ PL', 'x', 'Dívida bruta ÷ PL consolidado (2.03)', function (c) { return div(c.dbruta(0), c.b('2.03')); }, NOTA_SALDO);
    add(G.end, 'passat', 'Passivo exigível ÷ ativo total', '%', '(2.01 + 2.02) ÷ 1', function (c) { return div(soma(c.b('2.01'), c.b('2.02')), c.b('1')); }, NOTA_SALDO);
    add(G.end, 'plat', 'PL ÷ ativo total', '%', '2.03 ÷ 1', function (c) { return div(c.b('2.03'), c.b('1')); }, NOTA_SALDO);
    add(G.end, 'dcp', 'Dívida de curto prazo ÷ dívida bruta', '%', '2.01.04 ÷ (2.01.04 + 2.02.01)', function (c) { return div(c.b('2.01.04'), c.dbruta(0)); }, NOTA_SALDO);
    add(G.end, 'cobjuros', 'Cobertura de juros (UDM)', 'x', 'EBIT (ex-equivalência) UDM ÷ despesas financeiras 3.06.02.01 UDM', function (c) { var d = c.u('dre', '3.06.02.01'); return ok(d) && d < 0 ? div(c.ebit(c.u), -d) : null; }, NOTA_UDM + ' Despesas financeiras sem variações monetárias e cambiais (3.06.02.02).');

    add(G.efi, 'pmr', 'Prazo médio de recebimento (UDM)', 'dias', 'Contas a receber (1.01.03) ÷ Receita UDM × 365', function (c) { return mul(div(c.b('1.01.03'), c.u('dre', '3.01')), 365); }, NOTA_UDM + ' Saldo no fim do período.');
    add(G.efi, 'pme', 'Prazo médio de estocagem (UDM)', 'dias', 'Estoques (1.01.04) ÷ − Custo UDM (3.02) × 365', function (c) { return mul(div(c.b('1.01.04'), mul(-1, c.u('dre', '3.02'))), 365); }, NOTA_UDM + ' Saldo no fim do período.');
    add(G.efi, 'pmp', 'Prazo médio de pagamento (UDM)', 'dias', 'Fornecedores (2.01.02) ÷ − Custo UDM (3.02) × 365', function (c) { return mul(div(c.b('2.01.02'), mul(-1, c.u('dre', '3.02'))), 365); }, NOTA_UDM + ' Inclui fornecedores nacionais e estrangeiros. Saldo no fim do período.');
    add(G.efi, 'cop', 'Ciclo operacional', 'dias', 'Prazo de recebimento + prazo de estocagem', function (c) { return soma(IND.pmr.f(c), IND.pme.f(c)); }, NOTA_UDM);
    add(G.efi, 'cfin', 'Ciclo de caixa', 'dias', 'Ciclo operacional − prazo de pagamento', function (c) { return sub(IND.cop.f(c), IND.pmp.f(c)); }, NOTA_UDM);
    add(G.efi, 'ncg', 'Necessidade de capital de giro', 'R$ mi', 'Contas a receber + estoques − fornecedores', function (c) { return c.ncg(0); }, NOTA_SALDO);

    add(G.cx, 'fco', 'Fluxo de caixa operacional', 'R$ mi', 'DFC 6.01', function (c) { return c.t('dfc', '6.01'); }, 'Conforme a DFC da CVM; pode diferir da visão gerencial do release.');
    add(G.cx, 'capex', 'Investimentos em imobilizado e intangível', 'R$ mi', 'DFC 6.02.01', function (c) { return c.t('dfc', '6.02.01'); });
    add(G.cx, 'fcl', 'Fluxo de caixa livre', 'R$ mi', 'DFC 6.01 + 6.02.01', function (c) { return soma(c.t('dfc', '6.01'), c.t('dfc', '6.02.01')); }, 'Antes de aquisições de participações, dividendos e financiamentos.');
    add(G.cx, 'convfco', 'Conversão: FCO ÷ EBITDA contábil', '%', 'DFC 6.01 ÷ EBITDA contábil', function (c) { var e = c.ebitda(); return ok(e) && e > 0 ? div(c.t('dfc', '6.01'), e) : null; }, NOTA_BASE + ' Só com EBITDA positivo.');
    add(G.cx, 'capexda', 'Investimentos ÷ depreciação e amortização', 'x', '− DFC 6.02.01 ÷ D&A', function (c) { var da = IND.da.f(c); return ok(da) && da > 0 ? div(mul(-1, c.t('dfc', '6.02.01')), da) : null; }, NOTA_BASE);
    add(G.cx, 'prov', 'Dividendos e JCP pagos', 'R$ mi', '− DFC 6.03.05', function (c) { var v = c.t('dfc', '6.03.05'); return ok(v) ? -v : null; }, 'Valores pagos no período (regime de caixa).');

    add(G.acao, 'acoes', 'Ações em circulação (ex-tesouraria)', 'milhões', 'Total de ações − ações em tesouraria', function (c) { var a = c.acoes(0); return ok(a) ? a / 1e6 : null; }, 'Composição do capital informada nas ITR/DFP (disponível a partir de 2020).');
    add(G.acao, 'lpa', 'Lucro por ação (UDM)', 'R$', 'Lucro dos controladores UDM ÷ média das ações em circulação', function (c) { return div(mul(c.u('dre', '3.11.01'), 1e6), media(c.acoes(0), c.acoes(4))); }, NOTA_UDM + ' Aproximação: não usa a média ponderada do período.');
    add(G.acao, 'vpa', 'Valor patrimonial por ação', 'R$', 'PL dos controladores ÷ ações em circulação', function (c) { return div(mul(c.plc(0), 1e6), c.acoes(0)); }, NOTA_SALDO);

    var IND = {}; I.forEach(function (i) { IND[i.id] = i; });
    m.indicadores = I;
    m.ind = function (id, p, base) {
      var i = IND[id]; if (!i) return null;
      var v = i.f(m.contexto(p, base || 'T'));
      if (!ok(v)) return null;
      return i.un === '%' ? v * 100 : v;       // % em pontos percentuais
    };
    m.periodosInd = function (base) {   // períodos em que faz sentido calcular indicadores
      return m.periodos('dre', base).filter(function (p) { return true; });
    };
    return m;
  }

  return { criar: criar, ord: ord, lab: lab, rotulo: rotulo, desloca: desloca, tri: tri, BASES: BASES, ok: ok };
});
