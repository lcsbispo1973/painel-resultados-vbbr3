/* Vibra em Números — núcleo: estado, utilitários, seletor de período (ano → período), navegação, manchete e glossário. */
(function () {
  'use strict';
  var Dados = window.Dados;
  var P = window.P = {
    D: {}, M: null, paginas: {}, ordem: [],
    // A = período em foco (todas as abas); B = período de comparação (abas Comparar e MD&A)
    S: { aba: 'geral', a: null, b: null, sub: {} }
  };
  var S = P.S;

  // ---------- formatação ----------
  var loc = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['R$ ', ''] });
  var fInt = loc.format(',.0f'), f1 = loc.format(',.1f'), f2 = loc.format(',.2f');
  var ok = P.ok = Dados.ok;
  P.f1 = f1; P.f2 = f2; P.fInt = fInt;
  P.fN = function (v) { return !ok(v) ? '—' : (v < 0 ? '(' + fInt(-v) + ')' : fInt(v)); };
  P.fBi = function (v) { return !ok(v) ? '—' : (v < 0 ? '−' : '') + 'R$ ' + f1(Math.abs(v) / 1000) + ' bi'; };
  P.fMi = function (v) { return !ok(v) ? '—' : (Math.abs(v) >= 1000 ? P.fBi(v) : (v < 0 ? '−' : '') + 'R$ ' + fInt(Math.abs(v)) + ' mi'); };
  P.fPct = function (v) { return !ok(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + f1(Math.abs(v) * 100) + '%'; };   // v em fração
  P.fPct0 = function (v) { return !ok(v) ? '—' : f1(v) + '%'; };                                                      // v em p.p.
  P.fPP = function (v) { return !ok(v) ? '—' : (v >= 0 ? '+' : '−') + f1(Math.abs(v)) + ' p.p.'; };
  P.fData = function (s) { if (!s) return '—'; var p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s; };
  P.fUn = function (un, v) {
    if (!ok(v)) return '—';
    if (un === '%') return f1(v) + '%';
    if (un === 'x') return f2(v) + 'x';
    if (un === 'dias') return f1(v);
    if (un === 'R$') return f2(v);
    if (un === 'R$/m³') return fInt(v);
    if (un === 'milhões' || un === 'mil m³') return un === 'milhões' ? f1(v) : fInt(v);
    return P.fN(v);
  };
  P.numCsv = function (v) { return ok(v) ? String(Math.round(v * 1e6) / 1e6).replace('.', ',') : ''; };

  // ---------- DOM ----------
  P.$ = function (id) { return document.getElementById(id); };
  // documentos da CVM: o endereço de download (frmDownloadDocumento) entrega o arquivo com tipo "text/html" e o Safari do
  // iPhone trava ("Um problema ocorreu repetidamente"). Os links do painel apontam para as páginas de visualização da CVM,
  // que mostram o documento (IPE: visualizador de PDF; FRE/ITR/DFP: consulta por seções) e têm o botão de download.
  P.linkDoc = function (u) {
    if (typeof u !== 'string') return u;
    u = u.replace(/^http:\/\//, 'https://');
    var m = /rad\.cvm\.gov\.br\/ENET\/frmDownloadDocumento\.aspx\?.*[?&]numProtocolo=(\d+)/i.exec(u);
    if (m && /descTipo=IPE/i.test(u)) return 'https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega=' + m[1];
    m = /rad\.cvm\.gov\.br\/ENETCONSULTA\/frmDownloadDocumento\.aspx\?.*NumeroSequencialDocumento=(\d+)/i.exec(u);
    if (m) return 'https://www.rad.cvm.gov.br/ENET/frmGerenciaPaginaFRE.aspx?NumeroSequencialDocumento=' + m[1] + '&CodigoTipoInstituicao=1';
    return u;
  };
  var h = P.h = function (tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'href' && typeof v === 'string' && /^https?:\/\//.test(v)) e.setAttribute(k, P.linkDoc(v));   // conexão segura e página de visualização da CVM
      else e.setAttribute(k, v === true ? '' : v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) {
      if (Array.isArray(c)) return c.forEach(add);
      if (c == null || c === false) return;
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return e;
  };
  P.chart = function (id) { return h('div', { class: 'chart', id: id }); };
  P.card = function (titulo, nota, corpo, larga, info) {
    return h('div', { class: 'card' + (larga ? ' wide' : '') }, h('h2', null, titulo, info ? P.info(info) : null), nota ? h('p', { class: 'note' }, nota) : null, corpo);
  };
  P.opcoes = function (sel, itens, valor) {
    sel.replaceChildren(); itens.forEach(function (i) { sel.appendChild(new Option(i[1], i[0])); });
    if (valor != null) sel.value = valor; if (sel.value !== String(valor) && sel.options.length) sel.selectedIndex = 0;
  };
  P.select = function (id, itens, valor, aoMudar, rotulo) {
    var s = h('select', { id: id, 'aria-label': rotulo }); P.opcoes(s, itens, valor); s.addEventListener('change', function () { aoMudar(s.value); }); return s;
  };
  P.label = function (txt, ctl) { return h('label', null, txt, ctl); };
  // controle segmentado (estilo iOS): itens = [[valor, rótulo, desativado?]]
  P.segmentado = function (itens, valor, aoMudar, rotulo) {
    var g = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': rotulo || '' });
    itens.forEach(function (i) {
      g.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(i[0] === valor), class: i[0] === valor ? 'on' : '', disabled: i[2] ? 'disabled' : null,
        onclick: function () { aoMudar(i[0]); } }, i[1]));
    });
    return g;
  };
  // botão "i" com explicação (fórmula e fonte)
  P.info = function (texto) {
    var b = h('button', { type: 'button', class: 'info', 'aria-label': 'Como é calculado' }, 'i');
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var aberto = document.querySelector('.pop'); if (aberto) { aberto.remove(); if (aberto._dono === b) return; }
      var p = h('div', { class: 'pop', role: 'dialog' }, texto); p._dono = b;
      document.body.appendChild(p);
      var r = b.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 24);
      p.style.width = w + 'px'; p.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + window.scrollX - w / 2)) + 'px'; p.style.top = (r.bottom + window.scrollY + 6) + 'px';
    });
    return b;
  };
  document.addEventListener('click', function () { var p = document.querySelector('.pop'); if (p) p.remove(); });

  P.csv = function (nome, cab, linhas) {
    var esc = function (v) { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var txt = '﻿' + [cab].concat(linhas).map(function (r) { return r.map(esc).join(';'); }).join('\n');
    var a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })), download: nome }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };
  P.arquivo = function (nome, conteudo, tipo) {
    var a = h('a', { href: URL.createObjectURL(new Blob([conteudo], { type: tipo })), download: nome }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };

  // tabela: cols = rótulos; linhas = [{conta, nivel, cls, cel:[...], cclass:[...], id, info} | {grupo}]
  P.tabela = function (tb, primeira, cols, linhas, aoClicar) {
    tb.replaceChildren();
    tb.appendChild(h('thead', null, h('tr', null, h('th', { scope: 'col' }, primeira), cols.map(function (c) { return h('th', { scope: 'col' }, c); }))));
    var corpo = h('tbody');
    linhas.forEach(function (l) {
      if (l.grupo) { corpo.appendChild(h('tr', { class: 'grp' }, h('td', { colspan: cols.length + 1 }, l.grupo))); return; }
      var tr = h('tr', { class: [l.cls || '', aoClicar ? 'clk' : ''].join(' ').trim(), 'data-id': l.id || null });
      tr.appendChild(h('td', { style: 'padding-left:' + (10 + Math.max(0, (l.nivel || 2) - 2) * 12) + 'px' }, l.conta, l.info ? P.info(l.info) : null));
      l.cel.forEach(function (t, i) { tr.appendChild(h('td', { class: l.cclass && l.cclass[i] ? l.cclass[i] : '' }, t)); });
      if (aoClicar) tr.addEventListener('click', function () { aoClicar(l); });
      corpo.appendChild(tr);
    });
    tb.appendChild(corpo);
  };

  // ---------- período ----------
  // período = { ano, tipo } com tipo em 1T 2T 3T 4T 1S 2S 9M AN; P.x(per) → { p, base } usados pelo motor de dados
  P.x = function (per) { return per ? Dados.par(per.ano, per.tipo) : null; };
  P.rotulo = function (per) { var x = P.x(per); return x ? P.M.rotulo(x.p, x.base) : '—'; };
  P.rotuloLongo = function (per) {
    if (!per) return '—';
    var n = { '1T': '1º trimestre', '2T': '2º trimestre', '3T': '3º trimestre', '4T': '4º trimestre', '1S': '1º semestre', '2S': '2º semestre', '9M': '9 meses', 'AN': 'ano' }[per.tipo];
    return per.tipo === 'AN' ? 'ano de ' + per.ano : n + ' de ' + per.ano;
  };
  P.anterior = function (per) { return per ? { ano: per.ano - 1, tipo: per.tipo } : null; };
  P.disp = function (per) { return !!per && P.M.disponivel(per.ano, per.tipo); };
  function padraoA() { var u = P.M.ultimoPar(); return { ano: u.ano, tipo: u.tipo }; }
  function ajusta(per) {   // período disponível mais próximo
    if (P.disp(per)) return per;
    var tipos = ['4T', '3T', '2T', '1T', 'AN'];   // 'AN' por último: anos só anuais (2015)
    for (var a = per.ano; a >= P.M.anos()[0]; a--) {
      if (P.M.disponivel(a, per.tipo)) return { ano: a, tipo: per.tipo };
      for (var i = 0; i < tipos.length; i++) if (a === per.ano && P.M.disponivel(a, tipos[i])) return { ano: a, tipo: tipos[i] };
    }
    return padraoA();
  }
  var TIPOS_UI = [['1T', '1T'], ['2T', '2T'], ['3T', '3T'], ['4T', '4T'], ['1S', '1S'], ['2S', '2S'], ['9M', '9M'], ['AN', 'Ano']];

  // seletor ano → período, com Aplicar; chave = 'a' ou 'b'
  function seletor(chave, titulo) {
    var box = h('div', { class: 'per' }), pend = null;
    function desenha() {
      var atual = S[chave]; pend = pend || { ano: atual.ano, tipo: atual.tipo };
      var anos = P.M.anos().slice().reverse();
      var selAno = P.select('ano-' + chave, anos.map(function (a) { return [String(a), String(a)]; }), String(pend.ano), function (v) { pend.ano = +v; if (!P.disp(pend)) pend = ajusta(pend); desenha(); }, titulo + ': ano');
      var seg = P.segmentado(TIPOS_UI.map(function (t) { return [t[0], t[1], !P.M.disponivel(pend.ano, t[0])]; }), pend.tipo, function (v) { pend.tipo = v; desenha(); }, titulo + ': período');
      var mud = pend.ano !== atual.ano || pend.tipo !== atual.tipo;
      var apl = h('button', { type: 'button', class: 'btn apl' + (mud ? ' sel' : ''), disabled: mud ? null : 'disabled', onclick: function () { S[chave] = { ano: pend.ano, tipo: pend.tipo }; pend = null; if (chave === 'a' && !S.bManual) S.b = P.anterior(S.a); render(); } }, mud ? 'Aplicar' : 'Aplicado');
      box.replaceChildren(h('span', { class: 'per-t' }, titulo), selAno, seg, apl);
    }
    return { el: box, desenha: function () { pend = null; desenha(); } };
  }
  var selA = null, selB = null;
  function barraPeriodo() {
    var pg = P.paginas[S.aba], box = P.$('periodo');
    box.hidden = !pg.periodo;
    if (!pg.periodo) return;
    if (!selA) { selA = seletor('a', 'Período'); selB = seletor('b', 'Comparar com'); }
    selA.desenha(); selB.desenha();
    var linhas = [selA.el];
    if (pg.periodo === 'ab') linhas.push(selB.el);
    box.replaceChildren.apply(box, linhas);
  }
  P.marcaB = function () { S.bManual = true; };

  // ---------- navegação e manchete ----------
  P.registra = function (id, titulo, obj, periodo) { P.paginas[id] = { titulo: titulo, obj: obj, periodo: periodo || false, el: null, pronto: false }; P.ordem.push(id); };
  P.ocultas = {};
  P.montaAbas = function () {
    var nav = P.$('tabs'), main = P.$('pages');
    P.ordem.forEach(function (id) {
      var pg = P.paginas[id];
      if (!P.ocultas[id]) nav.appendChild(h('button', { role: 'tab', 'data-tab': id, 'aria-selected': 'false', onclick: function () { P.aba(id); } }, pg.titulo));
      pg.el = h('section', { class: 'page', id: 'p-' + id, hidden: true }); main.appendChild(pg.el);
    });
  };
  function manchete(pg) {
    var alvo = P.$('take'); alvo.replaceChildren();
    var m = pg.obj.manchete ? pg.obj.manchete() : null;
    if (m) alvo.append.apply(alvo, [].concat(m));
  }
  function render() {
    var pg = P.paginas[S.aba]; if (!pg || !P.M) return;
    barraPeriodo();
    if (P.barraExportar) P.barraExportar();
    if (!pg.pronto) { pg.pronto = true; pg.obj.init(pg.el); }
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (e) { e.hidden = e.id !== 'p-' + S.aba; });
    Array.prototype.forEach.call(document.querySelectorAll('nav.tabs button'), function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === S.aba)); });
    pg.obj.render();
    manchete(pg);
    try { history.replaceState(null, '', P.link()); } catch (e) { /* ignora */ }
  }
  P.render = render;
  P.aba = function (id) { S.aba = id; render(); var t = document.querySelector('nav.tabs [aria-selected="true"]'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };

  // estado no endereço: #aba?a=2026-1S&b=2025-1S
  P.link = function () {
    var q = [];
    if (S.a) q.push('a=' + S.a.ano + '-' + S.a.tipo);
    if (S.b && S.bManual) q.push('b=' + S.b.ano + '-' + S.b.tipo);
    Object.keys(S.sub).forEach(function (k) { if (S.sub[k]) q.push(k + '=' + encodeURIComponent(S.sub[k])); });
    return '#' + S.aba + (q.length ? '?' + q.join('&') : '');
  };
  P.leLink = function (hash) {
    var partes = String(hash || '').replace(/^#/, '').split('?'), q = {};
    (partes[1] || '').split('&').forEach(function (kv) { var x = kv.split('='); if (x[0]) q[x[0]] = decodeURIComponent(x[1] || ''); });
    var le = function (s) { var m = /^(\d{4})-(1T|2T|3T|4T|1S|2S|9M|AN)$/.exec(s || ''); return m ? { ano: +m[1], tipo: m[2] } : null; };
    S.a = le(q.a) || S.a; var b = le(q.b); if (b) { S.b = b; S.bManual = true; }
    Object.keys(q).forEach(function (k) { if (k !== 'a' && k !== 'b') S.sub[k] = q[k]; });
    return partes[0];
  };
  P.inicia = function (abaLink) {
    S.a = S.a && P.disp(S.a) ? S.a : padraoA();
    S.b = S.b && P.disp(S.b) ? S.b : (P.disp(P.anterior(S.a)) ? P.anterior(S.a) : S.a);
    P.aba(P.ordem.indexOf(abaLink) >= 0 ? abaLink : 'geral');
    window.addEventListener('hashchange', function () { if (location.hash === P.link()) return; var id = P.leLink(location.hash); if (P.ordem.indexOf(id) >= 0) P.aba(id); });
  };
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 160); });
})();
