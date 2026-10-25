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
  function textoLimpo(el) {
    if (!el) return '';
    var c = el.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('.info, button, .no-pdf'), function (x) { x.remove(); });
    return c.textContent.replace(/\s+/g, ' ').trim();
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
  // O SVG dos gráficos usa classes e variáveis de CSS; a captura precisa delas escritas em cada elemento.
  var PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'paint-order', 'stroke-linejoin', 'visibility'];
  function fixaSvg(orig, copia) {
    var a = orig.querySelectorAll('svg, svg *'), b = copia.querySelectorAll('svg, svg *');
    for (var i = 0; i < a.length && i < b.length; i++) {
      var cs = getComputedStyle(a[i]), st = [];
      PROPS.forEach(function (p) { var v = cs.getPropertyValue(p); if (v) st.push(p + ':' + v); });
      b[i].setAttribute('style', st.join(';'));
      if (b[i].tagName.toLowerCase() === 'svg') {
        var r = a[i].getBoundingClientRect();
        b[i].setAttribute('width', Math.round(r.width)); b[i].setAttribute('height', Math.round(r.height));
      }
    }
  }

  P.exportaPdf = function () {
    var LARG = 725,   // largura útil da folha A4 com margens de 9 mm, em px (o html2pdf diagrama nessa largura)
       pg = P.paginas[S.aba], doc = document.documentElement;
    aviso('Gerando o PDF…');
    var volta = function () { doc.classList.remove('modo-pdf'); doc.style.removeProperty('--larg-pdf'); P.render(); };
    return carrega('vendor/html2pdf.bundle.min.js').then(function () {
      // desenha a aba em largura de página, com o tema claro
      doc.classList.add('modo-pdf'); doc.style.setProperty('--larg-pdf', LARG + 'px');
      P.render();
      return new Promise(function (ok) { setTimeout(ok, 450); });
    }).then(function () {
      var folha = h('div', { class: 'pdf-folha' });
      folha.style.width = LARG + 'px';
      folha.appendChild(h('div', { class: 'pdf-cab' },
        h('div', { class: 'pdf-tit' }, 'Vibra em Números — ' + pg.titulo),
        periodoTexto() ? h('div', { class: 'pdf-per' }, periodoTexto()) : null,
        h('div', { class: 'pdf-take' }, textoLimpo(P.$('take'))),
        h('div', { class: 'pdf-sub' }, textoLimpo(P.$('sub')) + ' · gerado em ' + agora())));
      var copia = pg.el.cloneNode(true);
      copia.hidden = false; copia.removeAttribute('id');
      fixaSvg(pg.el, copia);
      Array.prototype.forEach.call(copia.querySelectorAll('.no-pdf, button.info, .tip, .pop'), function (x) { x.remove(); });
      folha.appendChild(copia);
      folha.appendChild(h('div', { class: 'pdf-rod' }, 'Fontes: documentos arquivados na CVM (DFP, ITR, releases, Formulário de Referência e comunicados) e cotações da B3. Painel independente com informações públicas; não é publicação oficial da Vibra Energia S.A. nem recomendação de investimento. ' + location.href));
      document.body.appendChild(folha);
      var opt = {
        margin: [10, 9, 12, 9], filename: nomeArquivo('pdf'),
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: LARG, width: LARG, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.card', '.kpi', 'tr', 'h2', 'h3', 'li', 'p', 'blockquote', '.pdf-cab'] }
      };
      return window.html2pdf().set(opt).from(folha).toPdf().get('pdf').then(function (pdf) {
        var tot = pdf.internal.getNumberOfPages();
        for (var i = 1; i <= tot; i++) {
          pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(120);
          pdf.text('Vibra em Números — ' + pg.titulo + '  ·  página ' + i + ' de ' + tot, 105, 292, { align: 'center' });
        }
      }).save().then(function () { folha.remove(); });
    }).then(function () { volta(); aviso(''); })
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
