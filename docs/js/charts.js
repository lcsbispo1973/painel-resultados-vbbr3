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
  function falha(el, msg) { el.replaceChildren(); var d = document.createElement('div'); d.className = 'fail'; d.textContent = msg || 'Sem dados para o período selecionado'; el.appendChild(d); }
  function rotulosX(labels, W) { var passo = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(W / 36)))); return labels.filter(function (_, i) { return (labels.length - 1 - i) % passo === 0; }); }

  function base(el, labels, ymin, ymax, fmt, h) {
    var W = el.clientWidth || 300, H = h || 230, m = { t: 16, r: 8, b: 26, l: 40 };
    var svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img');
    var y = d3.scaleLinear([ymin, ymax === ymin ? ymin + 1 : ymax], [H - m.b, m.t]).nice(4), tk = y.ticks(4);
    m.l = largura(svg, tk.map(fmt)) + 10;
    var x = d3.scaleBand(labels, [m.l, W - m.r]).padding(0.3);
    svg.append('g').selectAll('line').data(tk).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--grid)');
    svg.append('g').selectAll('text').data(tk).join('text').attr('class', 'tick').attr('x', m.l - 6).attr('y', function (d) { return y(d) + 4; }).attr('text-anchor', 'end').text(fmt);
    if (ymin < 0) svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--muted)');
    svg.append('g').selectAll('text').data(rotulosX(labels, W - m.l)).join('text').attr('class', 'tick').attr('x', function (d) { return x(d) + x.bandwidth() / 2; }).attr('y', H - 8).attr('text-anchor', 'middle').text(function (d) { return d; });
    return { svg: svg, x: x, y: y, W: W, H: H, m: m };
  }

  function barras(el, labels, vals, nome, fmt) {
    fmt = fmt || String;
    el.replaceChildren();
    var pts = labels.map(function (l, i) { return { l: l, v: vals[i] }; }).filter(function (d) { return d.v != null; });
    if (!pts.length) return falha(el);
    var nums = pts.map(function (d) { return d.v; }), g = base(el, labels, Math.min(0, d3.min(nums)), Math.max(0, d3.max(nums)), fmt), tp = tipo(el);
    g.svg.append('g').selectAll('rect').data(pts).join('rect')
      .attr('x', function (d) { return g.x(d.l); }).attr('width', g.x.bandwidth()).attr('rx', 3)
      .attr('y', function (d) { return Math.min(g.y(d.v), g.y(0)); }).attr('height', function (d) { return Math.max(1, Math.abs(g.y(d.v) - g.y(0))); })
      .attr('fill', function (d) { return d.v >= 0 ? C(1) : C(2); })
      .on('pointermove', function (e, d) { tp.show([[d.l, null], [nome, fmt(d.v)]], e); }).on('pointerleave', tp.hide);
    if (g.x.bandwidth() > 34) g.svg.append('g').selectAll('text').data(pts).join('text').attr('class', 'val').attr('text-anchor', 'middle')
      .attr('x', function (d) { return g.x(d.l) + g.x.bandwidth() / 2; }).attr('y', function (d) { return d.v >= 0 ? g.y(d.v) - 4 : g.y(d.v) + 12; }).text(function (d) { return fmt(d.v); });
  }

  function linhas(el, labels, series, fmt) {
    el.replaceChildren();
    var todos = []; series.forEach(function (s) { s.vals.forEach(function (v) { if (v != null) todos.push(v); }); });
    if (!todos.length) return falha(el);
    legenda(el, series.map(function (s, i) { return [s.nome, C(i + 1)]; }));
    var g = base(el, labels, Math.min(0, d3.min(todos)), Math.max(0, d3.max(todos)), fmt), tp = tipo(el), cx = function (l) { return g.x(l) + g.x.bandwidth() / 2; };
    series.forEach(function (s, i) {
      var pts = labels.map(function (l, k) { return { l: l, v: s.vals[k] }; }).filter(function (d) { return d.v != null; });
      g.svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', C(i + 1)).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
        .attr('d', d3.line().x(function (d) { return cx(d.l); }).y(function (d) { return g.y(d.v); }));
      if (pts.length) { var u = pts[pts.length - 1]; g.svg.append('circle').attr('cx', cx(u.l)).attr('cy', g.y(u.v)).attr('r', 3.5).attr('fill', C(i + 1)); }
    });
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
    var g = base(el, labels, Math.min(0, d3.min(mv.concat([0]))), Math.max(1, d3.max(tot), d3.max(mv.concat([0]))), fmt, 290), tp = tipo(el);
    labels.forEach(function (l, i) {
      var acc = 0;
      series.forEach(function (s, k) {
        var v = Math.max(0, s.vals[i] || 0); if (!v) return;
        g.svg.append('rect').attr('x', g.x(l)).attr('width', g.x.bandwidth()).attr('y', g.y(acc + v)).attr('height', Math.max(1, g.y(acc) - g.y(acc + v))).attr('fill', C(k + 1)).attr('rx', 2)
          .on('pointermove', function (e) { tp.show([[l, null]].concat(series.map(function (q) { return [q.nome, fmt(q.vals[i])]; })).concat(marcador ? [[marcador.nome, fmt(marcador.vals[i])]] : []), e); }).on('pointerleave', tp.hide);
        acc += v;
      });
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
      .attr('fill', function (d) { return d.tipo === 'tot' ? C(5) : d.tipo === 'up' ? C(3) : C(2); })
      .on('pointermove', function (e, d) { tp.show([[d.l, null], [d.tipo === 'tot' ? 'Valor' : 'Variação', fmt(d.tipo === 'tot' ? d.fim : d.v)]], e); }).on('pointerleave', tp.hide);
    svg.append('g').selectAll('text').data(itens).join('text').attr('class', 'val').attr('text-anchor', 'middle').attr('x', function (d) { return x(d.l) + x.bandwidth() / 2; })
      .attr('y', function (d) { return y(Math.max(d.ini, d.fim)) - 4; }).text(function (d) { return fmt(d.tipo === 'tot' ? d.fim : d.v); });
    // rótulos inclinados (nomes longos)
    svg.append('g').selectAll('text').data(itens).join('text').attr('class', 'tick').attr('text-anchor', 'end')
      .attr('transform', function (d) { return 'translate(' + (x(d.l) + x.bandwidth() / 2 + 4) + ',' + (H - m.b + 12) + ') rotate(-35)'; }).text(function (d) { return d.l.length > 24 ? d.l.slice(0, 23) + '…' : d.l; });
  }

  raiz.Graficos = { barras: barras, linhas: linhas, empilhado: empilhado, cascata: cascata, falha: falha, legenda: legenda, C: C };
})(window);
