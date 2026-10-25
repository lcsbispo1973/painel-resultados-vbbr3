/* Vibra em Números — Governança (Formulário de Referência), Comunicados (IPE), Metodologia e conferências; carga dos dados. */
(function () {
  'use strict';
  var P = window.P, G = window.Graficos, Dados = window.Dados, h = P.h, ok = P.ok, S = P.S;

  function tabelaTexto(tb, cab, linhas, nEsq) {
    tb.replaceChildren();
    tb.appendChild(h('thead', null, h('tr', null, cab.map(function (c, i) { return h('th', { scope: 'col', style: i < nEsq ? 'text-align:left' : '' }, c); }))));
    tb.appendChild(h('tbody', null, linhas.map(function (l) { return h('tr', null, l.map(function (t, i) { return h('td', { class: i < nEsq ? 'txt' : '', style: i === 0 ? 'position:static' : '' }, t); })); })));
  }


  // ---------- comunicados, fatos relevantes e avisos (IPE da CVM) ----------
  var GRUPOS_IPE = [
    ['chave', 'Fatos relevantes, comunicados e avisos', function (d) { return /^(Fato Relevante|Comunicado ao Mercado|Aviso aos Acionistas|Aviso aos Debenturistas)$/.test(d.categoria); }],
    ['fr', 'Fatos relevantes', function (d) { return d.categoria === 'Fato Relevante'; }],
    ['cm', 'Comunicados ao mercado', function (d) { return d.categoria === 'Comunicado ao Mercado'; }],
    ['av', 'Avisos aos acionistas e debenturistas', function (d) { return /^Aviso aos/.test(d.categoria); }],
    ['res', 'Resultados: releases, apresentações e DFs', function (d) { return d.tipo === 'Press-release' || d.tipo === 'Apresentações a analistas/agentes do mercado' || /^Demonstrações Financeiras/.test(d.tipo); }],
    ['gov', 'Assembleias e reuniões da administração', function (d) { return d.categoria === 'Assembleia' || d.categoria === 'Reunião da Administração'; }],
    ['todos', 'Todos os documentos', function () { return true; }]
  ];
  P.ipeGrupo = function (id) { return GRUPOS_IPE.filter(function (g) { return g[0] === id; })[0]; };
  function paginaIpe() {
    var F = { grupo: 'chave', ano: '', busca: '', n: 50 }, ref = {};
    var semAcento = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
    function filtrados() {
      var g = P.ipeGrupo(F.grupo), q = semAcento(F.busca).split(/\s+/).filter(Boolean);
      return P.D.ipe.documentos.filter(function (d) {
        if (!g[2](d)) return false;
        if (F.ano && d.data_entrega.slice(0, 4) !== F.ano) return false;
        if (!q.length) return true;
        var t = semAcento(d.assunto + ' ' + d.tipo + ' ' + d.categoria + ' ' + d.especie);
        return q.every(function (w) { return t.indexOf(w) >= 0; });
      });
    }
    return {
      init: function (el) {
        var self = this, anos = Array.from(new Set(P.D.ipe.documentos.map(function (d) { return d.data_entrega.slice(0, 4); }))).sort().reverse();
        ref.chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Tipo de documento' });
        GRUPOS_IPE.forEach(function (g) { ref.chips.appendChild(h('button', { class: 'btn', type: 'button', 'data-g': g[0], onclick: function () { F.grupo = g[0]; F.n = 50; self.render(); } }, g[1])); });
        ref.busca = h('input', { type: 'search', placeholder: 'Buscar no assunto (ex.: dividendos, aquisição, debêntures)', 'aria-label': 'Buscar', style: 'min-width:min(100%,340px)' });
        var tm; ref.busca.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(function () { F.busca = ref.busca.value; F.n = 50; self.render(); }, 200); });
        ref.ano = P.select('ipe-ano', [['', 'Todos os anos']].concat(anos.map(function (a) { return [a, a]; })), '', function (v) { F.ano = v; F.n = 50; self.render(); }, 'Ano');
        ref.info = h('p', { class: 'note' }); ref.tb = h('table');
        ref.mais = h('button', { class: 'btn', type: 'button', onclick: function () { F.n += 100; self.render(); } }, 'Mostrar mais');
        el.append(
          h('div', { class: 'controls' }, ref.chips),
          h('div', { class: 'controls' }, ref.busca, P.label('Ano', ref.ano),
            h('button', { class: 'btn', type: 'button', onclick: function () { var l = filtrados(); P.csv('vibra_comunicados.csv', ['data_entrega', 'categoria', 'tipo', 'especie', 'assunto', 'link'], l.map(function (d) { return [d.data_entrega, d.categoria, d.tipo, d.especie, d.assunto, d.link]; })); } }, 'Baixar para Excel')),
          ref.info, h('div', { class: 'twrap' }, ref.tb), h('div', { class: 'controls', style: 'margin-top:10px' }, ref.mais),
          h('p', { class: 'note' }, 'Fonte: Dados Abertos da CVM (documentos periódicos e eventuais — IPE), última versão de cada documento. O link abre o documento original no sistema da CVM. Atualizado diariamente.'));
      },
      manchete: function () { return P.manchete.comunicados(); },
      render: function () {
        Array.prototype.forEach.call(ref.chips.children, function (b) { b.className = 'btn' + (b.getAttribute('data-g') === F.grupo ? ' sel' : ''); });
        var l = filtrados(), vis = l.slice(0, F.n);
        ref.info.textContent = l.length + ' documento(s)' + (l.length ? ', de ' + P.fData(l[l.length - 1].data_entrega) + ' a ' + P.fData(l[0].data_entrega) : '') + '.';
        tabelaTexto(ref.tb, ['Data', 'Categoria', 'Tipo', 'Assunto', 'Documento'], vis.map(function (d) {
          return [P.fData(d.data_entrega), d.categoria, d.tipo || '—', d.assunto || '—', d.link ? h('a', { href: d.link, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir') : '—'];
        }), 4);
        ref.mais.hidden = l.length <= F.n;
      }
    };
  }

  // ---------- Governança e remuneração (Formulário de Referência) ----------
  function paginaGovernanca() {
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
        ref.cards = h('div', { class: 'grid kpis' });
        el.append(ref.cards,
          h('div', { hidden: true },  'Fonte: Dados Abertos da CVM (Formulário de Referência). Para cada ano, o painel usa a última versão entregue. O texto do formulário (por exemplo, o item 10, comentários dos diretores) não faz parte dos dados abertos: abra o documento original pelo link da tabela abaixo. Dados pessoais (CPF, datas de nascimento e currículos) não são publicados aqui.'),
          h('div', { class: 'grid' },
            P.card('Remuneração dos administradores', 'R$ milhões, total por órgão e exercício (Formulário de Referência, item 8.2). Cada exercício vem do formulário mais recente que o informa.', ref.cRem),
            P.card('Acionistas pessoas físicas', 'Quantidade informada em cada Formulário de Referência (item 15), por ano do formulário.', ref.cPF),
            P.card('Acionistas pessoas jurídicas e investidores institucionais', 'Quantidade informada em cada formulário (item 15).', ref.cInst)),
          h('div', { class: 'twrap', style: 'max-height:20rem' }, ref.tbCap),
          h('div', { class: 'sec' }, h('h2', null, 'Formulários de Referência (última versão de cada ano)')),
          h('div', { class: 'twrap', style: 'max-height:22rem' }, ref.tbDocs),
          h('details', { class: 'explorar' }, h('summary', null, 'Ver tabelas completas do formulário'),
            h('div', { class: 'controls' }, P.label('Formulário', ref.selAno), P.label('Tabela', ref.selTab), ref.q,
              h('button', { class: 'btn', type: 'button', onclick: function () { exportaTab(); } }, 'Baixar para Excel')),
            ref.msg, h('div', { class: 'twrap' }, ref.tb)));
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
        var af = P.anoFechado();
        G.empilhado(ref.cRem, ex.map(function (e) { return af && +e > af ? e + ' (prev.)' : e; }), orgaos.map(function (o) { return { nome: o, vals: ex.map(function (e) { return val(o, e); }) }; }), null, P.fN);
        var dv = s.dividendos, de = dv.map(function (d) { return String(d.exercicio); });
        var ac = s.acionistas, aa = ac.map(function (a) { return String(a.ano_fre); });
        G.linhas(ref.cPF, aa, [{ nome: 'Pessoas físicas', vals: ac.map(function (a) { return a.pf; }) }], P.fN);
        G.linhas(ref.cInst, aa, [{ nome: 'Pessoas jurídicas', vals: ac.map(function (a) { return a.pj; }) }, { nome: 'Investidores institucionais', vals: ac.map(function (a) { return a.institucionais; }) }], P.fN);
        var cp = s.capital, ci = {}; s.acionistas.forEach(function (a) { ci[a.ano_fre] = a; });
        tabelaTexto(ref.tbCap, ['Formulário', 'Capital social (R$ mi)', 'Ações (milhões)', 'Ações em circulação (%)', 'Empregados'],
          cp.slice().reverse().map(function (c) { var a = ci[c.ano_fre], e = s.empregados.filter(function (x) { return x.ano_fre === c.ano_fre; })[0]; return ['FRE ' + c.ano_fre, P.fN(c.capital_rs_mi), P.f1(c.acoes_total / 1e6), a ? P.fPct0(a.circulacao_pct) : '—', e ? P.fN(e.empregados) : '—']; }), 1);
      },
      cartoes: function () {
        var s = P.D.freSeries, ex = P.exRemuneracao(), u = ex[ex.length - 1], u0 = ex[ex.length - 2];
        var tot = function (e) { return s.remuneracao.filter(function (r) { return r.exercicio === e; }).reduce(function (a, r) { return a + (r.total_rs_mi || 0); }, 0); };
        var luc = P.M.agg('dre', '3.11.01', '4T' + String(+u % 100).padStart(2, '0'), 'AN'), ac = s.acionistas, a1 = ac[ac.length - 1], a0 = ac[0];
        var cp = s.capital[s.capital.length - 1], em = s.empregados.filter(function (e) { return P.ok(e.empregados); }), e1 = em[em.length - 1], e0 = em[0];
        var card = function (rot, valor, txt) { return h('div', { class: 'card kpi' }, h('div', { class: 'kl' }, rot), h('div', { class: 'kv' }, valor), h('p', { class: 'note', style: 'margin:6px 0 0' }, txt)); };
        ref.cards.replaceChildren(
          card('Remuneração da administração (' + u + ')', 'R$ ' + P.f1(tot(u)) + ' mi', (u0 ? (tot(u) >= tot(u0) ? 'Alta' : 'Queda') + ' de ' + P.f1(Math.abs(tot(u) / tot(u0) - 1) * 100) + '% sobre ' + u0 + '. ' : '') + (P.ok(luc) && luc > 0 ? 'Equivale a ' + P.f2(tot(u) / luc * 100) + '% do lucro dos controladores do ano.' : '')),
          card('Acionistas pessoas físicas', P.fN(a1.pf), 'No formulário de ' + a1.ano_fre + (a0 && a0 !== a1 ? '; eram ' + P.fN(a0.pf) + ' no de ' + a0.ano_fre + '.' : '.') + (P.ok(a1.circulacao_pct) ? ' Ações em circulação: ' + P.f1(a1.circulacao_pct) + '%.' : '')),
          card('Capital social', 'R$ ' + P.f1(cp.capital_rs_mi / 1000) + ' bi', P.f1(cp.acoes_total / 1e6) + ' milhões de ações (formulário de ' + cp.ano_fre + ').'),
          e1 ? card('Empregados', P.fN(e1.empregados), 'No formulário de ' + e1.ano_fre + (e0 && e0 !== e1 ? '; eram ' + P.fN(e0.empregados) + ' no de ' + e0.ano_fre + '.' : '.')) : null);
      },
      manchete: function () { return P.manchete.governanca(); },
      render: function () {
        this.cartoes();
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

  // ---------- metodologia e conferências (fora da navegação) ----------
  function paginaConf() {
    var ref = {};
    return {
      init: function (el) {
        var self = this;
        ref.sum = h('p', { class: 'note' }); ref.tb = h('table');
        ref.selS = P.select('sel-conf', [['', 'Todos'], ['divergente', 'Divergentes'], ['ok', 'Ok'], ['sem dados', 'Sem dados']], '', function () { self.render(); }, 'Status');
        ref.selD = P.select('sel-conf-demo', [['', 'Todas']].concat(Array.from(new Set(P.D.conf.map(function (t) { return t.demo; }))).map(function (x) { return [x, x]; })), '', function () { self.render(); }, 'Origem');
        ref.reg = h('div');
        el.append(h('div', { class: 'card', style: 'margin-bottom:14px' }, h('h2', null, 'Metodologia e fontes'),
          h('ul', { class: 'mda' },
            h('li', null, 'Demonstrações financeiras consolidadas (DFP e ITR), composição do capital e Formulário de Referência: Dados Abertos da CVM, última versão de cada documento. Trimestres de fluxo (DRE, DFC, DVA) obtidos pela diferença dos acumulados.'),
            h('li', null, 'EBITDA Ajustado: nota de informações por segmento das ITRs/DFPs (desde 2023, com comparativos de 2022); de 4T17 a 4T21, release de resultados. Antes do IPO (dez/2017), os trimestres de 4T16 a 3T17 vêm dos comparativos publicados nos releases de 2018 e o exercício de 2016 é o total anual divulgado no release do 4T17 (os trimestres de 2016 não foram divulgados). O 4º trimestre é o acumulado de dezembro (DFP) menos o de setembro (ITR do 3T).'),
            h('li', null, 'Volumes e margens por m³: releases de resultados arquivados na CVM, lidos automaticamente e conferidos (margem divulgada ≈ EBITDA ÷ volume; comparação com reapresentações).'),
            h('li', null, 'Ipiranga: releases da Ultrapar arquivados na CVM. Cotações: Séries Históricas da B3 (VBBR3/BRDT3 e BOVA11). Comunicados: base IPE da CVM. Proventos por ação: site de RI; totais anuais: DMPL.'),
            h('li', null, 'Trava de publicação: a cada atualização, todas as conferências e testes rodam antes de publicar; se algo falhar, o painel continua na última versão aprovada e um alerta é aberto no repositório.'))),
          ref.reg,
          h('div', { class: 'card', style: 'margin-bottom:14px' }, h('h2', null, 'Conferências automáticas'), ref.sum, h('div', { class: 'controls' }, P.label('Status', ref.selS), P.label('Origem', ref.selD))), h('div', { class: 'twrap' }, ref.tb));
      },
      manchete: function () { return ['Metodologia, fontes e conferências automáticas do painel.']; },
      render: function () {
        var rg = P.D.registro;
        ref.reg.replaceChildren();
        if (rg && rg.eventos && rg.eventos.length) ref.reg.append(h('div', { class: 'card', style: 'margin-bottom:14px' }, h('h2', null, 'Registro de mudanças'),
          h('p', { class: 'note' }, 'Documentos que entraram no painel, do mais recente para o mais antigo. A cada novidade, um alerta é aberto no repositório (aviso por e-mail).'),
          h('ul', { class: 'lista-reg' }, rg.eventos.filter(function (e) { return e.data; }).slice(0, 15).map(function (e) {
            return h('li', null, h('span', { class: 'kl' }, P.fData(e.data) + ' · ' + e.tipo), h('br'), e.link ? h('a', { href: e.link, target: '_blank', rel: 'noopener noreferrer' }, e.titulo) : e.titulo, e.detalhe ? h('div', { class: 'note' }, e.detalhe) : null);
          }))));
        var vl = P.D.validacao;
        if (vl) ref.reg.append(h('p', { class: 'note', style: 'margin:0 0 14px' }, 'Trava de publicação: ' + vl.checagens + ' checagens dos números ' + (vl.ok ? 'aprovadas' : 'com falha') + ' em ' + P.fData(vl.gerado_em.slice(0, 10)) + '.'));
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
    conf: 'cvm_conferencias.json', status: 'cvm_status.json', oper: 'release_operacional.json', aj: 'ebitda_ajustado.json', div: 'proventos.json', divRI: 'dividendos.json', freIndice: 'fre/indice.json', freSeries: 'fre_series.json',
    b3: 'b3_cotacoes.json', ipe: 'ipe.json', ipiranga: 'ipiranga.json', divida: 'divida.json', reltxt: 'releases_texto.json', fre10: 'fre_item10.json', registro: 'registro.json', validacao: 'validacao.json', dlrel: 'divida_release.json', mdaIa: 'mda_ia.json' };
  var OBRIG = { dre: 1, bp: 1, dfc: 1, conf: 1, status: 1, aj: 1 };
  Promise.all(Object.keys(ARQ).map(function (k) {
    return fetch('data/' + ARQ[k], { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(ARQ[k] + ' (' + r.status + ')'); return r.json(); }).then(function (j) { P.D[k] = j; })
      .catch(function (e) { if (OBRIG[k]) throw e; });
  })).then(function () {
    var D = P.D;
    if (!D.div) D.div = D.divRI;   // proventos conferidos com os avisos da CVM; na falta, o site de RI
    P.M = Dados.criar({ dre: D.dre, bp: D.bp, dfc: D.dfc, dva: D.dva, dra: D.dra, acoes: D.acoes, b3: D.b3, aj: D.aj, dlrel: D.dlrel });
    P.paginasConsulta(); P.paginasAnalise(); P.paginasMercado();
    P.registra('gov', 'Governança', paginaGovernanca(), false);
    if (D.ipe && D.ipe.documentos && D.ipe.documentos.length) P.registra('ipe', 'Comunicados', paginaIpe(), false);
    P.registra('conf', 'Metodologia', paginaConf(), false); P.ocultas.conf = 1;
    P.montaAbas();
    var st = D.status, ger = st && st.gerado_em ? new Date(st.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    P.$('sub').textContent = 'Resultados, mercado e comunicados da Vibra Energia (VBBR3) · consolidado, R$ milhões · atualizado em ' + ger;
    var selo = P.$('selo'); if (selo) { selo.textContent = st && st.validado ? 'Dados conferidos' : 'Atenção: conferência com divergência'; selo.className = 'selo' + (st && st.validado ? '' : ' alerta'); }
    P.inicia(P.leLink(location.hash));
  }).catch(function (e) { P.$('sub').textContent = 'Não foi possível carregar os dados: ' + e.message; });
})();
