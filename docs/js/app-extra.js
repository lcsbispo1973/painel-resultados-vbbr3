/* Painel VBBR3: páginas de segmentos (release), dividendos, Formulário de Referência e conferências; carga dos dados. */
(function () {
  'use strict';
  var P = window.P, G = window.Graficos, Dados = window.Dados, h = P.h, ok = P.ok, S = P.S;

  // ---------- EBITDA Ajustado por segmento (release) ----------
  function paginaSeg() {
    var ref = {};
    return {
      init: function (el) {
        ref.chart = P.chart('c-seg'); ref.tb = h('table');
        el.append(
          h('div', { class: 'card wide', style: 'margin-bottom:14px' }, h('h2', null, 'EBITDA Ajustado por segmento'),
            h('p', { class: 'note' }, 'R$ milhões. Barras: Retail, B2B e Renováveis (Comerc, a partir de 2025). Marcador: consolidado, que inclui o Corporativo. Fonte: releases de resultados; carga manual até a leitura automática ficar pronta. Medida não contábil, na definição da Companhia.'), ref.chart),
          h('div', { class: 'sec' }, h('h2', null, 'EBITDA Ajustado por segmento, R$ milhões'), h('button', { class: 'btn', type: 'button', onclick: exporta }, 'Baixar CSV')),
          h('div', { class: 'twrap' }, ref.tb),
          h('p', { class: 'note', style: 'margin-top:10px' }, 'Renováveis não é apresentado separadamente antes de 2025. O Corporativo do 3T24 contém efeito extraordinário (recuperações tributárias), conforme o release do 4T25.'));
      },
      render: function () {
        var d = P.D.seg, ps = d.periodos, v = function (c) { var l = d.linhas.filter(function (x) { return x.cd_conta === c; })[0]; return ps.map(function (p) { return l && ok(l[p]) ? l[p] : null; }); };
        G.empilhado(ref.chart, ps, [{ nome: 'Retail', vals: v('RET') }, { nome: 'B2B', vals: v('B2B') }, { nome: 'Renováveis (Comerc)', vals: v('REN') }], { nome: 'EBITDA Ajustado consolidado', vals: v('EBITDA') }, P.fN);
        P.tabela(ref.tb, 'R$ milhões', ps, d.linhas.map(function (l) { return { conta: l.conta, nivel: l.nivel, cel: ps.map(function (p) { return P.fN(l[p]); }), cls: l.cd_conta === 'EBITDA' || l.cd_conta === 'TOT' ? 'tot' : '' }; }));
      }
    };
    function exporta() { var d = P.D.seg; P.csv('vibra_ebitda_segmentos.csv', ['conta'].concat(d.periodos), d.linhas.map(function (l) { return [l.conta].concat(d.periodos.map(function (p) { return P.numCsv(l[p]); })); })); }
  }

  // ---------- dividendos e JCP (site de RI) ----------
  function paginaDiv() {
    var ref = {};
    return {
      init: function (el) {
        ref.chart = P.chart('c-div'); ref.tb = h('table'); ref.q = h('input', { type: 'search', placeholder: 'Filtrar (ex.: JSCP, 2025)', 'aria-label': 'Filtrar proventos' });
        ref.q.addEventListener('input', this.render);
        el.append(
          h('div', { class: 'card wide', style: 'margin-bottom:14px' }, h('h2', null, 'Proventos por exercício de referência'),
            h('p', { class: 'note' }, 'JCP e dividendos declarados, R$ milhões, por exercício a que se referem. O exercício mais recente está em andamento. Fonte: página Dividendos e JCP do site de RI; carga manual até a leitura automática ficar pronta.'), ref.chart),
          h('div', { class: 'sec' }, h('h2', null, 'Histórico de proventos'), h('div', { class: 'controls' }, ref.q, h('button', { class: 'btn', type: 'button', onclick: function () { P.csv('vibra_proventos.csv', ['provento', 'exercicio', 'data_ex', 'valor_total_reais', 'valor_por_acao', 'data_pagamento'], P.D.div.linhas.map(function (d) { return [d.provento, d.referencia, d.data_ex, P.numCsv(d.valor_total), P.numCsv(d.valor_acao), d.data_pagamento]; })); } }, 'Baixar CSV'))),
          h('div', { class: 'twrap' }, ref.tb),
          h('p', { class: 'note', style: 'margin-top:10px' }, 'Datas e valores como publicados no site de RI. Valores totais em R$ milhões; valor por ação em R$. Para o payout calculado sobre o lucro ajustado, veja a aba Formulário de Referência.'));
        ref.self = this;
      },
      render: function () {
        var ls = P.D.div.linhas, por = {};
        ls.forEach(function (d) { var o = por[d.referencia] || (por[d.referencia] = { jcp: 0, div: 0 }); if (d.provento === 'JSCP') o.jcp += d.valor_total / 1e6; else o.div += d.valor_total / 1e6; });
        var anos = Object.keys(por).sort(), r1 = function (x) { return Math.round(x * 10) / 10; };
        G.empilhado(ref.chart, anos, [{ nome: 'JCP', vals: anos.map(function (a) { return r1(por[a].jcp); }) }, { nome: 'Dividendos', vals: anos.map(function (a) { return r1(por[a].div); }) }], null, P.fN);
        var q = ref.q.value.trim().toLowerCase();
        var rows = ls.map(function (d) { return [d.provento, d.referencia, P.fData(d.data_ex), P.f1(d.valor_total / 1e6), P.f2(d.valor_acao), P.fData(d.data_pagamento)]; })
          .filter(function (c) { return !q || c.join(' ').toLowerCase().indexOf(q) >= 0; });
        tabelaTexto(ref.tb, ['Provento', 'Exercício', 'Data ex', 'Valor (R$ mi)', 'Por ação (R$)', 'Pagamento'], rows, 2);
      }
    };
  }
  // tabela simples de texto (colunas à esquerda: n primeiras)
  function tabelaTexto(tb, cab, linhas, nEsq) {
    tb.replaceChildren();
    tb.appendChild(h('thead', null, h('tr', null, cab.map(function (c, i) { return h('th', { scope: 'col', style: i < nEsq ? 'text-align:left' : '' }, c); }))));
    tb.appendChild(h('tbody', null, linhas.map(function (l) { return h('tr', null, l.map(function (t, i) { return h('td', { class: i < nEsq ? 'txt' : '', style: i === 0 ? 'position:static' : '' }, t); })); })));
  }

  // ---------- Formulário de Referência ----------
  function paginaFre() {
    var ref = { cache: {}, ano: null, tab: null };
    function carrega(ano) {
      if (ref.cache[ano]) return Promise.resolve(ref.cache[ano]);
      return fetch('data/fre/' + ano + '.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('FRE ' + ano + ' (' + r.status + ')'); return r.json(); }).then(function (j) { ref.cache[ano] = j; return j; });
    }
    return {
      init: function (el) {
        var self = this, ix = P.D.freIndice, anos = ix.anos.slice().reverse();
        ref.tbDocs = h('table'); ref.cRem = P.chart('c-fre-rem'); ref.cDiv = P.chart('c-fre-div'); ref.cPF = P.chart('c-fre-pf'); ref.cInst = P.chart('c-fre-inst');
        ref.tbDiv = h('table'); ref.tbCap = h('table');
        ref.selAno = P.select('fre-ano', anos.map(function (a) { return [a.ano, 'FRE ' + a.ano]; }), anos[0].ano, function (v) { ref.ano = +v; ref.tab = null; self.render(); }, 'Ano do formulário');
        ref.selTab = h('select', { id: 'fre-tab', 'aria-label': 'Tabela' }); ref.selTab.addEventListener('change', function () { ref.tab = ref.selTab.value; self.render(); });
        ref.q = h('input', { type: 'search', placeholder: 'Filtrar linhas', 'aria-label': 'Filtrar linhas' }); ref.q.addEventListener('input', function () { self.render(); });
        ref.tb = h('table'); ref.msg = h('p', { class: 'note' });
        ref.ano = anos[0].ano;
        el.append(
          h('div', { class: 'aviso' }, 'Fonte: Dados Abertos da CVM (Formulário de Referência). Para cada ano, o painel usa a última versão entregue. O texto do formulário (por exemplo, o item 10, comentários dos diretores) não faz parte dos dados abertos: abra o documento original pelo link da tabela abaixo. Dados pessoais (CPF, datas de nascimento e currículos) não são publicados aqui.'),
          h('div', { class: 'sec' }, h('h2', null, 'Documentos (última versão de cada ano)')),
          h('div', { class: 'twrap', style: 'max-height:22rem' }, ref.tbDocs),
          h('div', { class: 'sec' }, h('h2', null, 'Séries entre formulários')),
          h('div', { class: 'grid' },
            P.card('Remuneração dos administradores', 'R$ milhões, total por órgão e exercício (Formulário de Referência, item 8.2). Cada exercício vem do formulário mais recente que o informa.', ref.cRem),
            P.card('Lucro líquido ajustado e dividendos distribuídos', 'R$ milhões por exercício (item 3.5). O payout é o informado no formulário.', ref.cDiv),
            P.card('Acionistas pessoas físicas', 'Quantidade informada em cada Formulário de Referência (item 15), por ano do formulário.', ref.cPF),
            P.card('Acionistas pessoas jurídicas e investidores institucionais', 'Quantidade informada em cada formulário (item 15).', ref.cInst)),
          h('div', { class: 'twrap', style: 'max-height:20rem; margin-bottom:10px' }, ref.tbDiv),
          h('div', { class: 'twrap', style: 'max-height:20rem' }, ref.tbCap),
          h('div', { class: 'sec' }, h('h2', null, 'Explorador de tabelas')),
          h('div', { class: 'controls' }, P.label('Formulário', ref.selAno), P.label('Tabela', ref.selTab), ref.q,
            h('button', { class: 'btn', type: 'button', onclick: function () { exportaTab(); } }, 'Baixar CSV')),
          ref.msg, h('div', { class: 'twrap' }, ref.tb));
        this.docs(); this.series();
      },
      docs: function () {
        var ix = P.D.freIndice, linhas = [];
        ix.anos.slice().reverse().forEach(function (a) {
          a.documentos.forEach(function (d) {
            linhas.push(['FRE ' + a.ano, 'v' + d.versao + (d.versoes_no_ano > 1 ? ' (de ' + d.versoes_no_ano + ')' : ''), d.dt_refer.slice(0, 10).split('-').reverse().join('/'), P.fData(d.dt_receb), h('a', { href: d.link, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir na CVM')]);
          });
        });
        tabelaTexto(ref.tbDocs, ['Formulário', 'Versão final', 'Data de referência', 'Recebido em', 'Documento'], linhas, 5);
      },
      series: function () {
        var s = P.D.freSeries, orgaos = ['Conselho de Administração', 'Diretoria Estatutária', 'Conselho Fiscal'];
        var ex = Array.from(new Set(s.remuneracao.map(function (r) { return r.exercicio; }))).sort();
        var val = function (o, e) { var r = s.remuneracao.filter(function (x) { return x.orgao === o && x.exercicio === e; })[0]; return r ? r.total_rs_mi : null; };
        G.empilhado(ref.cRem, ex, orgaos.map(function (o) { return { nome: o, vals: ex.map(function (e) { return val(o, e); }) }; }), null, P.fN);
        var dv = s.dividendos, de = dv.map(function (d) { return String(d.exercicio); });
        G.linhas(ref.cDiv, de, [{ nome: 'Lucro líquido ajustado', vals: dv.map(function (d) { return d.lucro_ajustado_rs_mi; }) }, { nome: 'Dividendos distribuídos', vals: dv.map(function (d) { return d.dividendo_total_rs_mi; }) }], P.fN);
        tabelaTexto(ref.tbDiv, ['Exercício', 'Lucro ajustado (R$ mi)', 'Dividendos (R$ mi)', 'Payout (%)', 'Lucro retido (R$ mi)', 'Retorno s/ PL (%)', 'Formulário'],
          dv.map(function (d) { return [d.exercicio, P.fN(d.lucro_ajustado_rs_mi), P.fN(d.dividendo_total_rs_mi), P.fPct0(d.payout_pct), P.fN(d.retido_rs_mi), P.fPct0(d.retorno_pl_pct), 'FRE ' + d.fonte_fre]; }), 1);
        var ac = s.acionistas, aa = ac.map(function (a) { return String(a.ano_fre); });
        G.linhas(ref.cPF, aa, [{ nome: 'Pessoas físicas', vals: ac.map(function (a) { return a.pf; }) }], P.fN);
        G.linhas(ref.cInst, aa, [{ nome: 'Pessoas jurídicas', vals: ac.map(function (a) { return a.pj; }) }, { nome: 'Investidores institucionais', vals: ac.map(function (a) { return a.institucionais; }) }], P.fN);
        var cp = s.capital, ci = {}; s.acionistas.forEach(function (a) { ci[a.ano_fre] = a; });
        tabelaTexto(ref.tbCap, ['Formulário', 'Capital social (R$ mi)', 'Ações (milhões)', 'Ações em circulação (%)', 'Empregados'],
          cp.map(function (c) { var a = ci[c.ano_fre], e = s.empregados.filter(function (x) { return x.ano_fre === c.ano_fre; })[0]; return ['FRE ' + c.ano_fre, P.fN(c.capital_rs_mi), P.f1(c.acoes_total / 1e6), a ? P.fPct0(a.circulacao_pct) : '—', e ? P.fN(e.empregados) : '—']; }), 1);
      },
      render: function () {
        ref.selAno.value = String(ref.ano);
        ref.msg.textContent = 'Carregando…';
        var nomes = P.D.freIndice.nomes_tabelas;
        carrega(ref.ano).then(function (j) {
          var tabs = Object.keys(j.tabelas).sort(function (a, b) { return (nomes[a] || a).localeCompare(nomes[b] || b, 'pt-BR'); });
          if (!ref.tab || tabs.indexOf(ref.tab) < 0) ref.tab = tabs.indexOf('capital_social') >= 0 ? 'capital_social' : tabs[0];
          P.opcoes(ref.selTab, tabs.map(function (t) { return [t, (nomes[t] || t) + ' (' + j.tabelas[t].linhas.length + ')']; }), ref.tab);
          var t = j.tabelas[ref.tab], q = ref.q.value.trim().toLowerCase();
          var ls = t.linhas.filter(function (l) { return !q || l.join(' ').toLowerCase().indexOf(q) >= 0; });
          ref.atual = { t: t, ls: ls, ano: ref.ano, tab: ref.tab };
          ref.msg.textContent = (nomes[ref.tab] || ref.tab) + ': ' + ls.length + ' linhas. Documento: versão ' + j.documentos[j.documentos.length - 1].versao + ', recebida em ' + P.fData(j.documentos[j.documentos.length - 1].dt_receb) + '.';
          tabelaTexto(ref.tb, t.colunas.map(function (c) { return c.replace(/_/g, ' '); }), ls.slice(0, 500), t.colunas.length);
          if (ls.length > 500) ref.msg.textContent += ' Mostrando as 500 primeiras; use o filtro ou baixe o CSV.';
        }).catch(function (e) { ref.msg.textContent = 'Não foi possível carregar o formulário: ' + e.message; });
      }
    };
    function exportaTab() { var a = ref.atual; if (!a) return; P.csv('fre_' + a.ano + '_' + a.tab + '.csv', a.t.colunas, a.ls); }
  }

  // ---------- conferências ----------
  function paginaConf() {
    var ref = {};
    return {
      init: function (el) {
        var self = this;
        ref.sum = h('p', { class: 'note' }); ref.tb = h('table');
        ref.selS = P.select('sel-conf', [['', 'Todos'], ['divergente', 'Divergentes'], ['ok', 'Ok'], ['sem dados', 'Sem dados']], '', function () { self.render(); }, 'Status');
        ref.selD = P.select('sel-conf-demo', [['', 'Todas']].concat(Array.from(new Set(P.D.conf.map(function (t) { return t.demo; }))).map(function (x) { return [x, x]; })), '', function () { self.render(); }, 'Origem');
        el.append(h('div', { class: 'card', style: 'margin-bottom:14px' }, h('h2', null, 'Conferências automáticas'), ref.sum, h('div', { class: 'controls' }, P.label('Status', ref.selS), P.label('Origem', ref.selD))), h('div', { class: 'twrap' }, ref.tb));
      },
      render: function () {
        var c = P.D.conf, ok_ = c.filter(function (t) { return t.status === 'ok'; }).length, dv = c.filter(function (t) { return t.status === 'divergente'; }).length;
        ref.sum.textContent = c.length + ' testes: ' + ok_ + ' ok, ' + dv + ' divergentes, ' + (c.length - ok_ - dv) + ' sem dados. Tolerância de R$ 2 milhões por arredondamento. Os testes "Release" comparam a CVM com valores já conferidos nos releases; "Cruzado" compara demonstrações diferentes.';
        var fs = ref.selS.value, fd = ref.selD.value, o = Dados.ord;
        var ls = c.filter(function (t) { return (!fs || t.status === fs) && (!fd || t.demo === fd); })
          .sort(function (a, b) { return (a.status === 'divergente' ? 0 : 1) - (b.status === 'divergente' ? 0 : 1) || o(b.periodo) - o(a.periodo); }).slice(0, 400);
        tb(ref.tb, ls);
      }
    };
    function tb(t, ls) {
      t.replaceChildren();
      t.appendChild(h('thead', null, h('tr', null, ['Origem', 'Teste', 'Período', 'Esperado', 'Reportado', 'Diferença', 'Status'].map(function (x, i) { return h('th', { scope: 'col', style: i < 3 || i === 6 ? 'text-align:left' : '' }, x); }))));
      t.appendChild(h('tbody', null, ls.map(function (x) {
        return h('tr', null, h('td', { class: 'txt', style: 'position:static' }, x.demo), h('td', { class: 'txt' }, x.teste), h('td', { class: 'txt' }, x.periodo), h('td', null, P.fN(x.esperado)), h('td', null, P.fN(x.reportado)), h('td', null, P.fN(x.diferenca)),
          h('td', { class: 'txt ' + (x.status === 'ok' ? 'ok' : x.status === 'divergente' ? 'bad' : '') }, x.status));
      })));
    }
  }

  // ---------- carga ----------
  var ARQ = { dre: 'cvm_dre.json', bp: 'cvm_balanco.json', dfc: 'cvm_fluxo_caixa.json', dva: 'cvm_dva.json', dra: 'cvm_dra.json', dmpl: 'cvm_dmpl.json', acoes: 'cvm_acoes.json',
    conf: 'cvm_conferencias.json', status: 'cvm_status.json', seg: 'release_segmentos.json', div: 'dividendos.json', freIndice: 'fre/indice.json', freSeries: 'fre_series.json', b3: 'b3_cotacoes.json' };
  var OBRIG = { dre: 1, bp: 1, dfc: 1, conf: 1, status: 1 };
  Promise.all(Object.keys(ARQ).map(function (k) {
    return fetch('data/' + ARQ[k], { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(ARQ[k] + ' (' + r.status + ')'); return r.json(); }).then(function (j) { P.D[k] = j; })
      .catch(function (e) { if (OBRIG[k]) throw e; });
  })).then(function () {
    var D = P.D;
    P.M = Dados.criar({ dre: D.dre, bp: D.bp, dfc: D.dfc, dva: D.dva, dra: D.dra, acoes: D.acoes, b3: D.b3 });
    P.nucleo();
    if (D.seg) P.registra('seg', 'EBITDA por segmento', paginaSeg(), false);
    if (D.div) P.registra('div', 'Dividendos e JCP', paginaDiv(), false);
    if (D.freIndice && D.freSeries) P.registra('fre', 'Formulário de Referência', paginaFre(), false);
    P.registra('conf', 'Conferências', paginaConf(), false);
    P.montaAbas(); P.iniciaTempo();
    var st = D.status, ult = D.dre.periodos[D.dre.periodos.length - 1], pri = D.dre.periodos[0];
    var ger = st && st.gerado_em ? new Date(st.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    P.$('sub').textContent = 'Valores consolidados em R$ milhões. Série da CVM: ' + pri + ' a ' + ult + '. Dados da CVM atualizados em ' + ger + (st && st.validado ? ' · conferências ok' : ' · atenção: há conferências divergentes') + '.';
    var hsh = location.hash.slice(1);
    P.aba(P.ordem.indexOf(hsh) >= 0 ? hsh : 'exec');
  }).catch(function (e) { P.$('sub').textContent = 'Não foi possível carregar os dados: ' + e.message; });
})();
