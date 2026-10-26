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
  var BASES = { T: 'Trimestre', S: 'Semestre', '9M': '9 meses (jan–set)', YTD: 'Acumulado no ano', LTM: 'Últimos 12 meses', AN: 'Ano (exercício)' };
  // seletor "ano → período": tipo de período → (trimestre final, base)
  var TIPOS = { '1T': ['T', 1], '2T': ['T', 2], '3T': ['T', 3], '4T': ['T', 4], '1S': ['S', 2], '2S': ['S', 4], '9M': ['9M', 3], 'AN': ['AN', 4] };
  var TIPOS_NOME = { '1T': '1º tri', '2T': '2º tri', '3T': '3º tri', '4T': '4º tri', '1S': '1º sem', '2S': '2º sem', '9M': '9 meses', 'AN': 'Ano' };
  var par = function (ano, tipo) { var t = TIPOS[tipo]; return t ? { p: t[1] + 'T' + String(ano % 100).padStart(2, '0'), base: t[0], ano: +ano, tipo: tipo } : null; };
  // intervalo livre: base 'R:<trimestre inicial>' soma do trimestre inicial até o período p (inclusive)
  var ehIntervalo = function (base) { return typeof base === 'string' && base.indexOf('R:') === 0; };
  var fechaBase = function (base, p) {   // o período p é um fim válido para a base?
    var q = tri(p);
    if (base === 'AN') return q === 4;
    if (base === 'S') return q === 2 || q === 4;
    if (base === '9M') return q === 3;
    if (ehIntervalo(base)) return ord(p) >= ord(base.slice(2));
    return true;
  };
  var trimestresBase = function (base, p) {   // quantos trimestres a base soma no período p
    if (base === 'T') return 1;
    if (base === 'YTD') return tri(p);
    if (base === 'LTM' || base === 'AN') return 4;
    if (base === 'S') return 2;
    if (base === '9M') return 3;
    if (ehIntervalo(base)) return ord(p) - ord(base.slice(2)) + 1;
    return 0;
  };
  var ANCORA = { dre: '3.01', dfc: '6.01', dva: '7.01', dra: '4.01' };

  function rotulo(p, base) {
    var q = tri(p), a = p.slice(2);
    if (base === 'AN') return '20' + a;
    if (base === 'YTD') return q === 1 ? p : q === 2 ? '6M' + a : q === 3 ? '9M' + a : '12M' + a;
    if (base === 'LTM') return 'UDM ' + p;
    if (base === 'S') return (q === 2 ? '1S' : '2S') + a;
    if (base === '9M') return '9M' + a;
    if (ehIntervalo(base)) { var i0 = base.slice(2); return i0 === p ? p : i0 + '–' + p; }
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
    // cotações da B3: fechamento diário, sem ajuste por proventos (preço como negociado)
    var cot = (dados.b3 && dados.b3.dias || []).map(function (x) { return { d: x[0], p: x[2], t: x[1] }; });
    var FIM = { 1: '-03-31', 2: '-06-30', 3: '-09-30', 4: '-12-31' };
    m.fimPeriodo = function (p) { return (2000 + parseInt(p.slice(2), 10)) + FIM[tri(p)]; };
    m.cotacaoAte = function (data) {      // último fechamento até a data (no máximo 10 dias antes)
      var lo = 0, hi = cot.length - 1, r = -1;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (cot[mid].d <= data) { r = mid; lo = mid + 1; } else hi = mid - 1; }
      if (r < 0) return null;
      var dif = (Date.parse(data) - Date.parse(cot[r].d)) / 864e5;
      return dif <= 10 ? cot[r] : null;
    };
    m.ultimaCotacao = function () { return cot.length ? cot[cot.length - 1] : null; };
    m.linhas = function (ds) { return dados[ds] ? dados[ds].linhas : []; };
    // EBITDA Ajustado (nota de informações por segmento das DFs/ITRs; release só onde a DF não traz o trimestre)
    var AJ = dados.aj || null;
    m.ajFonte = function (seg, p) { var x = AJ && AJ.series[p] && AJ.series[p][seg]; return x || null; };
    m.ajExercicio = function (seg, ano) { var x = AJ && AJ.exercicios && AJ.exercicios[String(ano)]; return x && x[seg] || null; };
    m.aj = function (seg, p, base) {
      base = base || 'T';
      if (!AJ || !fechaBase(base, p)) return null;
      var k = trimestresBase(base, p), n = ord(p), s = 0;
      for (var i = n - k + 1; i <= n; i++) {
        var x = AJ.series[lab(i)] && AJ.series[lab(i)][seg];
        if (!x || !ok(x.v)) {
          // exercício completo sem os trimestres (2016, antes do IPO): total anual divulgado no release
          var ex = k === 4 && tri(p) === 4 && AJ.exercicios && AJ.exercicios[String(2000 + parseInt(p.slice(2), 10))];
          return ex && ex[seg] && ok(ex[seg].v) ? ex[seg].v : null;
        }
        s += x.v;
      }
      return s;
    };
    m.ajPeriodos = function () { return AJ ? AJ.periodos.slice() : []; };
    // seletor ano → período
    m.par = par;
    m.disponivel = function (ano, tipo) { var x = par(ano, tipo); return !!x && m.agg('dre', '3.01', x.p, x.base) !== null; };
    m.anos = function () { var s = {}; (per.dre || []).forEach(function (p) { s[2000 + +p.slice(2)] = 1; }); ((dados.dre && dados.dre.anuais) || []).forEach(function (a) { s[+a] = 1; }); return Object.keys(s).map(Number).sort(); };
    m.ultimoPar = function () { var l = per.dre || [], p = l[l.length - 1]; return par(2000 + +p.slice(2), p[0] + 'T'); };
    // histórico do mesmo tipo de período terminando em x: trimestres consecutivos para trimestre; anos anteriores para os demais
    m.historico = function (x, n) {
      var out = [];
      if (x.base === 'T') { for (var i = n - 1; i >= 0; i--) { var p = desloca(x.p, i); if (m.agg('dre', '3.01', p, 'T') !== null) out.push(p); } }
      else { for (var j = n - 1; j >= 0; j--) { var q = desloca(x.p, 4 * j); if (m.agg('dre', '3.01', q, x.base) !== null) out.push(q); } }
      return out;
    };
    m.linha = function (ds, cd) { return idx[ds][cd] || null; };
    m.todosPeriodos = function () {
      var s = {}; Object.keys(per).forEach(function (ds) { per[ds].forEach(function (p) { s[p] = 1; }); });
      return Object.keys(s).sort(function (a, b) { return ord(a) - ord(b); });
    };
    m.rotulo = rotulo; m.ord = ord; m.desloca = desloca; m.tri = tri;

    var q = function (ds, cd, p) { var l = idx[ds][cd]; if (!l) return null; var v = l[p]; return ok(v) ? v : null; };
    // anos só anuais da demonstração ds (ex.: ['2015']); undefined quando p não é o fim de um desses anos
    var anual = function (ds, cd, p) {
      var t = dados[ds], a = String(2000 + parseInt(p.slice(2), 10));
      if (!t || !t.anuais || tri(p) !== 4 || t.anuais.indexOf(a) < 0 || per[ds].indexOf(p) >= 0) return undefined;
      var l = idx[ds][cd], v = l && l['AN' + a]; return ok(v) ? v : null;
    };
    m.trim = q;

    // valor agregado de uma conta no período p, na base escolhida
    m.agg = function (ds, cd, p, base) {
      base = base || 'T';
      if (!fechaBase(base, p)) return null;
      if (ds === 'bp') return q(ds, cd, p);
      // exercício só anual (2015: comparativo do DFP de 2016), sem trimestres: vale só para o ano inteiro
      var an = anual(ds, cd, p);
      if (an !== undefined) return (base === 'AN' || base === 'LTM') ? an : null;
      if (ds === 'dfc' && cd === '6.05.02') return q(ds, cd, p);
      if (base === 'T') return q(ds, cd, p);
      var n = ord(p), k = trimestresBase(base, p);
      if (!k) return null;
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
      if ((base === 'AN' || base === 'LTM') && dados[ds] && dados[ds].anuais)   // anos só anuais entram na visão anual
        lista = dados[ds].anuais.map(function (a) { return '4T' + a.slice(2); }).filter(function (p) { return lista.indexOf(p) < 0; }).concat(lista);
      if (ds === 'bp') return lista.filter(function (p) { return fechaBase(base, p); });
      var anc = ANCORA[ds];
      var prim = (per[ds] || [])[0];
      return lista.filter(function (p) { return m.agg(ds, anc, p, base) !== null && (base !== 'LTM' || anual(ds, anc, p) !== undefined || ord(p) - 3 >= ord(prim)); });
    };

    // ---------- indicadores ----------
    m.contexto = function (p, base, precoFixo) {
      var c = {
        p: p, base: base,
        t: function (ds, cd) { return m.agg(ds, cd, p, base); },        // fluxo na base escolhida
        u: function (ds, cd) { return m.agg(ds, cd, p, 'LTM'); },       // fluxo nos últimos 12 meses
        b: function (cd, k) { return q('bp', cd, desloca(p, k || 0)); }, // saldo no fim do período (ou k trimestres antes)
        acoes: function (k) { var a = dados.acoes && dados.acoes.valores[desloca(p, k || 0)]; return a && ok(a.total) ? a.total - nz(a.tesouro) : null; }
      };
      c.preco = function () { if (ok(precoFixo)) return precoFixo; var q0 = m.cotacaoAte(m.fimPeriodo(p)); return q0 ? q0.p : null; };
      c.mcap = function () { var a = c.acoes(0), pr = c.preco(); return ok(a) && ok(pr) ? pr * a / 1e6 : null; };   // R$ mi
      c.ev = function () { var mc = c.mcap(), dl = c.dliq(0); return ok(mc) && ok(dl) ? mc + dl + nz(c.b('2.03.09', 0)) : null; };
      c.bm = function (cd) { return media(c.b(cd, 0), c.b(cd, 4)); };    // saldo médio: início e fim dos 12 meses
      c.aj = function (udm) { return m.aj('CONS', p, udm ? 'LTM' : base); };   // EBITDA Ajustado (nota de segmentos)
      c.ebitda = function (f) { f = f || c.t; var ebit = sub(f('dre', '3.05'), nz(f('dre', '3.04.06'))); return ok(ebit) && ok(f('dva', '7.04.01')) ? ebit - f('dva', '7.04.01') : null; };
      c.ebit = function (f) { f = f || c.t; return sub(f('dre', '3.05'), nz(f('dre', '3.04.06'))); };
      c.dbruta = function (k) { var a = c.b('2.01.04', k), b = c.b('2.02.01', k); return soma(a, b); };
      c.caixa = function (k) { var a = c.b('1.01.01', k); return ok(a) ? a + nz(c.b('1.01.02', k)) : null; };
      c.dliqc = function (k) { return sub(c.dbruta(k), c.caixa(k)); };   // pelo balanço (CVM)
      c.dliq = function (k) {   // como a Companhia divulga no release; na falta, pelo balanço
        var r = dados.dlrel && dados.dlrel.series && dados.dlrel.series[desloca(p, k || 0)];
        if (r && ok(r.v)) return r.v;
        // antes do primeiro número divulgado (2015) não mistura definições: sem release, sem dívida líquida "divulgada"
        var l0 = dados.dlrel && dados.dlrel.periodos && dados.dlrel.periodos[0];
        return l0 && ord(desloca(p, k || 0)) < ord(l0) ? null : c.dliqc(k);
      };
      c.plc = function (k) { var pl = c.b('2.03', k); return ok(pl) ? pl - nz(c.b('2.03.09', k)) : null; };
      c.ncg = function (k) { var r = c.b('1.01.03', k), e = c.b('1.01.04', k), f = c.b('2.01.02', k); return ok(r) && ok(e) && ok(f) ? r + e - f : null; };
      return c;
    };

    var I = [];
    // para que serve cada indicador (frase curta exibida antes da fórmula)
    var USOS = {
      "receita": "Tamanho do negócio: quanto a Companhia vendeu no período, líquido de impostos sobre vendas e devoluções.",
      "rbruto": "Quanto sobra das vendas depois do custo dos produtos; é a base de todas as margens.",
      "ebit": "Lucro gerado pelas operações, antes de juros e impostos; mostra a rentabilidade do negócio independentemente de como ele é financiado.",
      "da": "Consumo contábil dos ativos, sem saída de caixa; ajuda a separar o resultado operacional da geração de caixa.",
      "ebitda": "Medida da Companhia para a geração operacional recorrente; é a base da alavancagem (dívida líquida ÷ EBITDA) e dos múltiplos de valuation.",
      "ebitdac": "EBITDA pelas demonstrações, sem os ajustes da Companhia; serve para ver o tamanho desses ajustes.",
      "rfin": "Custo líquido da dívida, descontados os rendimentos das aplicações; mostra o peso do financiamento no resultado.",
      "lucro": "Resultado final do período, de todos os acionistas (controladores e não controladores).",
      "lucroc": "Parte do lucro que pertence aos acionistas da Vibra; é a base de dividendos, lucro por ação e ROE.",
      "mb": "Quanto de cada real vendido sobra depois do custo dos produtos; na distribuição de combustíveis é baixa e sensível a preços e estoques.",
      "mebit": "Eficiência operacional: quanto de cada real vendido vira resultado operacional.",
      "mebitda": "Geração operacional por real vendido; permite comparar períodos e empresas do setor.",
      "mliq": "Quanto de cada real vendido vira lucro.",
      "dv": "Peso das despesas comerciais e de distribuição sobre as vendas; mostra a eficiência da operação.",
      "dga": "Peso da estrutura administrativa sobre as vendas; mostra a disciplina de custos.",
      "aliq": "Quanto do lucro antes dos tributos vai para IR e CS; desvios em relação aos 34% indicam efeitos como JCP, incentivos e créditos fiscais.",
      "roe": "Retorno para os acionistas: quanto o lucro remunera o patrimônio que eles investiram.",
      "mliqudm": "Margem líquida dos últimos 12 meses, sem a sazonalidade trimestral; é o primeiro fator do ROE na decomposição DuPont.",
      "roecons": "ROE com lucro e patrimônio totais (inclui não controladores); fecha a decomposição DuPont.",
      "roa": "Quanto o lucro remunera o total de ativos; mede a eficiência no uso dos recursos.",
      "roic": "Retorno sobre todo o capital investido (acionistas e credores); comparado ao custo de capital, indica se a empresa cria valor.",
      "giro": "Quantas vezes os ativos se convertem em vendas em 12 meses; é o segundo fator do ROE na decomposição DuPont.",
      "alav": "Quanto do ativo é financiado por terceiros para cada real de patrimônio; é o terceiro fator do ROE na decomposição DuPont.",
      "lcor": "Capacidade de pagar as obrigações de curto prazo com os ativos de curto prazo.",
      "lsec": "Capacidade de pagar as obrigações de curto prazo sem depender da venda de estoques.",
      "limed": "Quanto das obrigações de curto prazo o caixa disponível pagaria imediatamente.",
      "lger": "Capacidade de pagar todas as obrigações com os ativos realizáveis, de curto e longo prazo.",
      "cgl": "Folga (ou falta) de recursos de curto prazo depois de cobrir as obrigações de curto prazo.",
      "dbruta": "Total devido a bancos e investidores (empréstimos, financiamentos e arrendamentos).",
      "caixa": "Recursos disponíveis para pagar dívidas, investir e remunerar acionistas.",
      "dliq": "Endividamento efetivo (dívida menos caixa), como a Companhia divulga; é a base da alavancagem.",
      "dliqc": "Dívida líquida calculada pelo balanço, sem os ajustes da Companhia; serve para conferência.",
      "dlebitda": "Principal medida de alavancagem: quantos anos de EBITDA quitariam a dívida líquida; usada por bancos, agências de rating e em covenants.",
      "dlpl": "Tamanho da dívida líquida em relação ao capital dos acionistas.",
      "dbpl": "Tamanho da dívida bruta em relação ao capital dos acionistas.",
      "passat": "Parcela do ativo financiada por terceiros (todas as obrigações, não só dívida).",
      "plat": "Parcela do ativo financiada pelos acionistas.",
      "dcp": "Quanto da dívida vence em até 12 meses; indica a pressão de refinanciamento.",
      "cobjuros": "Quantas vezes o resultado operacional cobre os juros; mostra a folga para pagar o custo da dívida.",
      "pmr": "Em quantos dias, em média, a Companhia recebe dos clientes.",
      "pme": "Por quantos dias, em média, os produtos ficam em estoque.",
      "pmp": "Em quantos dias, em média, a Companhia paga os fornecedores.",
      "cop": "Dias entre a compra do produto e o recebimento da venda.",
      "cfin": "Dias em que a operação é financiada com recursos da própria Companhia (ciclo operacional menos o prazo de pagamento).",
      "ncg": "Recursos presos na operação (recebíveis + estoques − fornecedores); quando aumenta consome caixa, quando diminui libera.",
      "fco": "Caixa gerado pelas operações no período, já considerando o capital de giro.",
      "capex": "Quanto foi investido em ativos (postos, bases, logística, tecnologia, renováveis).",
      "fcl": "Caixa que sobra depois dos investimentos; é o que fica disponível para pagar dívida e remunerar acionistas.",
      "convfco": "Quanto do EBITDA virou caixa de fato; mostra a qualidade do resultado.",
      "capexda": "Se os investimentos apenas repõem (perto de 1x) ou ampliam (acima de 1x) a base de ativos.",
      "prov": "Caixa efetivamente pago aos acionistas no período.",
      "acoes": "Número de ações entre as quais se dividem o lucro e o patrimônio; base dos indicadores por ação.",
      "lpa": "Parte do lucro que cabe a cada ação.",
      "vpa": "Parte do patrimônio contábil que cabe a cada ação; comparado à cotação, dá o P/VP.",
      "preco": "Valor da ação negociada na B3 no fim do período.",
      "mcap": "Quanto o mercado avalia o patrimônio da Companhia.",
      "ev": "Valor de toda a empresa para acionistas e credores; é comparado ao EBITDA no múltiplo EV/EBITDA.",
      "pl": "Quantos anos de lucro o mercado paga pela ação.",
      "pvp": "Quanto o mercado paga por real de patrimônio contábil.",
      "evebitda": "Múltiplo de valuation mais usado no setor: quantos anos de EBITDA o valor da empresa representa.",
      "fcfy": "Caixa livre gerado em relação ao valor de mercado; quanto maior, mais caixa por real aplicado na ação.",
      "dy": "Retorno em proventos efetivamente pagos para quem tem a ação."
      };
    var add = function (grupo, id, nome, un, formula, f, nota) {
      var i = { grupo: grupo, id: id, nome: nome, un: un, formula: formula, f: f, nota: nota || '', uso: USOS[id] || '' };
      i.explica = (i.uso ? 'Para que serve: ' + i.uso + ' ' : '') + 'Como se calcula: ' + formula + '.' + (i.nota ? ' ' + i.nota : '');
      I.push(i);
    };
    var G = { mar: 'Margens e resultado', ren: 'Rentabilidade', liq: 'Liquidez', end: 'Endividamento e estrutura', efi: 'Capital de giro e ciclo', cx: 'Geração de caixa', acao: 'Por ação', mer: 'Mercado e valuation' };
    m.grupos = G;
    var NOTA_BASE = 'Usa a base de período escolhida.';
    var NOTA_UDM = 'Sempre calculado com os últimos 12 meses (UDM) até a data.';
    var NOTA_SALDO = 'Posição no fim do período.';

    add(G.mar, 'receita', 'Receita', 'R$ mi', 'Receita de venda de bens e serviços (3.01)', function (c) { return c.t('dre', '3.01'); }, 'Inclui a marcação a mercado do trading de energia (3.01.02).');
    add(G.mar, 'rbruto', 'Resultado bruto', 'R$ mi', '3.03', function (c) { return c.t('dre', '3.03'); });
    add(G.mar, 'ebit', 'EBIT (ex-equivalência)', 'R$ mi', '3.05 − 3.04.06', function (c) { return c.ebit(); }, 'Resultado antes do financeiro e dos tributos, sem o resultado de equivalência patrimonial.');
    add(G.mar, 'da', 'Depreciação e amortização', 'R$ mi', '− DVA 7.04.01', function (c) { var v = c.t('dva', '7.04.01'); return ok(v) ? -v : null; }, 'Linha de retenções da DVA.');
    add(G.mar, 'ebitda', 'EBITDA Ajustado', 'R$ mi', 'Nota de informações por segmento das ITRs/DFPs (release até 2021)', function (c) { return c.aj(); }, 'Medida não contábil definida pela Companhia, apresentada na nota de informações por segmento das demonstrações financeiras desde 2023 (com comparativos de 2022); de 4T17 a 4T21, conforme o release de resultados; antes do IPO, os trimestres de 4T16 a 3T17 vêm dos comparativos dos releases de 2018 e o exercício de 2016, do total anual divulgado no release do 4T17.');
    add(G.mar, 'ebitdac', 'EBITDA contábil (referência)', 'R$ mi', 'EBIT (ex-equivalência) + depreciação e amortização (DVA 7.04.01)', function (c) { return c.ebitda(); }, 'Calculado a partir das demonstrações; serve de referência para a ponte com o EBITDA Ajustado.');
    add(G.mar, 'rfin', 'Resultado financeiro', 'R$ mi', '3.06', function (c) { return c.t('dre', '3.06'); });
    add(G.mar, 'lucro', 'Lucro líquido consolidado', 'R$ mi', '3.11', function (c) { return c.t('dre', '3.11'); });
    add(G.mar, 'lucroc', 'Lucro atribuído aos controladores', 'R$ mi', '3.11.01', function (c) { return c.t('dre', '3.11.01'); });
    add(G.mar, 'mb', 'Margem bruta', '%', 'Resultado bruto (3.03) ÷ Receita (3.01)', function (c) { return div(c.t('dre', '3.03'), c.t('dre', '3.01')); });
    add(G.mar, 'mebit', 'Margem EBIT', '%', 'EBIT (ex-equivalência) ÷ Receita', function (c) { return div(c.ebit(), c.t('dre', '3.01')); });
    add(G.mar, 'mebitda', 'Margem EBITDA Ajustado', '%', 'EBITDA Ajustado ÷ Receita (3.01)', function (c) { return div(c.aj(), c.t('dre', '3.01')); });
    add(G.mar, 'mliq', 'Margem líquida', '%', 'Lucro líquido consolidado (3.11) ÷ Receita (3.01)', function (c) { return div(c.t('dre', '3.11'), c.t('dre', '3.01')); });
    add(G.mar, 'dv', 'Despesas com vendas ÷ receita', '%', '− 3.04.01 ÷ 3.01', function (c) { return div(mul(-1, c.t('dre', '3.04.01')), c.t('dre', '3.01')); });
    add(G.mar, 'dga', 'Despesas gerais e administrativas ÷ receita', '%', '− 3.04.02 ÷ 3.01', function (c) { return div(mul(-1, c.t('dre', '3.04.02')), c.t('dre', '3.01')); });
    add(G.mar, 'aliq', 'Alíquota efetiva de IR/CS', '%', '− 3.08 ÷ 3.07', function (c) { var lair = c.t('dre', '3.07'); return ok(lair) && lair > 0 ? div(mul(-1, c.t('dre', '3.08')), lair) : null; }, 'Só calculada quando o resultado antes dos tributos é positivo.');

    add(G.ren, 'roe', 'ROE (UDM)', '%', 'Lucro dos controladores (3.11.01) UDM ÷ PL dos controladores médio', function (c) { return div(c.u('dre', '3.11.01'), media(c.plc(0), c.plc(4))); }, NOTA_UDM + ' PL médio = média simples do saldo no fim do período e quatro trimestres antes. PL dos controladores = 2.03 − 2.03.09.');
    add(G.ren, 'mliqudm', 'Margem líquida (UDM)', '%', 'Lucro líquido consolidado UDM ÷ Receita UDM', function (c) { return div(c.u('dre', '3.11'), c.u('dre', '3.01')); }, NOTA_UDM + ' Primeiro fator do DuPont.');
    add(G.ren, 'roecons', 'ROE consolidado (UDM)', '%', 'Lucro líquido consolidado UDM ÷ PL consolidado médio', function (c) { return div(c.u('dre', '3.11'), c.bm('2.03')); }, NOTA_UDM + ' Igual a margem líquida × giro × alavancagem. Difere do ROE dos controladores por incluir os não controladores.');
    add(G.ren, 'roa', 'ROA (UDM)', '%', 'Lucro líquido consolidado UDM ÷ Ativo total médio', function (c) { return div(c.u('dre', '3.11'), c.bm('1')); }, NOTA_UDM);
    add(G.ren, 'roic', 'ROIC aproximado (UDM)', '%', 'EBIT (ex-equivalência) UDM × (1 − 34%) ÷ (dívida líquida + PL) médio', function (c) {
      var ebit = c.ebit(c.u), nopat = ok(ebit) ? ebit * (1 - 0.34) : null;
      return div(nopat, media(soma(c.dliqc(0), c.b('2.03', 0)), soma(c.dliqc(4), c.b('2.03', 4))));
    }, NOTA_UDM + ' Aproximação: alíquota nominal de IRPJ/CSLL de 34% e dívida líquida contábil (balanço).');
    add(G.ren, 'giro', 'Giro do ativo (UDM)', 'x', 'Receita UDM ÷ Ativo total médio', function (c) { return div(c.u('dre', '3.01'), c.bm('1')); }, NOTA_UDM);
    add(G.ren, 'alav', 'Alavancagem financeira (ativo ÷ PL)', 'x', 'Ativo total médio ÷ PL consolidado médio', function (c) { return div(c.bm('1'), c.bm('2.03')); }, 'DuPont: ROE ≈ margem líquida × giro × alavancagem (com lucro e PL consolidados).');

    add(G.liq, 'lcor', 'Liquidez corrente', 'x', 'Ativo circulante (1.01) ÷ Passivo circulante (2.01)', function (c) { return div(c.b('1.01'), c.b('2.01')); }, NOTA_SALDO);
    add(G.liq, 'lsec', 'Liquidez seca', 'x', '(Ativo circulante − estoques 1.01.04) ÷ Passivo circulante', function (c) { return div(sub(c.b('1.01'), c.b('1.01.04')), c.b('2.01')); }, NOTA_SALDO);
    add(G.liq, 'limed', 'Liquidez imediata', 'x', '(Caixa 1.01.01 + aplicações 1.01.02) ÷ Passivo circulante', function (c) { return div(c.caixa(0), c.b('2.01')); }, NOTA_SALDO);
    add(G.liq, 'lger', 'Liquidez geral', 'x', '(Ativo circulante + realizável a longo prazo 1.02.01) ÷ (Passivo circulante + não circulante)', function (c) { return div(soma(c.b('1.01'), c.b('1.02.01')), soma(c.b('2.01'), c.b('2.02'))); }, NOTA_SALDO);
    add(G.liq, 'cgl', 'Capital de giro líquido', 'R$ mi', 'Ativo circulante − Passivo circulante', function (c) { return sub(c.b('1.01'), c.b('2.01')); }, NOTA_SALDO);

    add(G.end, 'dbruta', 'Dívida bruta', 'R$ mi', 'Empréstimos e financiamentos 2.01.04 + 2.02.01', function (c) { return c.dbruta(0); }, 'Na CVM essas contas incluem os passivos de arrendamento (financiamento por arrendamento). Não inclui instrumentos derivativos nem o financiamento de fornecimento de produtos (2.01.05.02.08).');
    add(G.end, 'caixa', 'Caixa e aplicações financeiras', 'R$ mi', '1.01.01 + 1.01.02', function (c) { return c.caixa(0); }, 'Não inclui caixa e aplicações restritas (1.01.08.03.05).');
    add(G.end, 'dliq', 'Dívida líquida', 'R$ mi', 'Como divulgada pela Companhia no release: dívida bruta + swap − disponibilidades', function (c) { return c.dliq(0); }, 'Valor da linha "Dívida Líquida" do release de resultados do trimestre (disponibilidades incluem caixa restrito e títulos). Trimestres sem release: dívida bruta − caixa e aplicações do balanço.');
    add(G.end, 'dliqc', 'Dívida líquida contábil', 'R$ mi', 'Dívida bruta − caixa e aplicações (balanço)', function (c) { return c.dliqc(0); }, 'Definição a partir das demonstrações (CVM): empréstimos, financiamentos e arrendamentos menos caixa e aplicações financeiras. Não considera swaps nem caixa restrito.');
    add(G.end, 'dlebitda', 'Dívida líquida ÷ EBITDA Ajustado (UDM)', 'x', 'Dívida líquida divulgada ÷ EBITDA Ajustado dos últimos 12 meses', function (c) { var e = c.aj(true); return ok(e) && e > 0 ? div(c.dliq(0), e) : null; }, NOTA_UDM + ' Dívida líquida do release; EBITDA Ajustado da nota de segmentos (soma dos 4 trimestres). A Companhia divulga a alavancagem com uma casa decimal.');
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
    add(G.cx, 'convfco', 'Conversão de caixa: FCO ÷ EBITDA Ajustado', '%', 'DFC 6.01 ÷ EBITDA Ajustado', function (c) { var e = c.aj(); return ok(e) && e > 0 ? div(c.t('dfc', '6.01'), e) : null; }, NOTA_BASE + ' Só com EBITDA positivo.');
    add(G.cx, 'capexda', 'Investimentos ÷ depreciação e amortização', 'x', '− DFC 6.02.01 ÷ D&A', function (c) { var da = IND.da.f(c); return ok(da) && da > 0 ? div(mul(-1, c.t('dfc', '6.02.01')), da) : null; }, NOTA_BASE);
    add(G.cx, 'prov', 'Dividendos e JCP pagos', 'R$ mi', '− DFC 6.03.05', function (c) { var v = c.t('dfc', '6.03.05'); return ok(v) ? -v : null; }, 'Valores pagos no período (regime de caixa).');

    add(G.acao, 'acoes', 'Ações em circulação (ex-tesouraria)', 'milhões', 'Total de ações − ações em tesouraria', function (c) { var a = c.acoes(0); return ok(a) ? a / 1e6 : null; }, 'Composição do capital informada nas ITR/DFP a partir de 2020; de 4T17 a 4T19, quantidade de ações do Formulário de Referência (capital sem alteração no período e sem ações em tesouraria no balanço).');
    add(G.acao, 'lpa', 'Lucro por ação (UDM)', 'R$', 'Lucro dos controladores UDM ÷ média das ações em circulação', function (c) { return div(mul(c.u('dre', '3.11.01'), 1e6), media(c.acoes(0), c.acoes(4))); }, NOTA_UDM + ' Aproximação: não usa a média ponderada do período.');
    add(G.acao, 'vpa', 'Valor patrimonial por ação', 'R$', 'PL dos controladores ÷ ações em circulação', function (c) { return div(mul(c.plc(0), 1e6), c.acoes(0)); }, NOTA_SALDO);

    // valuation: preço de fechamento da B3 no fim do período × ações em circulação (CVM) na mesma data
    add(G.mer, 'preco', 'Cotação no fim do período (VBBR3)', 'R$', 'Último fechamento da B3 até a data-base do período', function (c) { return c.preco(); }, 'Preço como negociado, sem ajuste por proventos. Até 21/10/2021 o código negociado era BRDT3 (Petrobras Distribuidora); a partir de 22/10/2021, VBBR3 (Vibra Energia).');
    add(G.mer, 'mcap', 'Valor de mercado', 'R$ mi', 'Cotação × ações em circulação (ex-tesouraria)', function (c) { return c.mcap(); }, 'Ações: composição do capital nas ITR/DFP a partir de 2020; de 4T17 a 4T19, Formulário de Referência.');
    add(G.mer, 'ev', 'Valor da firma (EV)', 'R$ mi', 'Valor de mercado + dívida líquida + participação de não controladores (2.03.09)', function (c) { return c.ev(); }, 'Dívida líquida conforme definida neste painel (inclui arrendamentos).');
    add(G.mer, 'pl', 'P/L (UDM)', 'x', 'Valor de mercado ÷ lucro dos controladores UDM', function (c) { var l = c.u('dre', '3.11.01'); return ok(l) && l > 0 ? div(c.mcap(), l) : null; }, NOTA_UDM + ' Só calculado com lucro positivo.');
    add(G.mer, 'pvp', 'P/VP', 'x', 'Valor de mercado ÷ PL dos controladores', function (c) { var pl = c.plc(0); return ok(pl) && pl > 0 ? div(c.mcap(), pl) : null; }, NOTA_SALDO);
    add(G.mer, 'evebitda', 'EV/EBITDA Ajustado (UDM)', 'x', 'Valor da firma ÷ EBITDA Ajustado dos últimos 12 meses', function (c) { var e = c.aj(true); return ok(e) && e > 0 ? div(c.ev(), e) : null; }, NOTA_UDM);
    add(G.mer, 'fcfy', 'Rendimento de fluxo de caixa livre (UDM)', '%', 'Fluxo de caixa livre UDM ÷ valor de mercado', function (c) { return div(soma(c.u('dfc', '6.01'), c.u('dfc', '6.02.01')), c.mcap()); }, NOTA_UDM + ' FCL = FCO + investimentos em imobilizado e intangível.');
    add(G.mer, 'dy', 'Proventos pagos ÷ valor de mercado (UDM)', '%', '− Dividendos e JCP pagos (DFC 6.03.05) UDM ÷ valor de mercado', function (c) { return div(mul(-1, c.u('dfc', '6.03.05')), c.mcap()); }, NOTA_UDM + ' Caixa efetivamente pago em 12 meses, não o dividend yield do declarado; difere da página de dividendos.');

    var IND = {}; I.forEach(function (i) { IND[i.id] = i; });
    m.indicadores = I;
    m.ind = function (id, p, base, precoFixo) {
      var i = IND[id]; if (!i) return null;
      var v = i.f(m.contexto(p, base || 'T', precoFixo));
      if (!ok(v)) return null;
      return i.un === '%' ? v * 100 : v;       // % em pontos percentuais
    };
    m.indAtual = function (id) {      // indicador com a cotação mais recente e as demonstrações do último trimestre
      var q0 = m.ultimaCotacao(), lista = per.dre, i = IND[id]; if (!q0 || !i) return null;
      var v = i.f(m.contexto(lista[lista.length - 1], 'T', q0.p));
      return ok(v) ? (i.un === '%' ? v * 100 : v) : null;
    };
    // ---------- estruturas dos gráficos-síntese e das pontes ----------
    // Cada estrutura devolve { inicio, passos, fim } (ou blocos) e "fecha": os passos somam exatamente a diferença entre
    // os totais da CVM; os grupos que não têm conta própria são calculados por diferença e por isso ficam explícitos.
    var E = m.estrutura = {};
    var nz0 = function (v) { return ok(v) ? v : 0; };
    var fecha = function (ini, passos, fim) { var acc = ini; passos.forEach(function (x) { if (!x.sub) acc += x.v; }); return Math.abs(acc - fim) <= 1.5; };
    var limpa = function (passos) { return passos.filter(function (x) { return x.sub || Math.abs(x.v) >= 0.5; }); };
    E.balanco = function (p) {
      var b = function (cd) { return nz0(q('bp', cd, p)); };
      if (!ok(q('bp', '1', p)) || !ok(q('bp', '2', p))) return null;
      var caixa = b('1.01.01') + b('1.01.02'), rec = b('1.01.03'), est = b('1.01.04'), imob = b('1.02.03'), intg = b('1.02.04');
      var forn = b('2.01.02'), dcp = b('2.01.04'), dlp = b('2.02.01');
      var ativo = [{ rot: 'Caixa e aplicações', v: caixa }, { rot: 'Contas a receber', v: rec }, { rot: 'Estoques', v: est }, { rot: 'Outros ativos circulantes', v: b('1.01') - caixa - rec - est },
        { rot: 'Realizável a longo prazo e investimentos', v: b('1.02') - imob - intg }, { rot: 'Imobilizado e direito de uso', v: imob }, { rot: 'Intangível', v: intg }];
      var passivo = [{ rot: 'Fornecedores', v: forn }, { rot: 'Dívida de curto prazo', v: dcp }, { rot: 'Outros passivos circulantes', v: b('2.01') - forn - dcp },
        { rot: 'Dívida de longo prazo', v: dlp }, { rot: 'Outros passivos não circulantes', v: b('2.02') - dlp }, { rot: 'Patrimônio líquido', v: b('2.03') }];
      var sa = ativo.reduce(function (a, x) { return a + x.v; }, 0), sp = passivo.reduce(function (a, x) { return a + x.v; }, 0);
      return { ativo: ativo, passivo: passivo, totAtivo: b('1'), totPassivo: b('2'), fecha: Math.abs(sa - b('1')) <= 1.5 && Math.abs(sp - b('2')) <= 1.5 && Math.abs(b('1') - b('2')) <= 1.5 };
    };
    E.resultado = function (p, base) {
      var v = function (cd) { return m.agg('dre', cd, p, base); }, z = function (cd) { return nz0(v(cd)); };
      if (!ok(v('3.03')) || !ok(v('3.11'))) return null;
      var vend = z('3.04.01'), ga = z('3.04.02'), eq = z('3.04.06');
      var passos = limpa([{ rot: 'Despesas com vendas', v: vend }, { rot: 'Despesas gerais e administrativas', v: ga }, { rot: 'Outras receitas e despesas operacionais', v: z('3.04') - vend - ga - eq },
        { rot: 'Equivalência patrimonial', v: eq }, { rot: 'Resultado operacional (EBIT)', v: z('3.05'), sub: true }, { rot: 'Resultado financeiro', v: z('3.06') }, { rot: 'IR e CS', v: z('3.08') },
        { rot: 'Operações descontinuadas', v: z('3.10') }]);
      return { inicio: { rot: 'Lucro bruto', v: v('3.03') }, passos: passos, fim: { rot: 'Lucro líquido', v: v('3.11') }, receita: v('3.01'), custo: v('3.02'),
        fecha: fecha(v('3.03'), passos, v('3.11')) && Math.abs(z('3.03') + z('3.04') - z('3.05')) <= 1.5 };
    };
    E.caixa = function (p, base) {
      var f = function (cd) { return m.agg('dfc', cd, p, base); }, z = function (cd) { return nz0(f(cd)); };
      var ini = f('6.05.01'), fim = f('6.05.02'); if (!ok(ini) || !ok(fim) || !ok(f('6.01'))) return null;
      var ger = f('6.01.01'), giro = f('6.01.02'), capex = z('6.02.01'), divida = z('6.03.02') + z('6.03.03') + z('6.03.10'), juros = z('6.03.04') + z('6.03.11'), div = z('6.03.05') + z('6.03.06');
      var op = ok(ger) && ok(giro) ? [{ rot: 'Caixa gerado nas operações', v: ger }, { rot: 'Capital de giro (ativos e passivos operacionais)', v: giro }, { rot: 'Outros operacionais', v: z('6.01') - ger - giro }] : [{ rot: 'Atividades operacionais', v: z('6.01') }];
      var passos = limpa(op.concat([{ rot: 'Investimentos em imobilizado e intangível', v: capex }, { rot: 'Outros investimentos', v: z('6.02') - capex },
        { rot: 'Captações e amortizações de dívida e arrendamentos', v: divida }, { rot: 'Juros pagos', v: juros }, { rot: 'Dividendos e JCP pagos', v: div },
        { rot: 'Outros de financiamento', v: z('6.03') - divida - juros - div }, { rot: 'Variação cambial do caixa', v: z('6.04') }]));
      return { inicio: { rot: 'Caixa no início', v: ini }, passos: passos, fim: { rot: 'Caixa no fim', v: fim }, fecha: fecha(ini, passos, fim) };
    };
    E.dva = function (p, base) {
      var f = function (cd) { return m.agg('dva', cd, p, base); }, z = function (cd) { return nz0(f(cd)); };
      var tot = f('7.07'); if (!ok(tot) || !ok(f('7.08'))) return null;
      var acion = z('7.08.04.01') + z('7.08.04.02');
      var itens = [{ rot: 'Pessoal', v: z('7.08.01') }, { rot: 'Impostos, taxas e contribuições', v: z('7.08.02') }, { rot: 'Financiadores (juros e aluguéis)', v: z('7.08.03') },
        { rot: 'Acionistas (JCP e dividendos)', v: acion }, { rot: 'Lucros retidos', v: z('7.08.04') - acion }, { rot: 'Outros', v: z('7.08.05') }].filter(function (x) { return Math.abs(x.v) >= 0.5; });
      var sx = itens.reduce(function (a, x) { return a + x.v; }, 0);
      return { total: tot, itens: itens, fecha: Math.abs(sx - z('7.08')) <= 1.5 && Math.abs(z('7.08') - tot) <= 1.5 };
    };
    E.dra = function (p, base) {
      var f = function (cd) { return m.agg('dra', cd, p, base); };
      if (!ok(f('4.01')) || !ok(f('4.03'))) return null;
      var passos = [{ rot: 'Outros resultados abrangentes', v: nz0(f('4.03')) - f('4.01') }];
      return { inicio: { rot: 'Lucro líquido', v: f('4.01') }, passos: passos, fim: { rot: 'Resultado abrangente', v: f('4.03') }, fecha: Math.abs(nz0(f('4.02')) - passos[0].v) <= 1.5 };
    };
    var DM = null;
    E.pl = function (p) {   // DMPL acumulada do ano até p, coluna do PL consolidado
      var d = dados.dmpl; if (!d) return null;
      if (!DM) { DM = {}; d.valores.forEach(function (v) { if (v[2] === 'Patrimônio Líquido Consolidado') DM[v[0] + '|' + v[1]] = v[3]; }); }
      var g = function (cd) { return DM[p + '|' + cd]; }, z = function (cd) { return nz0(g(cd)); };
      var ini = ok(g('5.03')) ? g('5.03') : g('5.01'), fim = g('5.07'); if (!ok(ini) || !ok(fim)) return null;
      var div = z('5.04.06') + z('5.04.07');
      var passos = limpa([{ rot: 'Lucro líquido', v: z('5.05.01') }, { rot: 'Outros resultados abrangentes', v: z('5.05') - z('5.05.01') }, { rot: 'Dividendos e JCP', v: div },
        { rot: 'Outras transações com acionistas', v: z('5.04') - div }, { rot: 'Outras mutações', v: fim - ini - z('5.04') - z('5.05') }]);
      var plbp = q('bp', '2.03', p);
      return { inicio: { rot: 'PL no início do ano', v: ini }, passos: passos, fim: { rot: 'PL no fim', v: fim }, fecha: fecha(ini, passos, fim) && (!ok(plbp) || Math.abs(plbp - fim) <= 1.5) };
    };
    // pontes entre dois períodos (B → A)
    E.ponteBalanco = function (pB, pA, lado) {
      var a = E.balanco(pA), b = E.balanco(pB); if (!a || !b) return null;
      var ga = a[lado], gb = b[lado], tA = lado === 'ativo' ? a.totAtivo : a.totPassivo, tB = lado === 'ativo' ? b.totAtivo : b.totPassivo;
      var passos = limpa(ga.map(function (x, i) { return { rot: x.rot, v: x.v - gb[i].v }; }));
      return { inicio: { rot: (lado === 'ativo' ? 'Ativo ' : 'Passivo e PL ') + pB, v: tB }, passos: passos, fim: { rot: (lado === 'ativo' ? 'Ativo ' : 'Passivo e PL ') + pA, v: tA }, fecha: a.fecha && b.fecha && fecha(tB, passos, tA) };
    };
    E.ponteLucro = function (A, B) {
      var v = function (cd, l) { return m.agg('dre', cd, l.p, l.base); }, d = function (cd) { return nz0(v(cd, A)) - nz0(v(cd, B)); };
      if (!ok(v('3.11', A)) || !ok(v('3.11', B)) || !ok(v('3.03', A)) || !ok(v('3.03', B))) return null;
      var dv = d('3.04.01'), dg = d('3.04.02'), de = d('3.04.06');
      var passos = limpa([{ rot: 'Lucro bruto', v: d('3.03') }, { rot: 'Despesas com vendas', v: dv }, { rot: 'Despesas gerais e administrativas', v: dg },
        { rot: 'Outras receitas e despesas operacionais', v: d('3.04') - dv - dg - de }, { rot: 'Equivalência patrimonial', v: de }, { rot: 'Resultado financeiro', v: d('3.06') },
        { rot: 'IR e CS', v: d('3.08') }, { rot: 'Operações descontinuadas', v: d('3.10') }]);
      return { inicio: { rot: 'Lucro B', v: v('3.11', B) }, passos: passos, fim: { rot: 'Lucro A', v: v('3.11', A) }, fecha: fecha(v('3.11', B), passos, v('3.11', A)) };
    };
    E.ponteDivida = function (p0, p1) {   // dívida líquida divulgada no fim de p0 → fim de p1 (p0 antes de p1), pelos fluxos de caixa do intervalo
      var dl = dados.dlrel && dados.dlrel.series, d0 = dl && dl[p0], d1 = dl && dl[p1];
      if (!d0 || !d1 || !ok(d0.v) || !ok(d1.v) || ord(p1) <= ord(p0)) return null;
      var base = 'R:' + lab(ord(p0) + 1);
      if (m.agg('dfc', '6.01', p1, base) === null) return null;
      var f = function (cd) { return nz0(m.agg('dfc', cd, p1, base)); };
      var passos = [{ rot: 'Geração de caixa operacional', v: -f('6.01') }, { rot: 'Investimentos em imobilizado e intangível', v: -f('6.02.01') },
        { rot: 'Outros investimentos e desinvestimentos', v: -(f('6.02') - f('6.02.01')) }, { rot: 'Juros pagos', v: -(f('6.03.04') + f('6.03.11')) },
        { rot: 'Dividendos e JCP pagos', v: -(f('6.03.05') + f('6.03.06')) }, { rot: 'Recompra de ações e capital', v: -(f('6.03.12') + f('6.03.09') + f('6.03.17')) }];
      var soma0 = passos.reduce(function (a, x) { return a + x.v; }, 0);
      passos.push({ rot: 'Outros sem efeito no caixa', v: d1.v - d0.v - soma0, outros: true });
      passos = limpa(passos);
      return { inicio: { rot: 'Dívida líquida ' + p0, v: d0.v }, passos: passos, fim: { rot: 'Dívida líquida ' + p1, v: d1.v }, fecha: fecha(d0.v, passos, d1.v) };
    };
    m.periodosInd = function (base) {   // períodos em que faz sentido calcular indicadores
      return m.periodos('dre', base).filter(function (p) { return true; });
    };
    return m;
  }

  return { criar: criar, ord: ord, lab: lab, rotulo: rotulo, desloca: desloca, tri: tri, BASES: BASES, ok: ok, ehIntervalo: ehIntervalo, trimestresBase: trimestresBase, fechaBase: fechaBase, TIPOS: TIPOS, TIPOS_NOME: TIPOS_NOME, par: par };
});
