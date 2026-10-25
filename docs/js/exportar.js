/* Vibra em Números — exportação da aba aberta: PDF (o que está na tela) e Excel (tabelas e números dos gráficos).
   As bibliotecas (SheetJS e html2pdf) ficam em docs/vendor e só são carregadas no primeiro clique. */
(function () {
  'use strict';
  var P = window.P, h = P.h, S = P.S;

  var carregados = {};
  function carrega(src) {
    if (!carregados[src]) carregados[src] = new Promise(function (ok, falha) {
      var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { delete carregados[src]; falha(new Error('não foi possível carregar ' + src)); };
      document.head.appendChild(s);
    });
    return carregados[src];
  }

  // ---------- nomes e textos ----------
  function semAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function nomeArquivo(ext) {
    var pg = P.paginas[S.aba], per = P.paginas[S.aba].periodo ? '_' + P.rotulo(S.a) + (pg.periodo === 'ab' ? '_vs_' + P.rotulo(S.b) : '') : '';
    return ('vibra_' + semAcento(pg.titulo) + per).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/_$/, '') + '.' + ext;
  }
  // texto de um elemento sem botões; elementos de bloco (data, categoria e assunto em linhas separadas) ganham espaço entre si
  function textoLimpo(el) {
    if (!el) return '';
    var partes = [], vivo = el.isConnected;
    (function anda(n) {
      if (n.nodeType === 3) { partes.push(n.nodeValue); return; }
      if (n.nodeType !== 1) return;
      if (n.matches('.info, button, .no-pdf, .tip, script, style')) return;
      var bl = vivo && n !== el && !/^inline/.test(getComputedStyle(n).display);
      if (bl) partes.push(' · ');
      Array.prototype.forEach.call(n.childNodes, anda);
      if (bl) partes.push(' · ');
    })(el);
    return partes.join('').replace(/\s+/g, ' ').replace(/(\s*·\s*)+/g, ' · ').replace(/^\s*·\s*|\s*·\s*$/g, '').trim();
  }
  function periodoTexto() {
    var pg = P.paginas[S.aba];
    if (!pg.periodo) return '';
    return 'Período: ' + P.rotuloLongo(S.a) + (pg.periodo === 'ab' ? ' · comparado com: ' + P.rotuloLongo(S.b) : '');
  }
  function agora() {
    var d = new Date(), z = function (n) { return String(n).padStart(2, '0'); };
    return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }
  function aviso(txt) {
    var a = P.$('exp-aviso');
    if (!a) { a = h('div', { id: 'exp-aviso', class: 'exp-aviso', role: 'status' }); document.body.appendChild(a); }
    a.textContent = txt; a.hidden = !txt;
  }

  // ---------- Excel ----------
  // célula como aparece na tela → número quando é número (padrão brasileiro), com o formato equivalente
  function celula(t) {
    t = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
    if (!t || t === '—' || t === '–' || t === '-') return null;
    var s = t.replace(/−/g, '-'), neg = false, suf = '';
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
    if (/%$/.test(s)) { suf = '%'; s = s.slice(0, -1).trim(); }
    else if (/x$/.test(s)) { suf = 'x'; s = s.slice(0, -1).trim(); }
    else if (/ p\.p\.$/.test(s)) { suf = 'pp'; s = s.replace(/ p\.p\.$/, '').trim(); }
    if (!/^[+-]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) return { t: 's', v: t };
    var dec = (s.split(',')[1] || '').length, v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    if (neg) v = -v;
    var z = dec ? '#,##0.' + new Array(dec + 1).join('0') : '#,##0';
    if (suf === '%') return { t: 'n', v: v / 100, z: dec ? '0.' + new Array(dec + 1).join('0') + '%' : '0%' };
    if (suf === 'x') return { t: 'n', v: v, z: z + '"x"' };
    if (suf === 'pp') return { t: 'n', v: v, z: z + '" p.p."' };
    return { t: 'n', v: v, z: z };
  }
  function tituloDe(el) {
    var card = el.closest('.card');
    if (card) { var t = card.querySelector('h2, h3'); if (t) return textoLimpo(t); }
    var sec = el.closest('.sec'); if (sec) { var t2 = sec.querySelector('h2, h3'); if (t2) return textoLimpo(t2); }
    // título mais próximo acima da tabela: irmãos anteriores, subindo até a aba
    for (var n = el; n && !(n.classList && n.classList.contains('page')); n = n.parentElement) {
      for (var a = n.previousElementSibling; a; a = a.previousElementSibling) {
        if (/^H[23]$/.test(a.tagName)) return textoLimpo(a);
        var hh = a.querySelectorAll && a.querySelectorAll('h2, h3'); if (hh && hh.length) return textoLimpo(hh[hh.length - 1]);
      }
    }
    return '';
  }
  function notaDe(el) { var card = el.closest('.card'), n = card && card.querySelector('.note'); return n ? textoLimpo(n) : ''; }
  function visivel(el) { return !el.closest('[hidden]') && el.getClientRects().length > 0; }

  function planilha(XLSX, titulo, nota, cab, linhas, origem) {
    var aoa = [[titulo || 'Tabela']];
    if (nota) aoa.push([nota]);
    aoa.push([]);
    var ini = aoa.length;
    aoa.push(cab);
    linhas.forEach(function (l) { aoa.push(l); });
    if (origem) { aoa.push([]); aoa.push([origem]); }
    var ws = XLSX.utils.aoa_to_sheet(aoa.map(function (r, i) {
      return r.map(function (c, j) {
        if (i < ini || c == null || c === '') return c == null ? null : c;
        if (typeof c === 'number') return { t: 'n', v: c, z: Math.abs(c) < 10 && c % 1 ? '#,##0.00' : '#,##0' };
        if (typeof c === 'object') return c;
        return j === 0 || i === ini ? String(c) : celula(c);
      });
    }));
    ws['!cols'] = cab.map(function (_, j) { return { wch: j === 0 ? 46 : 16 }; });
    return ws;
  }

  P.exportaExcel = function () {
    aviso('Preparando a planilha…');
    return carrega('vendor/xlsx.mini.min.js').then(function () {
      var XLSX = window.XLSX, pg = P.paginas[S.aba], raiz = pg.el, wb = XLSX.utils.book_new(), usados = {};
      var nomeAba = function (t) {
        var n = semAcento(t || 'Tabela').replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Tabela', k = n, i = 2;
        while (usados[k.toLowerCase()]) k = n.slice(0, 25) + ' ' + (i++);
        usados[k.toLowerCase()] = 1; return k;
      };
      var sobre = [['Vibra em Números — ' + pg.titulo], [periodoTexto()], [textoLimpo(P.$('take'))], [],
        ['Gerado em', agora()], ['Endereço', location.href], ['Dados', textoLimpo(P.$('sub'))], [],
        ['Valores em R$ milhões, consolidados, salvo indicação na própria tabela. Fontes: documentos arquivados na CVM e cotações da B3.'],
        ['Painel independente construído com informações públicas; confira os valores nos documentos originais antes de usá-los.']];
      var ws0 = XLSX.utils.aoa_to_sheet(sobre); ws0['!cols'] = [{ wch: 18 }, { wch: 90 }];
      XLSX.utils.book_append_sheet(wb, ws0, nomeAba('Sobre'));
      var n = 0;
      // destaques (cartões com um número): rótulo, valor como na tela e complemento (ex.: último pregão)
      var kpis = Array.prototype.filter.call(raiz.querySelectorAll('.kpi'), visivel).map(function (k) {
        var kl = k.querySelector('.kl'), kv = k.querySelector('.kv'), resto = k.cloneNode(true);
        Array.prototype.forEach.call(resto.querySelectorAll('.kl, .kv, svg, .info'), function (x) { x.remove(); });
        return [textoLimpo(kl), textoLimpo(kv), textoLimpo(resto)];
      });
      if (kpis.length) { XLSX.utils.book_append_sheet(wb, planilha(XLSX, 'Destaques da tela', periodoTexto(), ['Indicador', 'Valor (como na tela)', 'Complemento'], kpis.map(function (r) { return [r[0], { t: 's', v: r[1] }, r[2]]; })), nomeAba('Destaques')); n++; }
      Array.prototype.forEach.call(raiz.querySelectorAll('table, .chart'), function (el) {
        if (!visivel(el)) return;
        var titulo = tituloDe(el) || pg.titulo, nota = notaDe(el);
        if (el.tagName === 'TABLE') {
          var trs = Array.prototype.slice.call(el.querySelectorAll('tr'));
          if (!trs.length) return;
          var cel = function (tr) { return Array.prototype.map.call(tr.children, function (c) { return textoLimpo(c); }); };
          var cabTr = el.querySelector('thead tr'), cab = cabTr ? cel(cabTr) : cel(trs[0]);
          var corpo = trs.filter(function (tr) { return tr !== (cabTr || trs[0]); }).map(cel);
          XLSX.utils.book_append_sheet(wb, planilha(XLSX, titulo || 'Tabela', nota, cab, corpo), nomeAba(titulo || 'Tabela'));
          n++;
        } else if (el._dados && el._dados.linhas && el._dados.linhas.length) {
          XLSX.utils.book_append_sheet(wb, planilha(XLSX, titulo || 'Gráfico', nota, el._dados.cab, el._dados.linhas, 'Números do gráfico, sem arredondamento.'), nomeAba('Graf ' + (titulo || n + 1)));
          n++;
        }
      });
      if (!n) XLSX.utils.sheet_add_aoa(ws0, [[], ['Esta aba não tem tabelas nem gráficos; o conteúdo está no PDF.']], { origin: -1 });
      XLSX.writeFile(wb, nomeArquivo('xlsx'), { compression: true });
      aviso('');
    }).catch(function (e) { aviso('Não foi possível gerar a planilha (' + e.message + ').'); setTimeout(function () { aviso(''); }, 6000); });
  };

  // os botões "Baixar para Excel" de cada tabela também geram .xlsx (antes, .csv)
  P.csv = function (nome, cab, linhas) {
    aviso('Preparando a planilha…');
    carrega('vendor/xlsx.mini.min.js').then(function () {
      var XLSX = window.XLSX, wb = XLSX.utils.book_new();
      var titulo = 'Vibra em Números — ' + P.paginas[S.aba].titulo + (periodoTexto() ? ' · ' + periodoTexto() : '');
      var conv = function (c) { if (c == null || c === '') return null; var s = String(c); return /^-?\d+(,\d+)?$/.test(s) ? { t: 'n', v: parseFloat(s.replace(',', '.')), z: /,/.test(s) ? '#,##0.00' : '#,##0' } : s; };
      var ws = XLSX.utils.aoa_to_sheet([[titulo], ['Gerado em ' + agora()], [], cab].concat(linhas.map(function (l) { return l.map(conv); })));
      ws['!cols'] = cab.map(function (c, j) { return { wch: j < 4 && !/^\d/.test(c) ? 28 : 14 }; });
      XLSX.utils.book_append_sheet(wb, ws, 'Dados');
      XLSX.writeFile(wb, String(nome).replace(/\.csv$/i, '') + '.xlsx', { compression: true });
      aviso('');
    }).catch(function (e) { aviso('Não foi possível gerar a planilha (' + e.message + ').'); setTimeout(function () { aviso(''); }, 6000); });
  };

  // ---------- PDF ----------
  // Relatório montado a partir da aba (texto, tabelas e gráficos em vetor/imagem leve), sem "fotografar" a página inteira:
  // abre rápido no iPhone, o texto é pesquisável e as quebras de página respeitam os blocos.
  var PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'paint-order', 'stroke-linejoin', 'visibility'];
  function svgPng(svg) {   // SVG do gráfico → PNG (estilos calculados escritos no próprio SVG)
    var r = svg.getBoundingClientRect(), W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    var c = svg.cloneNode(true), a = svg.querySelectorAll('*'), b = c.querySelectorAll('*');
    for (var i = 0; i < a.length && i < b.length; i++) {
      var cs = getComputedStyle(a[i]), st = [];
      PROPS.forEach(function (p) { var v = cs.getPropertyValue(p); if (v) st.push(p + ':' + v); });
      b[i].setAttribute('style', st.join(';'));
    }
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('width', W); c.setAttribute('height', H);
    c.setAttribute('style', 'font-family:' + getComputedStyle(svg).fontFamily);
    var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c));
    return new Promise(function (ok, falha) {
      var img = new Image();
      img.onload = function () {
        var k = 2, cv = document.createElement('canvas'); cv.width = W * k; cv.height = H * k;
        var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
        ok({ url: cv.toDataURL('image/png'), w: W, h: H });
      };
      img.onerror = function () { falha(new Error('gráfico')); };
      img.src = url;
    });
  }
  // fonte padrão do PDF (Helvetica, WinAnsi): troca os poucos caracteres fora dela
  function t(s) {
    return String(s == null ? '' : s).replace(/−/g, '-').replace(/[   ]/g, ' ').replace(/≈/g, '~').replace(/≥/g, '>=').replace(/≤/g, '<=')
      .replace(/Δ/g, 'Var.').replace(/³/g, '3').replace(/²/g, '2').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/×/g, 'x').replace(/→/g, '->').replace(/\s+/g, ' ').trim();
  }
  function rgb(cor) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cor || ''); if (m) return [+m[1], +m[2], +m[3]];
    m = /^#?([0-9a-f]{6})$/i.exec((cor || '').trim()); if (m) { var n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    return [55, 55, 58];
  }

  function montaPdf(pg) {
    var jsPDF = window.jspdf.jsPDF, doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    var M = 14, W = 210 - 2 * M, TOPO = 14, FUNDO = 297 - 16, y = TOPO, VERDE = [38, 130, 0], ESC = [0, 68, 21], CINZA = [102, 104, 107], TXT = [55, 55, 58];
    var cabe = function (h) { if (y + h > FUNDO) { doc.addPage(); y = TOPO; } };
    var texto = function (s, o) {
      o = o || {}; s = t(s); if (!s) return;
      doc.setFont('helvetica', o.negrito ? 'bold' : (o.italico ? 'italic' : 'normal')); doc.setFontSize(o.tam || 9.5); doc.setTextColor.apply(doc, o.cor || TXT);
      var x = M + (o.recuo || 0), larg = W - (o.recuo || 0), linhas = doc.splitTextToSize(s, larg), lh = (o.tam || 9.5) * 0.42;
      linhas.forEach(function (l, i) { cabe(lh); doc.text(l, x, y + lh * 0.8); if (o.marcador && i === 0) doc.text('•', M + (o.recuo || 0) - 3.2, y + lh * 0.8); y += lh; });
      y += o.depois == null ? 1.6 : o.depois;
    };
    // cabeçalho
    doc.setFillColor.apply(doc, VERDE); doc.rect(M, y, W, 0.9, 'F'); y += 3;
    texto('Vibra em Números — ' + pg.titulo, { tam: 16, negrito: true, cor: ESC, depois: 0.5 });
    if (periodoTexto()) texto(periodoTexto(), { tam: 9.5, negrito: true, depois: 1 });
    texto(textoLimpo(P.$('take')), { tam: 10.5, depois: 1 });
    texto(textoLimpo(P.$('sub')) + ' · gerado em ' + agora(), { tam: 7.5, cor: CINZA, depois: 4 });

    var tarefas = [];   // gráficos viram imagem de forma assíncrona; o resto é escrito na ordem
    function visivelPdf(el) { return !(el.hidden || el.classList.contains('no-pdf') || el.classList.contains('tip') || el.classList.contains('pop')) && el.getClientRects().length > 0; }
    function tabela(tb) {
      var linhas = Array.prototype.filter.call(tb.querySelectorAll('tr'), visivelPdf);
      if (!linhas.length) return;
      var cabTr = tb.querySelector('thead tr'), celulas = function (tr) { return Array.prototype.map.call(tr.children, function (c) { var a = c.querySelector('a[href]'); return { content: t(textoLimpo(c)), colSpan: +c.getAttribute('colspan') || 1, link: a ? P.linkDoc(a.getAttribute('href')) : null, grp: tr.classList.contains('grp'), tot: /\btot\b/.test(tr.className) }; }); };
      var head = cabTr ? [celulas(cabTr)] : [], body = linhas.filter(function (tr) { return tr !== cabTr; }).map(celulas);
      var ncol = Math.max.apply(null, body.concat(head).map(function (r) { return r.reduce(function (a, c) { return a + c.colSpan; }, 0); }));
      var numerica = [];   // coluna numérica (maioria das células é número) → alinhada à direita
      for (var j = 0; j < ncol; j++) {
        var cel = body.filter(function (r) { return r.length === ncol && r[j] && r[j].content; }).map(function (r) { var c = celula(r[j].content); return c && c.t === 'n'; });
        numerica[j] = j > 0 && cel.length > 0 && cel.filter(Boolean).length >= cel.length * 0.6;
      }
      cabe(14);
      doc.autoTable({
        head: head, body: body, startY: y, margin: { left: M, right: M, top: TOPO, bottom: 297 - FUNDO }, theme: 'plain',
        styles: { font: 'helvetica', fontSize: ncol > 7 ? 6.6 : 7.6, cellPadding: { top: 1.1, bottom: 1.1, left: 1.4, right: 1.4 }, textColor: TXT, lineColor: [225, 229, 223], lineWidth: { bottom: 0.15 }, overflow: 'linebreak' },
        headStyles: { fontStyle: 'bold', fillColor: [245, 247, 244], textColor: TXT },
        columnStyles: { 0: { halign: 'left', cellWidth: ncol > 3 ? Math.min(70, W * 0.38) : 'auto' } },
        didParseCell: function (d) {
          var raw = d.cell.raw || {};
          d.cell.styles.halign = numerica[d.column.index] ? 'right' : 'left';
          if (raw.grp) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [238, 242, 236]; d.cell.styles.halign = 'left'; }
          if (raw.tot) d.cell.styles.fontStyle = 'bold';
          if (raw.link) d.cell.styles.textColor = VERDE;
        },
        didDrawCell: function (d) { var raw = d.cell.raw || {}; if (raw.link && d.section === 'body') doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: raw.link }); }
      });
      y = doc.lastAutoTable.finalY + 4;
    }
    function kpis(grade) {
      var cards = Array.prototype.filter.call(grade.children, visivelPdf); if (!cards.length) return;
      var n = 3, gap = 3, w = (W - gap * (n - 1)) / n, h = 17;
      cards.forEach(function (k, i) {
        if (i % n === 0) { if (i) y += h + gap; cabe(h); }
        var x = M + (i % n) * (w + gap), kl = k.querySelector('.kl'), kv = k.querySelector('.kv'), resto = k.cloneNode(true);
        Array.prototype.forEach.call(resto.querySelectorAll('.kl, .kv, svg, .info, .chart'), function (q) { q.remove(); });
        doc.setDrawColor(225, 229, 223); doc.setFillColor(245, 247, 244); doc.roundedRect(x, y, w, h, 2, 2, 'FD');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor.apply(doc, CINZA); doc.text(doc.splitTextToSize(t(textoLimpo(kl) || ''), w - 4)[0] || '', x + 2.2, y + 4.2);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor.apply(doc, TXT); doc.text(t(textoLimpo(kv)), x + 2.2, y + 10.4);
        var c = t(textoLimpo(resto)); if (c) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4); doc.setTextColor.apply(doc, CINZA); doc.text(doc.splitTextToSize(c, w - 4)[0], x + 2.2, y + 14.6); }
      });
      y += h + 4;
    }
    function grafico(el, img) {
      var leg = el.querySelector('.legend');
      var alt = W * img.h / img.w, alturaMax = 105;
      var larg = alt > alturaMax ? W * alturaMax / alt : W; alt = Math.min(alt, alturaMax);
      cabe(alt + (leg ? 6 : 0) + 2);
      if (leg) {
        var x = M; doc.setFont('helvetica', 'normal'); doc.setFontSize(7.4);
        Array.prototype.forEach.call(leg.children, function (s) {
          var cor = rgb(getComputedStyle(s.querySelector('i') || s).backgroundColor), nome = t(s.textContent), lw = doc.getTextWidth(nome) + 7;
          if (x + lw > M + W) { x = M; y += 4.2; }
          doc.setFillColor.apply(doc, cor); doc.rect(x, y + 0.9, 2.6, 2.6, 'F'); doc.setTextColor.apply(doc, TXT); doc.text(nome, x + 3.6, y + 3.3); x += lw;
        });
        y += 5.6;
      }
      doc.addImage(img.url, 'PNG', M, y, larg, alt, undefined, 'FAST'); y += alt + 4;
    }
    function bloco(el) {
      if (!visivelPdf(el)) return;
      var tag = el.tagName, cls = el.classList;
      if (/^(BUTTON|SELECT|INPUT|LABEL|SCRIPT|STYLE|NAV)$/.test(tag) || cls.contains('controls') || cls.contains('subnav') || cls.contains('seg') || cls.contains('info') || cls.contains('mda-lado') || cls.contains('legend')) return;
      if (tag === 'H1' || tag === 'H2') { var s1 = textoLimpo(el); tarefas.push(function () { y += 2; cabe(14); texto(s1, { tam: tag === 'H1' ? 13.5 : 11.5, negrito: true, cor: ESC, depois: 1.2 }); }); return; }
      if (tag === 'H3' || tag === 'H4') { var s3 = textoLimpo(el); tarefas.push(function () { cabe(12); texto(s3, { tam: 10.5, negrito: true, cor: VERDE, depois: 1 }); }); return; }
      if (tag === 'TABLE') { tarefas.push(function () { tabela(el); }); return; }
      if (cls.contains('chart')) { var sv = el.querySelector('svg'); if (sv) tarefas.push(function () { return svgPng(sv).then(function (img) { grafico(el, img); }); }); else { var f = el.querySelector('.fail'); if (f) tarefas.push(function () { texto(textoLimpo(f), { tam: 8.5, italico: true, cor: CINZA }); }); } return; }
      if (cls.contains('kpis')) return tarefas.push(function () { kpis(el); });
      if (cls.contains('card')) {   // título, nota e gráfico/tabela do cartão na mesma página, quando cabem
        var est = 0, svg = el.querySelector('.chart svg'), tb = el.querySelector('table');
        if (svg) { var rr = svg.getBoundingClientRect(); est += Math.min(105, W * rr.height / Math.max(1, rr.width)) + 24; }
        if (tb) est += 12 + tb.querySelectorAll('tr').length * 5.2;
        if (est && est < FUNDO - TOPO) tarefas.push(function () { cabe(est); });
      }
      if (tag === 'UL' || tag === 'OL') { Array.prototype.forEach.call(el.children, function (li) { if (visivelPdf(li)) { var c = textoLimpo(li); tarefas.push(function () { texto(c, { recuo: 4, marcador: true, depois: 0.8 }); }); } }); tarefas.push(function () { y += 1; }); return; }
      if (tag === 'P' || tag === 'BLOCKQUOTE' || !el.querySelector('div, p, table, h1, h2, h3, h4, ul, ol, svg, section')) {
        var s = textoLimpo(el); if (!s) return;
        var nota = cls.contains('note') || tag === 'SMALL';
        return tarefas.push(function () { texto(s, { tam: nota ? 7.8 : 9.5, cor: nota ? CINZA : TXT, italico: tag === 'BLOCKQUOTE' }); });
      }
      Array.prototype.forEach.call(el.children, bloco);
    }
    Array.prototype.forEach.call(pg.el.children, bloco);
    return tarefas.reduce(function (pr, f) { return pr.then(function () { return f(); }); }, Promise.resolve()).then(function () {
      y += 3; texto('Fontes: documentos arquivados na CVM (DFP, ITR, releases, Formulário de Referência e comunicados) e cotações da B3. Painel independente construído com informações públicas; não é publicação oficial da Vibra Energia S.A. nem recomendação de investimento. Confira os valores nos documentos originais.', { tam: 7, cor: CINZA });
      texto(location.href, { tam: 7, cor: VERDE });
      var tot = doc.internal.getNumberOfPages();
      for (var i = 1; i <= tot; i++) {
        doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, CINZA);
        doc.text(t('Vibra em Números — ' + pg.titulo + (periodoTexto() ? ' · ' + P.rotulo(S.a) : '')), M, 297 - 8);
        doc.text('página ' + i + ' de ' + tot, 210 - M, 297 - 8, { align: 'right' });
      }
      return doc;
    });
  }

  P.exportaPdf = function () {
    var LARG = 760, pg = P.paginas[S.aba], raiz = document.documentElement;
    aviso('Gerando o PDF…');
    var volta = function () { raiz.classList.remove('modo-pdf'); raiz.style.removeProperty('--larg-pdf'); P.render(); };
    return carrega('vendor/jspdf.umd.min.js').then(function () { return carrega('vendor/jspdf.plugin.autotable.min.js'); }).then(function () {
      // redesenha a aba em largura de página e com o tema claro (gráficos proporcionais à folha)
      raiz.classList.add('modo-pdf'); raiz.style.setProperty('--larg-pdf', LARG + 'px');
      P.render();
      return new Promise(function (ok) { setTimeout(ok, 350); });
    }).then(function () { return montaPdf(pg); })
      .then(function (doc) { volta(); doc.save(nomeArquivo('pdf')); aviso(''); })
      .catch(function (e) { volta(); aviso('Não foi possível gerar o PDF (' + (e && e.message || e) + ').'); setTimeout(function () { aviso(''); }, 6000); });
  };

  // barra com os dois botões, logo abaixo das abas (aparece em todas)
  P.barraExportar = function () {
    var b = P.$('exportar'); if (!b || b.childNodes.length) return;
    b.append(h('span', { class: 'exp-t' }, 'Baixar esta aba'),
      h('button', { type: 'button', class: 'btn', onclick: function () { P.exportaPdf(); } }, 'PDF'),
      h('button', { type: 'button', class: 'btn', onclick: function () { P.exportaExcel(); } }, 'Excel'));
  };
})();
