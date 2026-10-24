/* Painel VBBR3: páginas de segmentos (release), dividendos, Formulário de Referência e conferências; carga dos dados. */
(function () {
  'use strict';
  var P = window.P, G = window.Graficos, Dados = window.Dados, h = P.h, ok = P.ok, S = P.S;

  // ---------- operacional: volumes, EBITDA Ajustado e margens por segmento (releases, leitura automática) ----------
  var SEG_ORDEM = ['REDE', 'B2B', 'GC', 'AVI', 'OUT', 'REN'];
  // valor de uma métrica do release agregado na base escolhida (soma de trimestres; margem = EBITDA ÷ volume)
  P.oper = function (seg, met, p, base) {
    var O = P.D.oper; if (!O) return null;
    var get = function (pp, s, m) { var x = O.series[pp] && O.series[pp][s] && O.series[pp][s][m]; return x && ok(x.v) ? x.v : null; };
    var segV = seg === 'CONS' ? function (pp, m) { var v = get(pp, 'CONS', m); return v !== null ? v : get(pp, 'DIST', m); } : function (pp, m) { return get(pp, seg, m); };
    base = base || 'T';
    if (!Dados.fechaBase(base, p)) return null;
    var k = Dados.trimestresBase(base, p);
    if (k === 1 && base === 'T') {
      var v0 = segV(p, met);
      if (v0 === null && met === 'margem_m3') { var e0 = segV(p, 'ebitda'), q0 = segV(p, 'vol'); return ok(e0) && q0 ? e0 / q0 * 1000 : null; }
      return v0;
    }
    var n = Dados.ord(p), soma = function (m) { var s = 0; for (var i = n - k + 1; i <= n; i++) { var v = segV(Dados.lab(i), m); if (v === null) return null; s += v; } return s; };
    if (met === 'margem_m3' || met === 'margem_rec_m3') { var e = soma(met === 'margem_m3' ? 'ebitda' : 'ebitda_rec'), q = soma('vol'); return ok(e) && q ? e / q * 1000 : null; }
    return soma(met);
  };
  function paginaOper() {
    var ref = {};
    function segsCom(met, cols) { return SEG_ORDEM.filter(function (s) { return cols.some(function (p) { return ok(P.oper(s, met, p, S.base)); }); }); }
    function linhas(cols) {
      var O = P.D.oper, out = [], L = function (rot, seg, met, cls, fmt) {
        var vals = cols.map(function (p) { return P.oper(seg, met, p, S.base); });
        if (!vals.some(ok)) return;
        out.push({ id: seg + met, conta: rot, nivel: cls ? 1 : 2, vals: vals, cel: vals.map(fmt || P.fN), cls: cls || '' });
      };
      out.push({ grupo: 'Volume de vendas (mil m³)' });
      L('Total', 'CONS', 'vol', 'tot'); segsCom('vol', cols).forEach(function (s) { L(O.segmentos[s], s, 'vol'); });
      out.push({ grupo: 'EBITDA Ajustado (R$ milhões)' });
      L('Consolidado', 'CONS', 'ebitda', 'tot'); L('Consolidado recorrente', 'CONS', 'ebitda_rec');
      segsCom('ebitda', cols).forEach(function (s) { L(O.segmentos[s], s, 'ebitda'); });
      out.push({ grupo: 'Margem EBITDA Ajustada (R$/m³)' });
      L('Consolidado (Distribuição a partir de 2025)', 'CONS', 'margem_m3', 'tot'); L('Consolidado recorrente', 'CONS', 'margem_rec_m3');
      segsCom('vol', cols).forEach(function (s) { L(O.segmentos[s], s, 'margem_m3'); });
      return out;
    }
    return {
      init: function (el) {
        ref.vol = P.chart('o-vol'); ref.eb = P.chart('o-eb'); ref.m3 = P.chart('o-m3'); ref.cmp = P.chart('o-cmp'); ref.tb = h('table'); ref.fontes = h('div'); ref.reap = h('div');
        el.append(
          h('div', { class: 'grid' },
            P.card('Volume de vendas por segmento', 'Mil m³. Marcador: volume total.', ref.vol),
            P.card('EBITDA Ajustado por segmento', 'R$ milhões, medida não contábil da Companhia. Marcador: consolidado, que inclui o Corporativo.', ref.eb),
            P.card('Margem EBITDA Ajustada', 'R$ por m³ vendido. Nas bases acumuladas, calculada como EBITDA Ajustado ÷ volume.', ref.m3),
            P.card('EBITDA Ajustado (release) × EBITDA contábil (CVM)', 'R$ milhões. A diferença são os ajustes gerenciais da Companhia (estoques, hedge, créditos fiscais e outros).', ref.cmp)),
          h('div', { class: 'sec' }, h('h2', null, 'Indicadores operacionais'), h('button', { class: 'btn', type: 'button', onclick: exporta }, 'Baixar para Excel')),
          h('div', { class: 'twrap' }, ref.tb), ref.fontes, ref.reap,
          h('p', { class: 'note', style: 'margin-top:10px' }, 'Fonte: releases de resultados arquivados na CVM, lidos automaticamente; cada trimestre usa o número do próprio release do trimestre. Segmentos conforme a divulgação de cada época: Grandes Consumidores e Aviação até 2019; B2B a partir de 2020; Aviação incorporada ao B2B a partir de 2023; Renováveis (Comerc) a partir de 2025. O EBITDA Ajustado do 3T24 é o da manchete do release, sem a recuperação tributária extraordinária (LC 194/22).'));
      },
      render: function () {
        var O = P.D.oper, cols = P.lista('dre').filter(function (p) { return ok(P.oper('CONS', 'vol', p, S.base)) || ok(P.oper('CONS', 'ebitda', p, S.base)); }), rs = cols.map(P.rot);
        var serie = function (seg, met) { return cols.map(function (p) { return P.oper(seg, met, p, S.base); }); };
        if (!cols.length) { G.falha(ref.vol, 'Sem dados de release no intervalo escolhido'); return; }
        G.empilhado(ref.vol, rs, segsCom('vol', cols).map(function (s) { return { nome: O.segmentos[s], vals: serie(s, 'vol') }; }), { nome: 'Volume total', vals: serie('CONS', 'vol') }, P.fN);
        G.empilhado(ref.eb, rs, segsCom('ebitda', cols).map(function (s) { return { nome: O.segmentos[s], vals: serie(s, 'ebitda') }; }), { nome: 'EBITDA Ajustado consolidado', vals: serie('CONS', 'ebitda') }, P.fN);
        G.linhas(ref.m3, rs, [{ nome: 'Consolidado', vals: serie('CONS', 'margem_m3') }, { nome: 'Rede de Postos', vals: serie('REDE', 'margem_m3') }, { nome: 'B2B', vals: serie('B2B', 'margem_m3') }], function (x) { return P.fInt(x); });
        G.linhas(ref.cmp, rs, [{ nome: 'EBITDA Ajustado (release)', vals: serie('CONS', 'ebitda') }, { nome: 'EBITDA contábil (CVM)', vals: cols.map(function (p) { return P.M.ind('ebitda', p, S.base); }) }], P.fN);
        P.tabela(ref.tb, '', rs, linhas(cols));
        // fontes do trimestre (base trimestre)
        ref.fontes.replaceChildren();
        if (S.base === 'T') {
          var links = cols.map(function (p) { var s = O.series[p], c = s && (s.CONS || s.DIST), f = c && (c.vol || c.ebitda); return f ? h('a', { href: f.fonte.link, target: '_blank', rel: 'noopener noreferrer' }, p) : null; }).filter(Boolean);
          if (links.length) ref.fontes.append(h('p', { class: 'note', style: 'margin-top:10px' }, 'Releases de origem (abre o PDF na CVM): ', links.reduce(function (a, x, i) { if (i) a.push(' · '); a.push(x); return a; }, [])));
        }
        var rp = [];
        cols.forEach(function (p) { var s = O.series[p] || {}; Object.keys(s).forEach(function (seg) { Object.keys(s[seg]).forEach(function (m) { var x = s[seg][m]; if (x.reapresentado) rp.push(p + ' · ' + (O.segmentos[seg] || seg) + ' · ' + m + ': ' + P.fN(x.v) + ' no release do trimestre; ' + x.reapresentado.map(function (r) { return P.fN(r.valor) + ' em ' + P.fData(r.release); }).join(', ')); }); }); });
        ref.reap.replaceChildren();
        if (rp.length && S.base === 'T') ref.reap.append(h('details', { class: 'note' }, h('summary', null, rp.length + ' número(s) reapresentado(s) em releases posteriores'), h('ul', null, rp.map(function (t) { return h('li', null, t.replace(/ebitda_rec/, 'EBITDA recorrente').replace(/margem_rec_m3/, 'margem recorrente').replace(/margem_m3/, 'margem R$/m³').replace(/ebitda/, 'EBITDA').replace(/vol/, 'volume')); }))));
      }
    };
    function exporta() { var cols = P.lista('dre'), ls = linhas(cols).filter(function (l) { return !l.grupo; }); P.csv('vibra_operacional_' + S.base + '.csv', ['indicador'].concat(cols.map(P.rot)), ls.map(function (l) { return [l.conta].concat(l.vals.map(P.numCsv)); })); }
  }

  // compatibilidade: EBITDA Ajustado consolidado no formato usado pela visão executiva e pela análise automática
  function segDoRelease(O) {
    var l = { cd_conta: 'EBITDA', conta: 'EBITDA Ajustado consolidado', nivel: 1 };
    O.periodos.forEach(function (p) { var x = O.series[p].CONS && O.series[p].CONS.ebitda; if (x) l[p] = x.v; });
    return { periodos: O.periodos, linhas: [l] };
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
          h('div', { class: 'sec' }, h('h2', null, 'Histórico de proventos'), h('div', { class: 'controls' }, ref.q, h('button', { class: 'btn', type: 'button', onclick: function () { P.csv('vibra_proventos.csv', ['provento', 'exercicio', 'data_ex', 'valor_total_reais', 'valor_por_acao', 'data_pagamento'], P.D.div.linhas.map(function (d) { return [d.provento, d.referencia, d.data_ex, P.numCsv(d.valor_total), P.numCsv(d.valor_acao), d.data_pagamento]; })); } }, 'Baixar para Excel'))),
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
            h('button', { class: 'btn', type: 'button', onclick: function () { exportaTab(); } }, 'Baixar para Excel')),
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
    conf: 'cvm_conferencias.json', status: 'cvm_status.json', oper: 'release_operacional.json', div: 'dividendos.json', freIndice: 'fre/indice.json', freSeries: 'fre_series.json', b3: 'b3_cotacoes.json', ipe: 'ipe.json' };
  var OBRIG = { dre: 1, bp: 1, dfc: 1, conf: 1, status: 1 };
  Promise.all(Object.keys(ARQ).map(function (k) {
    return fetch('data/' + ARQ[k], { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(ARQ[k] + ' (' + r.status + ')'); return r.json(); }).then(function (j) { P.D[k] = j; })
      .catch(function (e) { if (OBRIG[k]) throw e; });
  })).then(function () {
    var D = P.D;
    P.M = Dados.criar({ dre: D.dre, bp: D.bp, dfc: D.dfc, dva: D.dva, dra: D.dra, acoes: D.acoes, b3: D.b3 });
    P.nucleo();
    if (D.oper && D.oper.periodos && D.oper.periodos.length) { D.seg = segDoRelease(D.oper); P.registra('oper', 'Operacional e EBITDA Ajustado', paginaOper(), true); }
    if (D.div) P.registra('div', 'Dividendos e JCP', paginaDiv(), false);
    if (D.ipe && D.ipe.documentos && D.ipe.documentos.length) P.registra('ipe', 'Comunicados e fatos relevantes', paginaIpe(), false);
    if (D.freIndice && D.freSeries) P.registra('fre', 'Formulário de Referência', paginaFre(), false);
    P.registra('conf', 'Conferências', paginaConf(), false); P.ocultas = { conf: 1 };
    var abaLink = P.leEstado(location.hash);
    P.montaAbas(); P.iniciaTempo();
    var st = D.status, ult = D.dre.periodos[D.dre.periodos.length - 1], pri = D.dre.periodos[0];
    var ger = st && st.gerado_em ? new Date(st.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    P.$('sub').textContent = 'Resultados, mercado e comunicados da Vibra Energia (VBBR3) · consolidado, R$ milhões · ' + pri + ' a ' + ult + ' · atualizado em ' + ger;
    var selo = P.$('selo'); if (selo) { selo.textContent = st && st.validado ? 'Dados conferidos' : 'Atenção: conferência com divergência'; selo.className = 'selo' + (st && st.validado ? '' : ' alerta'); }
    window.addEventListener('hashchange', function () { if (location.hash === P.linkEstado()) return; var hh = P.leEstado(location.hash); P.iniciaTempo(); if (P.ordem.indexOf(hh) >= 0) P.aba(hh); });
    var hsh = abaLink;
    P.aba(P.ordem.indexOf(hsh) >= 0 ? hsh : 'exec');
  }).catch(function (e) { P.$('sub').textContent = 'Não foi possível carregar os dados: ' + e.message; });
})();
