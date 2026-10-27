/* Gráficos em SVG (d3) usados pelo painel: barras, linhas, barras empilhadas e cascata. */
(function (raiz) {
  'use strict';
  var d3 = raiz.d3;
  var C = function (i) { return getComputedStyle(document.documentElement).getPropertyValue('--c' + i).trim(); };

  function tipo(el) {
    var t = document.createElement('div'); t.className = 'tip'; t.hidden = true; el.appendChild(t);
    return {
      show: function (rows, e) {
        t.replaceChildren();
        rows.forEach(function (r) { var d = document.createElement('div'), s = document.createElement('span'); s.textContent = r[0]; d.appendChild(s); if (r[1] != null) { var b = document.createElement('b'); b.textContent = r[1]; d.appendChild(b); } t.appendChild(d); });
        t.hidden = false; var q = d3.pointer(e, el);
        t.style.left = Math.max(0, Math.min(el.clientWidth - t.offsetWidth, q[0] + 12)) + 'px';
        t.style.top = Math.max(0, q[1] - t.offsetHeight - 8) + 'px';
      }, hide: function () { t.hidden = true; }
    };
  }
  function legenda(el, itens) {
    var d = document.createElement('div'); d.className = 'legend';
    itens.forEach(function (i) { var s = document.createElement('span'), k = document.createElement('i'); k.style.background = i[1]; s.append(k, i[0]); d.appendChild(s); });
    el.appendChild(d);
  }
  function largura(svg, strs) { var t = svg.append('text').attr('class', 'tick').style('visibility', 'hidden'), m = 0; strs.forEach(function (s) { t.text(s); m = Math.max(m, t.node().getComputedTextLength()); }); t.remove(); return m; }
  // quebra um rótulo em até n linhas que caibam em larg px (a última com reticências se precisar)
  function quebra(svg, texto, larg, n) {
    var t = svg.append('text').attr('class', 'tick').style('visibility', 'hidden'), w = function (s) { t.text(s); return t.node().getComputedTextLength(); };
    var pal = String(texto).split(/\s+/), linhas = [], atual = '';
    pal.forEach(function (p) { var c = atual ? atual + ' ' + p : p; if (w(c) <= larg || !atual) atual = c; else { linhas.push(atual); atual = p; } });
    if (atual) linhas.push(atual);
    if (linhas.length > n) { linhas = linhas.slice(0, n); linhas[n - 1] += '…'; }
    linhas = linhas.map(function (l) { while (w(l) > larg && l.length > 2) l = l.slice(0, -2) + '…'; return l; });
    t.remove(); return linhas;
  }
  function falha(el, msg) { el.replaceChildren(); var d = document.createElement('div'); d.className = 'fail'; d.textContent = msg || 'Sem dados para o período selecionado'; el.appendChild(d); }
  function rotulosX(labels, W) { var passo = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(W / 36)))); return labels.filter(function (_, i) { return (labels.length - 1 - i) % passo === 0; }); }

  // folga acima/abaixo para os rótulos de valor
  function folga(lo, hi, f) { var r = (hi - lo) || Math.abs(hi) || 1; return [lo < 0 ? lo - r * f * 0.6 : lo, hi > 0 ? hi + r * f : hi]; }
  // rótulos de valor em pontos sem sobreposição: mantém o destaque e o último, depois os demais com espaçamento mínimo
  function escolhe(pts, xpos, larg, destaque) {
    var ord = pts.map(function (d, i) { return i; }).sort(function (a, b) {
      var pa = (pts[a].l === destaque ? 2 : 0) + (a === pts.length - 1 ? 1 : 0), pb = (pts[b].l === destaque ? 2 : 0) + (b === pts.length - 1 ? 1 : 0);
      return pb - pa || b - a;
    }), ok = [];
    ord.forEach(function (i) { var x0 = xpos(pts[i]); if (ok.every(function (j) { return Math.abs(xpos(pts[j]) - x0) >= larg; })) ok.push(i); });
    return pts.filter(function (_, i) { return ok.indexOf(i) >= 0; });
  }

  // eixo de períodos (trimestres, semestres, 9 meses, anos): todos os rótulos aparecem; se não couberem numa linha, quebram em duas
  var RX_PER = /^(?:[1-4]T|[12]S|9M)\d{2}\*?$|^\d{4}\*?(?: \(prev\.\))?$/;
  function ehPeriodo(labels) { return labels.length > 0 && labels.every(function (l) { return RX_PER.test(String(l)); }); }
  function partesPeriodo(l) {
    var m = /^((?:[1-4]T|[12]S|9M))(\d{2})(\*?)$/.exec(l); if (m) return [m[1], m[2] + m[3]];
    m = /^(\d{2})(\d{2})(\*?)(.*)$/.exec(l); return m ? ["'" + m[2] + m[3], m[4].trim()] : [l, ''];
  }
  function base(el, labels, ymin, ymax, fmt, h) {
    var W = el.clientWidth || 300, H = h || 230, m = { t: 16, r: 8, b: 26, l: 40 };
    var svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img');
    var per = ehPeriodo(labels), duas = false;
    if (per) { var slot = (W - 56) / Math.max(1, labels.length); duas = largura(svg, labels) + 4 > slot; if (duas) m.b = 36; }
    var y = d3.scaleLinear([ymin, ymax === ymin ? ymin + 1 : ymax], [H - m.b, m.t]).nice(4), tk = y.ticks(4);
    m.l = largura(svg, tk.map(fmt)) + 10;
    var x = d3.scaleBand(labels, [m.l, W - m.r]).padding(0.3);
    svg.append('g').selectAll('line').data(tk).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--grid)');
    svg.append('g').selectAll('text').data(tk).join('text').attr('class', 'tick').attr('x', m.l - 6).attr('y', function (d) { return y(d) + 4; }).attr('text-anchor', 'end').text(fmt);
    if (ymin < 0) svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--muted)');
    if (!per) svg.append('g').selectAll('text').data(rotulosX(labels, W - m.l)).join('text').attr('class', 'tick').attr('x', function (d) { return x(d) + x.bandwidth() / 2; }).attr('y', H - 8).attr('text-anchor', 'middle').text(function (d) { return d; });
    else labels.forEach(function (l) {
      var t = svg.append('text').attr('class', 'tick').attr('text-anchor', 'middle').attr('x', x(l) + x.bandwidth() / 2).attr('y', duas ? H - 20 : H - 8);
      if (!duas) { t.text(l); return; }
      var pp = partesPeriodo(l); t.text(pp[0]);
      if (pp[1]) svg.append('text').attr('class', 'tick').attr('text-anchor', 'middle').attr('x', x(l) + x.bandwidth() / 2).attr('y', H - 8).text(pp[1]);
    });
    return { svg: svg, x: x, y: y, W: W, H: H, m: m, per: per };
  }

  function barras(el, labels, vals, nome, fmt, opt) {
    fmt = fmt || String; opt = opt || {};
    el.replaceChildren();
    var pts = labels.map(function (l, i) { return { l: l, v: vals[i] }; }).filter(function (d) { return d.v != null; });
    if (!pts.length) return falha(el);
    var nums = pts.map(function (d) { return d.v; }), estreito = ((el.clientWidth || 300) - 50) / labels.length * 0.7 < 34;
    var lim = folga(Math.min(0, d3.min(nums)), Math.max(0, d3.max(nums)), estreito ? 0.32 : 0.1);
    var g = base(el, labels, lim[0], lim[1], fmt), tp = tipo(el);
    g.svg.append('g').selectAll('rect').data(pts).join('rect')
      .attr('x', function (d) { return g.x(d.l); }).attr('width', g.x.bandwidth()).attr('rx', 3)
      .attr('y', function (d) { return Math.min(g.y(d.v), g.y(0)); }).attr('height', function (d) { return Math.max(1, Math.abs(g.y(d.v) - g.y(0))); })
      .attr('fill', function (d) { return d.v >= 0 ? C(1) : C('neg'); })
      .attr('opacity', function (d) { return opt.destaque && d.l !== opt.destaque ? 0.4 : 1; })
      .on('pointermove', function (e, d) { tp.show([[d.l, null], [nome, fmt(d.v)]], e); }).on('pointerleave', tp.hide);
    if (g.x.bandwidth() > 34) g.svg.append('g').selectAll('text').data(pts).join('text').attr('class', 'val').attr('text-anchor', 'middle')
      .attr('x', function (d) { return g.x(d.l) + g.x.bandwidth() / 2; }).attr('y', function (d) { return d.v >= 0 ? g.y(d.v) - 4 : g.y(d.v) + 12; }).text(function (d) { return fmt(d.v); });
    else g.svg.append('g').selectAll('text').data(pts).join('text').attr('class', 'val')   // barras estreitas: rótulo na vertical
      .attr('text-anchor', function (d) { return d.v >= 0 ? 'start' : 'end'; })
      .attr('transform', function (d) { return 'translate(' + (g.x(d.l) + g.x.bandwidth() / 2 + 3.5) + ',' + (d.v >= 0 ? g.y(d.v) - 3 : g.y(d.v) + 3) + ') rotate(-90)'; })
      .text(function (d) { return fmt(d.v); });
  }

  // posiciona rótulos de valor sem encavalar: para cada ponto testa posições acima/abaixo em níveis crescentes e escolhe a de
  // menor penalidade (sobre outro rótulo > sobre um ponto > cruzando uma linha > distância do ponto); nunca sai da área do gráfico
  function posicionaRotulos(g, itens, linhasXY) {
    var postos = [], topo = 2, piso = g.H - g.m.b - 2;
    var yLinha = function (pts, x) {
      for (var k = 0; k < pts.length - 1; k++) { var a = pts[k], b = pts[k + 1]; if (x >= a[0] && x <= b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) || 1); }
      return null;
    };
    var med = g.svg.append('text').attr('class', 'val').style('visibility', 'hidden');
    itens.forEach(function (d) {
      med.text(d.t); var w = med.node().getComputedTextLength() + 6, melhor = null;
      d.xr = Math.max(w / 2 + 1, Math.min(g.W - w / 2 - 1, d.x));   // não sai pelas laterais
      var xr = d.xr;
      for (var lev = 0; lev < 10; lev++) {
        [d.acima, !d.acima].forEach(function (cima, lado) {
          var base = cima ? d.y - 6 - lev * 12 : d.y + 14 + lev * 12, y0 = base - 10, y1 = base + 3;
          if (y0 < topo || y1 > piso) return;
          var pen = lev * 2 + lado * 3;
          postos.forEach(function (q) { if (Math.abs(q.x - xr) < (q.w + w) / 2 + 1 && y0 < q.y1 + 1 && y1 > q.y0 - 1) pen += 1000; });
          d.pontos.forEach(function (p) { if (Math.abs(p[0] - xr) < w / 2 + 2 && p[1] > y0 - 3 && p[1] < y1 + 3) pen += 200; });
          linhasXY.forEach(function (pts) { [-w / 2, 0, w / 2].forEach(function (dx) { var yl = yLinha(pts, xr + dx); if (yl != null && yl > y0 - 1 && yl < y1 + 1) pen += 15; }); });
          if (!melhor || pen < melhor.pen) melhor = { pen: pen, base: base, y0: y0, y1: y1 };
        });
      }
      if (!melhor) melhor = { base: Math.max(topo + 9, Math.min(piso - 2, d.y - 6)), y0: 0, y1: 0 };
      postos.push({ x: xr, w: w, y0: melhor.y0, y1: melhor.y1 });
      d.yRot = melhor.base;
    });
    med.remove();
  }

  function linhas(el, labels, series, fmt, opt) {
    el.replaceChildren(); opt = opt || {};
    var todos = []; series.forEach(function (s) { s.vals.forEach(function (v) { if (v != null) todos.push(v); }); });
    if (!todos.length) return falha(el);
    legenda(el, series.map(function (s, i) { return [s.nome, C(i + 1)]; }));
    // eixo de períodos: valor em todos os pontos de todas as séries (opt.semValores desliga); séries mensais: só alguns pontos
    var todosVal = !opt.semValores && (opt.todosValores || ehPeriodo(labels));
    var lim = folga(Math.min(0, d3.min(todos)), Math.max(0, d3.max(todos)), todosVal ? 0.18 + 0.06 * series.length : 0.12);
    // altura conforme a densidade: quantos níveis de rótulo cada série precisa para não encavalar na largura disponível
    var wRot = d3.max(todos, function (v) { return fmt(v).length; }) * 6 + 8, slot = ((el.clientWidth || 300) - 60) / Math.max(1, labels.length);
    var niveis = todosVal ? Math.max(1, Math.ceil(wRot / slot)) : 1;
    var H = todosVal ? 220 + 30 * Math.max(0, series.length - 1) + (niveis > 1 ? series.length * niveis * 13 : 0) : null;
    var g = base(el, labels, lim[0], lim[1], fmt, H), tp = tipo(el), cx = function (l) { return g.x(l) + g.x.bandwidth() / 2; };
    var rot = g.svg.append('g'), linhasXY = [], itens = [];
    series.forEach(function (s, i) {
      var pts = labels.map(function (l, k) { return { l: l, v: s.vals[k] }; }).filter(function (d) { return d.v != null; });
      g.svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', C(i + 1)).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
        .attr('d', d3.line().x(function (d) { return cx(d.l); }).y(function (d) { return g.y(d.v); }));
      linhasXY.push(pts.map(function (d) { return [cx(d.l), g.y(d.v)]; }));
      if (pts.length) { var u = pts[pts.length - 1]; g.svg.append('circle').attr('cx', cx(u.l)).attr('cy', g.y(u.v)).attr('r', 3.5).attr('fill', C(i + 1)); }
      if (!pts.length || opt.semValores) return;
      var larg = d3.max(pts, function (d) { return fmt(d.v).length; }) * 5.6 + 6;
      var marcados = todosVal ? pts : escolhe(pts, function (d) { return cx(d.l); }, larg, opt.destaque);
      if (!todosVal && series.length > 2 && i > 0) return;
      marcados.forEach(function (d) {
        g.svg.append('circle').attr('cx', cx(d.l)).attr('cy', g.y(d.v)).attr('r', 2.2).attr('fill', C(i + 1));
        var k = labels.indexOf(d.l), outros = series.map(function (q, j) { return j !== i ? q.vals[k] : null; }).filter(function (x) { return x != null; });
        var acima = !outros.length ? !(i === 1 && series.length === 2) : d.v >= d3.max(outros) ? true : d.v <= d3.min(outros) ? false : i % 2 === 0;
        itens.push({ i: i, x: cx(d.l), y: g.y(d.v), t: fmt(d.v), acima: acima, destaque: d.l === opt.destaque });
      });
    });
    if (itens.length) {
      var todosPts = []; linhasXY.forEach(function (ps) { ps.forEach(function (p) { todosPts.push(p); }); });
      itens.forEach(function (d) { d.pontos = todosPts.filter(function (p) { return !(Math.abs(p[0] - d.x) < 0.5 && Math.abs(p[1] - d.y) < 0.5); }); });
      // prioridade: período em destaque, último período, depois da direita para a esquerda
      itens.sort(function (a, b) { return (b.destaque - a.destaque) || (b.x - a.x) || (a.i - b.i); });
      posicionaRotulos(g, itens, linhasXY);
      itens.forEach(function (d) { rot.append('text').attr('class', 'val').attr('text-anchor', 'middle').attr('x', d.xr).attr('y', d.yRot).attr('fill', C(d.i + 1)).style('fill', C(d.i + 1)).text(d.t); });
    }
    rot.raise();
    if (opt.destaque && labels.indexOf(opt.destaque) >= 0) g.svg.insert('rect', ':first-child').attr('x', g.x(opt.destaque)).attr('width', g.x.bandwidth()).attr('y', g.m.t).attr('height', g.H - g.m.t - g.m.b).attr('fill', 'var(--hl)');
    var foco = g.svg.append('line').attr('y1', g.m.t).attr('y2', g.H - g.m.b).attr('stroke', 'var(--muted)').attr('stroke-dasharray', '3 3').attr('visibility', 'hidden');
    g.svg.append('rect').attr('x', g.m.l).attr('y', g.m.t).attr('width', g.W - g.m.l - g.m.r).attr('height', g.H - g.m.t - g.m.b).attr('fill', 'transparent')
      .on('pointermove', function (e) {
        var xp = d3.pointer(e, g.svg.node())[0], i = Math.max(0, Math.min(labels.length - 1, Math.round((xp - g.m.l - g.x.bandwidth() / 2) / g.x.step())));
        foco.attr('x1', cx(labels[i])).attr('x2', cx(labels[i])).attr('visibility', 'visible');
        tp.show([[labels[i], null]].concat(series.map(function (s) { return [s.nome, fmt(s.vals[i])]; })), e);
      }).on('pointerleave', function () { tp.hide(); foco.attr('visibility', 'hidden'); });
  }

  function empilhado(el, labels, series, marcador, fmt) {
    fmt = fmt || String;
    el.replaceChildren();
    legenda(el, series.map(function (s, i) { return [s.nome, C(i + 1)]; }).concat(marcador ? [[marcador.nome, 'var(--fg)']] : []));
    var tot = labels.map(function (l, i) { return series.reduce(function (a, s) { return a + Math.max(0, s.vals[i] || 0); }, 0); });
    var mv = marcador ? marcador.vals.filter(function (v) { return v != null; }) : [];
    if (!d3.max(tot) && !mv.length) return falha(el);
    var estreitoE = ((el.clientWidth || 300) - 50) / labels.length * 0.7 < 34;
    var limE = folga(Math.min(0, d3.min(mv.concat([0]))), Math.max(1, d3.max(tot), d3.max(mv.concat([0]))), estreitoE ? 0.3 : 0.1);
    var g = base(el, labels, limE[0], limE[1], fmt, 290), tp = tipo(el);
    labels.forEach(function (l, i) {
      var acc = 0;
      series.forEach(function (s, k) {
        var v = Math.max(0, s.vals[i] || 0); if (!v) return;
        g.svg.append('rect').attr('x', g.x(l)).attr('width', g.x.bandwidth()).attr('y', g.y(acc + v)).attr('height', Math.max(1, g.y(acc) - g.y(acc + v))).attr('fill', C(k + 1)).attr('rx', 2)
          .on('pointermove', function (e) { tp.show([[l, null]].concat(series.map(function (q) { return [q.nome, fmt(q.vals[i])]; })).concat(marcador ? [[marcador.nome, fmt(marcador.vals[i])]] : []), e); }).on('pointerleave', tp.hide);
        acc += v;
      });
    });
    // valor de cada coluna (o do marcador, se houver: ex. EBITDA consolidado) acima da pilha e do marcador, sem cobrir nenhum dos dois
    labels.forEach(function (l, i) {
      var mvi = marcador ? marcador.vals[i] : null, val = mvi != null ? mvi : tot[i];
      if (!val && !tot[i]) return;
      var xc = g.x(l) + g.x.bandwidth() / 2, topo = Math.min(g.y(tot[i] || 0), mvi != null ? g.y(mvi) - 5 : Infinity, g.y(0)), yt = topo - 4;
      if (g.x.bandwidth() > 34) g.svg.append('text').attr('class', 'val').attr('text-anchor', 'middle').attr('x', xc).attr('y', yt).text(fmt(val));
      else g.svg.append('text').attr('class', 'val').attr('text-anchor', 'start').attr('transform', 'translate(' + (xc + 3.5) + ',' + yt + ') rotate(-90)').text(fmt(val));
    });
    if (marcador) {
      var pts = labels.map(function (l, i) { return { l: l, v: marcador.vals[i] }; }).filter(function (d) { return d.v != null; });
      g.svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', function (d) { return g.x(d.l) + g.x.bandwidth() / 2; }).attr('cy', function (d) { return g.y(d.v); }).attr('r', 4.5).attr('fill', 'var(--bg)').attr('stroke', 'var(--fg)').attr('stroke-width', 2)
        .on('pointermove', function (e, d) { tp.show([[d.l, null], [marcador.nome, fmt(d.v)]], e); }).on('pointerleave', tp.hide);
    }
  }

  // cascata: valor inicial, contribuições e valor final
  function cascata(el, inicio, passos, fim, fmt) {
    fmt = fmt || String;
    el.replaceChildren();
    var itens = [{ l: inicio.rot, ini: 0, fim: inicio.v, tipo: 'tot' }], acc = inicio.v;
    passos.forEach(function (p) { itens.push({ l: p.rot, ini: acc, fim: acc + p.v, tipo: p.v >= 0 ? 'up' : 'down', v: p.v }); acc += p.v; });
    itens.push({ l: fim.rot, ini: 0, fim: fim.v, tipo: 'tot' });
    var lo = Math.min(0, d3.min(itens, function (d) { return Math.min(d.ini, d.fim); })), hi = Math.max(0, d3.max(itens, function (d) { return Math.max(d.ini, d.fim); }));
    var W = el.clientWidth || 300, H = 270, m = { t: 12, r: 8, b: 74, l: 40 };
    var svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img');
    var y = d3.scaleLinear([lo, hi === lo ? lo + 1 : hi], [H - m.b, m.t]).nice(4), tk = y.ticks(4);
    m.l = largura(svg, tk.map(fmt)) + 10;
    var x = d3.scaleBand(itens.map(function (d) { return d.l; }), [m.l, W - m.r]).padding(0.25), tp = tipo(el);
    svg.append('g').selectAll('line').data(tk).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--grid)');
    svg.append('g').selectAll('text').data(tk).join('text').attr('class', 'tick').attr('x', m.l - 6).attr('y', function (d) { return y(d) + 4; }).attr('text-anchor', 'end').text(fmt);
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--muted)');
    svg.append('g').selectAll('rect').data(itens).join('rect').attr('x', function (d) { return x(d.l); }).attr('width', x.bandwidth()).attr('rx', 2)
      .attr('y', function (d) { return y(Math.max(d.ini, d.fim)); }).attr('height', function (d) { return Math.max(1, Math.abs(y(d.ini) - y(d.fim))); })
      .attr('fill', function (d) { return d.tipo === 'tot' ? C(2) : d.tipo === 'up' ? C(1) : C('neg'); })
      .on('pointermove', function (e, d) { tp.show([[d.l, null], [d.tipo === 'tot' ? 'Valor' : 'Variação', fmt(d.tipo === 'tot' ? d.fim : d.v)]], e); }).on('pointerleave', tp.hide);
    svg.append('g').selectAll('text').data(itens).join('text').attr('class', 'val').attr('text-anchor', 'middle').attr('x', function (d) { return x(d.l) + x.bandwidth() / 2; })
      .attr('y', function (d) { return y(Math.max(d.ini, d.fim)) - 4; }).text(function (d) { return fmt(d.tipo === 'tot' ? d.fim : d.v); });
    // rótulos inclinados (nomes longos)
    svg.append('g').selectAll('text').data(itens).join('text').attr('class', 'tick').attr('text-anchor', 'end')
      .attr('transform', function (d) { return 'translate(' + (x(d.l) + x.bandwidth() / 2 + 4) + ',' + (H - m.b + 12) + ') rotate(-35)'; }).text(function (d) { return d.l.length > 24 ? d.l.slice(0, 23) + '…' : d.l; });
  }


  // ponte horizontal (uma linha por etapa: legível no celular). passos: [{rot, v, sub?, outros?}]; opt.reduzBom: queda em verde (dívida)
  function ponte(el, inicio, passos, fim, fmt, opt) {
    fmt = fmt || String; opt = opt || {}; el.replaceChildren();
    if (!inicio || !fim || inicio.v == null || fim.v == null) return falha(el);
    var itens = [{ l: inicio.rot, ini: 0, fim: inicio.v, tipo: 'tot' }], acc = inicio.v;
    passos.forEach(function (p) {
      if (p.sub) { itens.push({ l: p.rot, ini: 0, fim: acc, tipo: 'sub' }); return; }
      itens.push({ l: p.rot, ini: acc, fim: acc + p.v, v: p.v, tipo: p.v >= 0 ? 'up' : 'down', outros: p.outros }); acc += p.v;
    });
    itens.push({ l: fim.rot, ini: 0, fim: fim.v, tipo: 'tot' });
    var W = el.clientWidth || 300, svg = d3.select(el).append('svg').attr('width', '100%').attr('role', 'img'), tp = tipo(el);
    var ml = Math.min(W * (W < 480 ? 0.42 : 0.38), largura(svg, itens.map(function (d) { return d.l; })) + 10);
    itens.forEach(function (d) { d.linhas = quebra(svg, d.l, ml - 8, 2); });
    var lin = itens.some(function (d) { return d.linhas.length > 1; }) ? 30 : 25, H = itens.length * lin + 22;
    var lo = Math.min(0, d3.min(itens, function (d) { return Math.min(d.ini, d.fim); })), hi = Math.max(0, d3.max(itens, function (d) { return Math.max(d.ini, d.fim); }));
    // quando os totais são muito maiores que as variações, o eixo começa perto do menor nível (marcado com ≈ nas barras de total)
    var niveis = []; itens.forEach(function (d) { if (d.tipo === 'up' || d.tipo === 'down') niveis.push(d.ini, d.fim); else niveis.push(d.fim); });
    var nmin = d3.min(niveis), corte = false;
    if (nmin > 0 && (hi - nmin) < 0.45 * hi) { lo = Math.max(0, nmin - (hi - nmin) * 0.35); corte = true; }
    svg.attr('viewBox', '0 0 ' + W + ' ' + (H + (corte ? 16 : 0)));
    var larguraVal = largura(svg, itens.map(function (d) { return fmt(d.tipo === 'up' || d.tipo === 'down' ? d.v : d.fim); })) + 8;
    var x = d3.scaleLinear([lo, hi === lo ? lo + 1 : hi], [ml + 4, W - larguraVal]);
    if (!corte) x.nice(4);
    var tks = x.ticks(W < 420 ? 3 : 5), ult = -1e9;
    x.tickValues = tks.filter(function (t) { var ok1 = x(t) - ult >= 58; if (ok1) ult = x(t); return ok1; });
    svg.append('g').selectAll('line').data(x.tickValues).join('line').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', H - 18).attr('stroke', 'var(--grid)');
    svg.append('g').selectAll('text').data(x.tickValues).join('text').attr('class', 'tick').attr('x', x).attr('y', H - 4).attr('text-anchor', 'middle').text(fmt);
    if (!corte) svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', H - 18).attr('stroke', 'var(--muted)');
    else svg.append('text').attr('class', 'tick').attr('x', W - 4).attr('y', H + 12).attr('text-anchor', 'end').style('font-style', 'italic').text('eixo não começa em zero');
    var cor = function (d) {
      if (d.tipo === 'tot') return C(2); if (d.tipo === 'sub') return C(3);
      var bom = opt.reduzBom ? d.tipo === 'down' : d.tipo === 'up';
      return bom ? C(1) : C('neg');
    };
    itens.forEach(function (d, i) {
      var y0 = 4 + i * lin, a = Math.max(lo, Math.min(d.ini, d.fim)), b = Math.max(d.ini, d.fim), val = d.tipo === 'up' || d.tipo === 'down' ? d.v : d.fim;
      var tx = svg.append('text').attr('class', 'tick').attr('x', ml - 4).attr('y', y0 + (d.linhas.length > 1 ? 8 : 13)).attr('text-anchor', 'end').style('font-weight', d.tipo === 'tot' ? 700 : null);
      d.linhas.forEach(function (l, k) { tx.append('tspan').attr('x', ml - 4).attr('dy', k ? 11 : 0).text(l); });
      svg.append('rect').attr('x', x(a)).attr('width', Math.max(1.5, x(b) - x(a))).attr('y', y0 + 2).attr('height', lin - 10).attr('rx', 2).attr('fill', cor(d))
        .attr('fill-opacity', d.outros ? 0.55 : 1)
        .on('pointermove', function (e) { tp.show([[d.l, null], [d.tipo === 'tot' || d.tipo === 'sub' ? 'Valor' : 'Efeito', fmt(val)]], e); }).on('pointerleave', tp.hide);
      if (corte && (d.tipo === 'tot' || d.tipo === 'sub')) {   // barra cortada: começa no início do eixo, não no zero
        svg.append('path').attr('d', 'M' + (x(lo) + 5) + ',' + (y0 + 1) + 'l4,' + (lin - 8) + 'M' + (x(lo) + 9) + ',' + (y0 + 1) + 'l4,' + (lin - 8)).attr('stroke', 'var(--bg)').attr('stroke-width', 2);
      }
      if (i < itens.length - 1) {   // conector até a próxima barra
        var nx = d.tipo === 'tot' || d.tipo === 'sub' ? d.fim : d.fim;
        svg.append('line').attr('x1', x(nx)).attr('x2', x(nx)).attr('y1', y0 + lin - 8).attr('y2', y0 + lin + 2).attr('stroke', 'var(--muted)').attr('stroke-dasharray', '2,2');
      }
      svg.append('text').attr('class', 'val').attr('x', x(b) + 4).attr('y', y0 + (lin - 10) / 2 + 6).attr('text-anchor', 'start').style('font-weight', d.tipo === 'tot' ? 700 : null)
        .text((d.tipo === 'up' ? '+' : '') + fmt(val));
    });
  }

  // composição em colunas empilhadas lado a lado (ex.: Ativo × Passivo e PL), rótulos ao lado com linha-guia
  function blocos(el, colunas, fmt) {
    fmt = fmt || String; el.replaceChildren();
    if (!colunas || !colunas.length) return falha(el);
    var W = el.clientWidth || 300, H = 400, topo = 26, base = H - 8, n = colunas.length, larg = Math.min(W / n, 330), cw = Math.max(34, Math.min(70, larg * 0.24));
    var svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img'), tp = tipo(el);
    var max = d3.max(colunas, function (c) { return c.total; }) || 1, y = d3.scaleLinear([0, max], [base, topo]);
    var pal = [['--c4', 1], ['--c1', 1], ['--c1', 0.7], ['--c1', 0.45], ['--c3', 1], ['--c2', 0.8], ['--c2', 0.55], ['--c3', 0.6]];
    colunas.forEach(function (c, k) {
      var x0 = k * larg + 4, acc = 0, rot = [];
      svg.append('text').attr('class', 'tick').attr('x', x0).attr('y', 14).style('font-weight', 700).style('fill', 'var(--fg)').text(c.nome + ' ' + fmt(c.total));
      c.partes.forEach(function (p, i) {
        if (!(p.v > 0)) { rot.push({ p: p, ym: null, i: i }); return; }
        var y1 = y(acc), y2 = y(acc + p.v), cor = p.cor || pal[i % pal.length];
        svg.append('rect').attr('x', x0).attr('width', cw).attr('y', y2).attr('height', Math.max(1, y1 - y2)).attr('fill', 'var(' + cor[0] + ')').attr('fill-opacity', cor[1])
          .attr('stroke', 'var(--bg)').attr('stroke-width', 1)
          .on('pointermove', function (e) { tp.show([[p.rot, null], ['Valor', fmt(p.v)], ['% do total', (p.v / c.total * 100).toFixed(1).replace('.', ',') + '%']], e); }).on('pointerleave', tp.hide);
        rot.push({ p: p, ym: (y1 + y2) / 2, i: i });
        acc += p.v;
      });
      // rótulos: do topo para a base, sem sobreposição (mínimo de 24 px entre eles)
      var xl = x0 + cw + 10, lw = larg - cw - 16;
      rot.forEach(function (r) { r.linhas = quebra(svg, r.p.rot, lw, 2); });
      var lista = rot.filter(function (r) { return r.ym !== null; }).sort(function (a, b) { return a.ym - b.ym; }), pos = [], minGap = lista.some(function (r) { return r.linhas.length > 1; }) ? 34 : 24;
      lista.forEach(function (r, j) { pos[j] = Math.max(r.ym, j ? pos[j - 1] + minGap : topo + 6); });
      for (var j = lista.length - 1; j >= 0; j--) { var lim = j === lista.length - 1 ? base - 4 : pos[j + 1] - minGap; if (pos[j] > lim) pos[j] = lim; }
      lista.forEach(function (r, j) {
        var nl = r.linhas.length, y0 = pos[j] - (nl - 1) * 5.5;
        svg.append('path').attr('d', 'M' + (x0 + cw) + ',' + r.ym + 'L' + (xl - 3) + ',' + pos[j]).attr('stroke', 'var(--muted)').attr('fill', 'none').attr('stroke-width', 0.8);
        var tx = svg.append('text').attr('class', 'tick').attr('x', xl).attr('y', y0 - 1).style('fill', 'var(--fg)');
        r.linhas.forEach(function (l, k) { tx.append('tspan').attr('x', xl).attr('dy', k ? 11 : 0).text(l); });
        svg.append('text').attr('class', 'tick').attr('x', xl).attr('y', y0 + nl * 11 - 1).text(fmt(r.p.v) + ' · ' + (r.p.v / c.total * 100).toFixed(1).replace('.', ',') + '%');
      });
    });
  }

  // A × B lado a lado, por item (barras agrupadas horizontais: legíveis no celular)
  function pares(el, itens, nomeA, nomeB, fmt) {
    fmt = fmt || String; el.replaceChildren();
    itens = itens.filter(function (d) { return d.a != null || d.b != null; });
    if (!itens.length) return falha(el);
    legenda(el, [[nomeA, C(1)], [nomeB, C(3)]]);
    var W = el.clientWidth || 300, lin = 34, H = itens.length * lin + 24, svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img'), tp = tipo(el);
    var ml = Math.min(W * 0.42, largura(svg, itens.map(function (d) { return d.rot; })) + 12), vs = []; itens.forEach(function (d) { vs.push(d.a || 0, d.b || 0); });
    var lo = Math.min(0, d3.min(vs)), hi = Math.max(0, d3.max(vs)), x = d3.scaleLinear([lo, hi === lo ? lo + 1 : hi], [ml, W - 60]);
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 4).attr('y2', H - 18).attr('stroke', 'var(--muted)');
    itens.forEach(function (d, i) {
      var y0 = 8 + i * lin;
      svg.append('text').attr('class', 'tick').attr('x', ml - 8).attr('y', y0 + 14).attr('text-anchor', 'end').text(d.rot.length > 34 ? d.rot.slice(0, 33) + '…' : d.rot);
      [['a', 1, 0], ['b', 3, 13]].forEach(function (k) {
        var v = d[k[0]]; if (v == null) return;
        svg.append('rect').attr('x', Math.min(x(0), x(v))).attr('width', Math.max(1, Math.abs(x(v) - x(0)))).attr('y', y0 + k[2]).attr('height', 11).attr('rx', 2).attr('fill', C(k[1]))
          .on('pointermove', function (e) { tp.show([[d.rot, null], [nomeA, fmt(d.a)], [nomeB, fmt(d.b)]], e); }).on('pointerleave', tp.hide);
        svg.append('text').attr('class', 'val').attr('x', v >= 0 ? x(v) + 4 : x(v) - 4).attr('text-anchor', v >= 0 ? 'start' : 'end').attr('y', y0 + k[2] + 9).text(fmt(v));
      });
    });
  }

  // maiores variações (barras horizontais divergentes)
  function variacoes(el, itens, fmt, nomeValor) {
    fmt = fmt || String; el.replaceChildren();
    if (!itens.length) return falha(el, 'Sem variações relevantes');
    var W = el.clientWidth || 300, svg = d3.select(el).append('svg').attr('width', '100%').attr('role', 'img'), tp = tipo(el);
    var ml = Math.min(W * 0.42, largura(svg, itens.map(function (d) { return d.rot; })) + 12), m = d3.max(itens, function (d) { return Math.abs(d.v); }) || 1;
    itens.forEach(function (d) { d.linhas = quebra(svg, d.rot, ml - 8, 2); });
    var lin = itens.some(function (d) { return d.linhas.length > 1; }) ? 30 : 24, H = itens.length * lin + 10;
    svg.attr('viewBox', '0 0 ' + W + ' ' + H);
    var neg = itens.some(function (d) { return d.v < 0; }), pos = itens.some(function (d) { return d.v > 0; });
    var x = d3.scaleLinear([neg ? -m : 0, pos ? m : 0], [ml + (neg ? 38 : 4), W - (pos ? 44 : 6)]);
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', H).attr('stroke', 'var(--muted)');
    itens.forEach(function (d, i) {
      var y0 = 4 + i * lin;
      var tx = svg.append('text').attr('class', 'tick').attr('x', ml - 4).attr('y', y0 + (d.linhas.length > 1 ? 8 : 13)).attr('text-anchor', 'end');
      d.linhas.forEach(function (l, k) { tx.append('tspan').attr('x', ml - 4).attr('dy', k ? 11 : 0).text(l); });
      svg.append('rect').attr('x', Math.min(x(0), x(d.v))).attr('width', Math.max(1, Math.abs(x(d.v) - x(0)))).attr('y', y0 + 3).attr('height', lin - 10).attr('rx', 2).attr('fill', d.v >= 0 ? C(1) : C('neg'))
        .on('pointermove', function (e) { tp.show([[d.rot, null], [nomeValor || 'Variação', fmt(d.v)]], e); }).on('pointerleave', tp.hide);
      svg.append('text').attr('class', 'val').attr('x', d.v >= 0 ? x(d.v) + 4 : x(d.v) - 4).attr('text-anchor', d.v >= 0 ? 'start' : 'end').attr('y', y0 + (lin - 10) / 2 + 7).text(fmt(d.v));
    });
  }

  // minigráfico de tendência (sem eixos)
  function spark(el, vals) {
    el.replaceChildren();
    var pts = vals.map(function (v, i) { return { i: i, v: v }; }).filter(function (d) { return d.v != null && isFinite(d.v); });
    if (pts.length < 2) return;
    var W = 120, H = 30, x = d3.scaleLinear([0, vals.length - 1], [2, W - 4]), y = d3.scaleLinear(d3.extent(pts, function (d) { return d.v; }), [H - 3, 3]);
    var svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('aria-hidden', 'true');
    svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', C(1)).attr('stroke-width', 1.6).attr('d', d3.line().x(function (d) { return x(d.i); }).y(function (d) { return y(d.v); }));
    var u = pts[pts.length - 1]; svg.append('circle').attr('cx', x(u.i)).attr('cy', y(u.v)).attr('r', 2.5).attr('fill', C(1));
  }

  // cada gráfico guarda os números que desenhou (el._dados = {cab, linhas}) para a exportação em Excel
  function guarda(fn, conv) {
    return function (el) {
      var r = fn.apply(this, arguments);
      try { el._dados = conv.apply(null, arguments); } catch (e) { el._dados = null; }
      return r;
    };
  }
  var num = function (v) { return v == null || !isFinite(v) ? null : v; };
  raiz.Graficos = {
    barras: guarda(barras, function (el, labels, vals, nome) { return { cab: ['', nome || 'Valor'], linhas: labels.map(function (l, i) { return [l, num(vals[i])]; }) }; }),
    linhas: guarda(linhas, function (el, labels, series) { return { cab: [''].concat(series.map(function (s) { return s.nome; })), linhas: labels.map(function (l, i) { return [l].concat(series.map(function (s) { return num(s.vals[i]); })); }) }; }),
    empilhado: guarda(empilhado, function (el, labels, series, marcador) {
      var ss = series.concat(marcador ? [marcador] : []);
      return { cab: [''].concat(ss.map(function (s) { return s.nome; })), linhas: labels.map(function (l, i) { return [l].concat(ss.map(function (s) { return num(s.vals[i]); })); }) };
    }),
    cascata: guarda(cascata, function (el, inicio, passos, fim) {
      return { cab: ['', 'Valor'], linhas: [[inicio.rot, num(inicio.v)]].concat(passos.map(function (p) { return [p.rot, num(p.v)]; })).concat(fim ? [[fim.rot, num(fim.v)]] : []) };
    }),
    pares: guarda(pares, function (el, itens, nomeA, nomeB) { return { cab: ['', nomeA, nomeB], linhas: itens.map(function (d) { return [d.rot, num(d.a), num(d.b)]; }) }; }),
    variacoes: guarda(variacoes, function (el, itens, fmt, nomeValor) { return { cab: ['', nomeValor || 'Variação'], linhas: itens.map(function (d) { return [d.rot, num(d.v)]; }) }; }),
    ponte: guarda(ponte, function (el, inicio, passos, fim) {
      return { cab: ['', 'Valor'], linhas: [[inicio.rot, num(inicio.v)]].concat(passos.map(function (p) { return [p.rot + (p.sub ? ' (subtotal)' : ''), num(p.v)]; })).concat([[fim.rot, num(fim.v)]]) };
    }),
    blocos: guarda(blocos, function (el, colunas) {
      var out = []; colunas.forEach(function (c) { c.partes.forEach(function (p) { out.push([c.nome + ' — ' + p.rot, num(p.v), c.total ? { t: 'n', v: p.v / c.total, z: '0.0%' } : null]); }); out.push([c.nome + ' — total', num(c.total), { t: 'n', v: 1, z: '0.0%' }]); });
      return { cab: ['', 'Valor', '% do total'], linhas: out };
    }),
    spark: spark, falha: falha, legenda: legenda, C: C
  };
})(window);
