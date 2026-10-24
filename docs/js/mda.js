/* Análise automática ("MD&A do painel"): texto gerado por regras a partir dos números da CVM.
 * Nada aqui vem do Comentário do Desempenho nem do item 10 do Formulário de Referência da Companhia.
 * Cada frase é montada só com valores calculados; quando falta dado, a frase não é escrita. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Mda = fabrica();
})(this, function () {
  'use strict';

  var nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var ok = function (x) { return x !== null && x !== undefined && isFinite(x); };
  var sg = function (v) { return v < 0 ? '−' : ''; };

  // valores em R$ milhões
  function rs(v) {
    if (!ok(v)) return 'n/d';
    var a = Math.abs(v);
    if (a >= 1000) { var b = nf1.format(a / 1000); return sg(v) + 'R$ ' + b + (b === '1,0' ? ' bilhão' : ' bilhões'); }
    return sg(v) + 'R$ ' + nf0.format(a) + ' milhões';
  }
  var pct = function (v) { return ok(v) ? nf1.format(Math.abs(v) * 100) + '%' : 'n/d'; };
  var pp = function (v) { return ok(v) ? (v < 0 ? '−' : '+') + nf1.format(Math.abs(v)) + ' p.p.' : 'n/d'; };
  var x1 = function (v) { return ok(v) ? nf2.format(v) + 'x' : 'n/d'; };

  var TIPO = {
    receita: { mais: 'aumento', menos: 'redução' },
    despesa: { mais: 'aumento', menos: 'redução' },
    resultado: { mais: 'melhora', menos: 'piora' }
  };

  function gerar(M, p, base, opcoes) {
    opcoes = opcoes || {};
    base = base || 'T';
    var seg = opcoes.seg || null, conf = opcoes.conferencias || null;
    var ordv = M.ord(p);
    var kA = 4;                                    // mesmo período do ano anterior
    var kT = base === 'T' || base === 'LTM' ? 1 : null; // período imediatamente anterior
    var pA = M.desloca(p, kA), pT = kT ? M.desloca(p, kT) : null;
    var nomeBase = { T: 'trimestre', YTD: 'acumulado do ano', LTM: 'período de 12 meses', AN: 'ano' }[base];
    var rotP = M.rotulo(p, base), rotA = M.rotulo(pA, base), rotT = pT ? M.rotulo(pT, base) : null;
    var intro = { T: 'No ' + p, YTD: 'No acumulado do ano até ' + p + ' (' + rotP + ')', LTM: 'Nos 12 meses encerrados em ' + p, AN: 'No exercício de ' + rotP }[base];
    var v = function (ds, cd, pp_) { return M.agg(ds, cd, pp_ || p, base); };
    var blocos = [], avisos = [];

    // ---- comparação de uma linha
    function comp(ds, cd, tipo) {
      var a = v(ds, cd), aa = v(ds, cd, pA), tt = pT ? v(ds, cd, pT) : null;
      var r = { a: a, aa: aa, tt: tt, tipo: tipo };
      var rel = function (b) {
        if (!ok(a) || !ok(b) || b === 0) return null;
        if (tipo === 'resultado' && (a < 0 || b < 0)) return null;
        if (tipo !== 'resultado' && (a < 0) !== (b < 0)) return null;
        return Math.abs(a) / Math.abs(b) - 1;
      };
      r.pAA = rel(aa); r.pTT = rel(tt);
      r.dAA = ok(a) && ok(aa) ? a - aa : null; r.dTT = ok(a) && ok(tt) ? a - tt : null;
      return r;
    }
    function frase(rot, c, opts) {
      opts = opts || {};
      if (!ok(c.a)) return null;
      var out = rot + (rot.slice(-1) === ':' ? ' ' : ' de ') + rs(opts.abs ? Math.abs(c.a) : c.a);
      var partes = [];
      var parte = function (r, ref, valorRef) {
        if (!ok(valorRef)) return;
        var refv = opts.abs ? Math.abs(valorRef) : valorRef;
        if (ok(r)) {
          var mais = r >= 0;
          partes.push((mais ? 'alta de ' : 'queda de ') + pct(r) + ' sobre ' + ref + ' (' + rs(refv) + ')');
        } else {
          partes.push('contra ' + rs(refv) + ' em ' + ref);
        }
      };
      parte(c.pAA, rotA, c.aa);
      if (pT) parte(c.pTT, rotT, c.tt);
      return out + (partes.length ? ', ' + partes.join(' e ') : '') + '.';
    }
    var add = function (lista, txt) { if (txt) lista.push(txt); };
    var bloco = function (titulo, paragrafos, itens) {
      paragrafos = (paragrafos || []).filter(Boolean); itens = (itens || []).filter(Boolean);
      if (paragrafos.length || itens.length) blocos.push({ titulo: titulo, paragrafos: paragrafos, itens: itens });
    };

    // ---- números-base
    var rec = comp('dre', '3.01', 'receita'), bru = comp('dre', '3.03', 'resultado'), ebi = comp('dre', '3.05', 'resultado');
    var luc = comp('dre', '3.11', 'resultado'), lair = comp('dre', '3.07', 'resultado');
    var margem = function (num, den, pp_) { var a = v('dre', num, pp_), b = v('dre', den, pp_); return ok(a) && ok(b) && b !== 0 ? a / b : null; };
    var mb = margem('3.03', '3.01'), mbA = margem('3.03', '3.01', pA), mlq = margem('3.11', '3.01'), mlqA = margem('3.11', '3.01', pA);
    var ctx = M.contexto(p, base), ctxA = M.contexto(pA, base);
    var ebitda = ctx.ebitda(), ebitdaA = ctxA.ebitda();
    var mEbitda = ok(ebitda) && ok(rec.a) ? ebitda / rec.a : null, mEbitdaA = ok(ebitdaA) && ok(rec.aa) ? ebitdaA / rec.aa : null;

    // ---- 1. resumo
    var res = [];
    if (ok(rec.a) && ok(luc.a)) {
      var s = intro + ', a receita foi de ' + rs(rec.a) + ' e o lucro líquido consolidado de ' + rs(luc.a)
        + (ok(mlq) ? ' (margem líquida de ' + pct(mlq) + ')' : '') + '.';
      res.push(s);
    }
    var ra = [];
    if (ok(rec.pAA)) ra.push('a receita ' + (rec.pAA >= 0 ? 'subiu ' : 'caiu ') + pct(rec.pAA));
    if (ok(luc.aa) && ok(luc.a)) ra.push(luc.aa > 0 && luc.a > 0 ? 'o lucro líquido ' + (luc.a >= luc.aa ? 'subiu ' : 'caiu ') + pct(luc.a / luc.aa - 1)
      : 'o lucro líquido passou de ' + rs(luc.aa) + ' para ' + rs(luc.a));
    if (ok(ebitda) && ok(ebitdaA)) ra.push('o EBITDA contábil foi de ' + rs(ebitda) + ' contra ' + rs(ebitdaA));
    if (ra.length) res.push('Na comparação com ' + rotA + ': ' + ra.join('; ') + '.');
    if (ok(mb) && ok(mbA)) res.push('A margem bruta foi de ' + pct(mb) + ' (' + pp((mb - mbA) * 100) + ' contra ' + rotA + ')'
      + (ok(mEbitda) ? ' e a margem EBITDA contábil de ' + pct(mEbitda) + (ok(mEbitdaA) ? ' (' + pp((mEbitda - mEbitdaA) * 100) + ')' : '') : '') + '.');
    bloco('Resumo', res);

    // ---- 2. receita e resultado bruto
    var r2 = [], i2 = [];
    add(r2, frase('A receita de venda de bens e serviços foi', rec));
    var mtm = comp('dre', '3.01.02', 'resultado');
    if (ok(mtm.a) && Math.abs(mtm.a) >= 1) add(i2, 'A receita inclui marcação a mercado do trading de energia de ' + rs(mtm.a) + (ok(mtm.aa) ? ' (' + rs(mtm.aa) + ' em ' + rotA + ')' : '') + '.');
    add(r2, frase('O custo dos bens e serviços vendidos foi', comp('dre', '3.02', 'despesa'), { abs: true }));
    add(r2, frase('O resultado bruto foi', bru));
    if (ok(bru.dAA)) add(i2, 'O resultado bruto variou ' + (bru.dAA >= 0 ? '+' : '−') + rs(Math.abs(bru.dAA)).replace('−', '') + ' em relação a ' + rotA + (ok(mb) && ok(mbA) ? ', com margem bruta ' + (mb >= mbA ? 'maior' : 'menor') + ' (' + pct(mb) + ' contra ' + pct(mbA) + ')' : '') + '.');
    bloco('Receita e resultado bruto', r2, i2);

    // ---- 3. despesas operacionais
    var r3 = [], i3 = [];
    add(i3, frase('Despesas com vendas:', comp('dre', '3.04.01', 'despesa'), { abs: true }));
    add(i3, frase('Despesas gerais e administrativas:', comp('dre', '3.04.02', 'despesa'), { abs: true }));
    var outras = function (pp_) { var t = v('dre', '3.04', pp_), a = v('dre', '3.04.01', pp_), b = v('dre', '3.04.02', pp_), e = v('dre', '3.04.06', pp_); return ok(t) && ok(a) && ok(b) ? t - a - b - nz(e) : null; };
    var nz = function (x) { return ok(x) ? x : 0; };
    var oa = outras(), oaa = outras(pA);
    if (ok(oa)) add(i3, 'Outras receitas e despesas operacionais (inclui perdas de recuperabilidade, créditos e despesas tributárias): ' + rs(oa) + (ok(oaa) ? ' contra ' + rs(oaa) + ' em ' + rotA : '') + '.');
    add(i3, frase('Resultado de equivalência patrimonial:', comp('dre', '3.04.06', 'resultado')));
    var tot3 = comp('dre', '3.04', 'resultado');
    if (ok(tot3.a)) add(r3, 'No conjunto, as despesas e receitas operacionais (3.04) somaram ' + rs(tot3.a) + (ok(tot3.aa) ? ', contra ' + rs(tot3.aa) + ' em ' + rotA : '') + (ok(rec.a) && rec.a ? ', equivalentes a ' + pct(Math.abs(tot3.a) / rec.a) + ' da receita' : '') + '.');
    bloco('Despesas operacionais', r3, i3);

    // ---- 4. EBIT e EBITDA
    var r4 = [];
    var ebit = ctx.ebit(), ebitA = ctxA.ebit(), da = ctx.t('dva', '7.04.01');
    if (ok(ebit)) r4.push('O EBIT, sem o resultado de equivalência, foi de ' + rs(ebit) + (ok(ebitA) ? ' (' + rs(ebitA) + ' em ' + rotA + ')' : '') + '. Somando depreciação e amortização de ' + rs(ok(da) ? -da : null) + ', o EBITDA contábil foi de ' + rs(ebitda) + (ok(ebitdaA) ? ' (' + rs(ebitdaA) + ' em ' + rotA + ')' : '') + '.');
    var ajR = seg && seg.linhas ? seg.linhas.filter(function (l) { return l.cd_conta === 'EBITDA'; })[0] : null;
    if (ajR && base === 'T' && ok(ajR[p])) {
      r4.push('O release informa EBITDA Ajustado de ' + rs(ajR[p]) + ' para ' + p + ', ' + (ok(ebitda) ? 'frente ao EBITDA contábil calculado de ' + rs(ebitda) + ' (diferença de ' + rs(ajR[p] - ebitda) + ', explicada por ajustes definidos pela Companhia e por critérios de cálculo diferentes)' : '') + '.');
    }
    bloco('EBIT e EBITDA', r4);

    // ---- 5. resultado financeiro
    var r5 = [], i5 = [];
    var fin = comp('dre', '3.06', 'resultado');
    add(r5, frase('O resultado financeiro foi', fin));
    add(i5, frase('Receitas financeiras:', comp('dre', '3.06.01', 'receita')));
    add(i5, frase('Despesas financeiras (juros e encargos):', comp('dre', '3.06.02.01', 'despesa'), { abs: true }));
    add(i5, frase('Variações monetárias e cambiais líquidas:', comp('dre', '3.06.02.02', 'resultado')));
    bloco('Resultado financeiro', r5, i5);

    // ---- 6. tributos, lucro e ponte
    var r6 = [], i6 = [];
    add(r6, frase('O resultado antes dos tributos foi', lair));
    var ir = v('dre', '3.08'), irA = v('dre', '3.08', pA);
    if (ok(ir) && ok(lair.a) && lair.a > 0) r6.push('A despesa de IR e CS foi de ' + rs(Math.abs(ir)) + ', alíquota efetiva de ' + pct(-ir / lair.a) + (ok(irA) && ok(lair.aa) && lair.aa > 0 ? ' (' + pct(-irA / lair.aa) + ' em ' + rotA + ')' : '') + '.');
    add(r6, frase('O lucro líquido consolidado foi', luc));
    var lc = comp('dre', '3.11.01', 'resultado');
    if (ok(lc.a)) i6.push('Atribuído aos controladores: ' + rs(lc.a) + (ok(lc.aa) ? ' (' + rs(lc.aa) + ' em ' + rotA + ')' : '') + '.');
    var ponte = [];
    var comps = [['Resultado bruto', function (pp_) { return v('dre', '3.03', pp_); }],
      ['Despesas com vendas', function (pp_) { return v('dre', '3.04.01', pp_); }],
      ['Despesas gerais e administrativas', function (pp_) { return v('dre', '3.04.02', pp_); }],
      ['Outras operacionais e equivalência', function (pp_) { var o = outras(pp_), e = v('dre', '3.04.06', pp_); return ok(o) ? o + nz(e) : null; }],
      ['Resultado financeiro', function (pp_) { return v('dre', '3.06', pp_); }],
      ['IR e CS', function (pp_) { return v('dre', '3.08', pp_); }],
      ['Operações descontinuadas', function (pp_) { return nz(v('dre', '3.10', pp_)); }]];
    var somaP = 0, okP = ok(luc.dAA);
    comps.forEach(function (cc) {
      var a = cc[1](p), b = cc[1](pA);
      if (ok(a) && ok(b)) { ponte.push({ rot: cc[0], v: a - b }); somaP += a - b; } else okP = false;
    });
    if (okP && Math.abs(somaP - luc.dAA) <= 3) {
      var ord_ = ponte.slice().sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); }).filter(function (x) { return Math.abs(x.v) >= 1; }).slice(0, 4);
      r6.push('Em relação a ' + rotA + ', o lucro líquido variou ' + (luc.dAA >= 0 ? '+' : '−') + rs(Math.abs(luc.dAA)).replace('−', '') + '. As maiores contribuições foram: '
        + ord_.map(function (x) { return x.rot.replace(/^(Resultado|Despesas|Outras|Operações)/, function (m) { return m.toLowerCase(); }) + ' (' + (x.v >= 0 ? '+' : '−') + rs(Math.abs(x.v)).replace('−', '') + ')'; }).join('; ') + '.');
    } else { ponte = []; if (ok(luc.dAA)) avisos.push('A ponte do lucro líquido não fecha com a variação do lucro; não foi exibida.'); }
    bloco('Tributos e lucro líquido', r6, i6);

    // ---- 7. balanço (posição no fim do período)
    var r7 = [], i7 = [];
    var b = function (cd, pp_) { return M.trim('bp', cd, pp_ || p); };
    var cb = function (cd, rot, tipo) {
      var a = b(cd), aa = b(cd, pA), tt = pT ? b(cd, pT) : (base === 'YTD' ? b(cd, M.desloca(p, M.tri(p))) : null);
      if (!ok(a)) return null;
      var txt = rot + ': ' + rs(a);
      var pr = function (ref, val) { if (!ok(val)) return ''; return (val !== 0 ? (a / val - 1 >= 0 ? 'alta de ' : 'queda de ') + pct(a / val - 1) : 'contra zero') + ' sobre ' + ref + ' (' + rs(val) + ')'; };
      var ps_ = [];
      if (ok(aa)) ps_.push(pr(rotA, aa));
      if (ok(tt) && pT) ps_.push(pr(rotT, tt));
      return txt + (ps_.length ? ', ' + ps_.join(' e ') : '') + '.';
    };
    if (ok(b('1'))) r7.push('O ativo total no fim de ' + p + ' era de ' + rs(b('1')) + ' e o patrimônio líquido consolidado de ' + rs(b('2.03')) + '.');
    add(i7, cb('1.01.01', 'Caixa e equivalentes'));
    add(i7, cb('1.01.03', 'Contas a receber'));
    add(i7, cb('1.01.04', 'Estoques'));
    add(i7, cb('2.01.02', 'Fornecedores'));
    var db = ctx.dbruta(0), dba = ctxA.dbruta(0), dl = ctx.dliq(0), dla = ctxA.dliq(0);
    if (ok(db)) i7.push('Dívida bruta (empréstimos, financiamentos e arrendamentos): ' + rs(db) + (ok(dba) ? ' (' + rs(dba) + ' em ' + M.rotulo(pA, 'T') + ')' : '') + '. Dívida líquida: ' + rs(dl) + (ok(dla) ? ' (' + rs(dla) + ')' : '') + '.');
    var alav = M.ind('dlebitda', p, base), alavA = M.ind('dlebitda', pA, base);
    if (ok(alav)) r7.push('A dívida líquida representava ' + x1(alav) + ' o EBITDA contábil dos últimos 12 meses' + (ok(alavA) ? ' (' + x1(alavA) + ' em ' + M.rotulo(pA, 'T') + ')' : '') + '.');
    var lq = M.ind('lcor', p, base), lqA = M.ind('lcor', pA, base);
    if (ok(lq)) r7.push('A liquidez corrente era de ' + nf2.format(lq) + (ok(lqA) ? ' (' + nf2.format(lqA) + ' em ' + M.rotulo(pA, 'T') + ')' : '') + '.');
    var cc2 = M.ind('cfin', p, base), cc2A = M.ind('cfin', pA, base);
    if (ok(cc2)) r7.push('O ciclo de caixa estimado era de ' + nf1.format(cc2) + ' dias' + (ok(cc2A) ? ' (' + nf1.format(cc2A) + ' em ' + M.rotulo(pA, 'T') + ')' : '') + '.');
    // maiores variações de contas folha do balanço (a/a)
    var folhas = function (ds) {
      var cds = M.linhas(ds).map(function (l) { return l.cd_conta; });
      return M.linhas(ds).filter(function (l) { return l.nivel >= 3 && !cds.some(function (c) { return c.indexOf(l.cd_conta + '.') === 0; }); });
    };
    var top = [];
    folhas('bp').forEach(function (l) {
      var a = b(l.cd_conta), bb = b(l.cd_conta, pA);
      if (ok(a) && ok(bb) && Math.abs(a - bb) >= 500) top.push({ l: l, d: a - bb, a: a, b: bb });
    });
    top.sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); });
    var bm = top.slice(0, 6).map(function (t) { return t.l.conta + ' (' + t.l.cd_conta + '): ' + (t.d >= 0 ? '+' : '−') + rs(Math.abs(t.d)).replace('−', '') + ' (de ' + rs(t.b) + ' para ' + rs(t.a) + ')'; });
    bloco('Balanço patrimonial e endividamento', r7, i7);
    if (bm.length) bloco('Maiores variações do balanço contra ' + M.rotulo(pA, 'T'), ['Contas de menor nível com variação de pelo menos R$ 500 milhões:'], bm);

    // ---- 8. fluxo de caixa
    var r8 = [], i8 = [];
    var fco = comp('dfc', '6.01', 'resultado');
    add(r8, frase('O caixa líquido das atividades operacionais foi', fco));
    var gerado = v('dfc', '6.01.01'), varw = v('dfc', '6.01.02');
    if (ok(gerado) && ok(varw)) i8.push('Caixa gerado nas operações: ' + rs(gerado) + '; variações de ativos e passivos (capital de giro e outros): ' + rs(varw) + '.');
    var inv = v('dfc', '6.02'), capex = v('dfc', '6.02.01'), fin3 = v('dfc', '6.03'), fcl = ctx.t('dfc', '6.01') !== null && ok(capex) ? ctx.t('dfc', '6.01') + capex : null;
    if (ok(inv)) i8.push('Atividades de investimento: ' + rs(inv) + (ok(capex) ? ', dos quais ' + rs(-capex) + ' em imobilizado e intangível' : '') + '.');
    if (ok(fcl)) i8.push('Fluxo de caixa livre (FCO + investimentos em imobilizado e intangível): ' + rs(fcl) + '.');
    if (ok(fin3)) {
      var capt = v('dfc', '6.03.02'), amort = v('dfc', '6.03.03'), divs = v('dfc', '6.03.05');
      i8.push('Atividades de financiamento: ' + rs(fin3) + (ok(capt) ? '; captações de ' + rs(capt) : '') + (ok(amort) ? '; amortizações de principal de ' + rs(-amort) : '') + (ok(divs) && divs !== 0 ? '; dividendos e JCP pagos de ' + rs(-divs) : '') + '.');
    }
    var vc = v('dfc', '6.05'), si = v('dfc', '6.05.01'), sf = v('dfc', '6.05.02');
    if (ok(vc) && ok(si) && ok(sf)) i8.push('O caixa e equivalentes ' + (vc >= 0 ? 'aumentou ' : 'diminuiu ') + rs(Math.abs(vc)) + ', de ' + rs(si) + ' para ' + rs(sf) + '.');
    var conv = M.ind('convfco', p, base);
    if (ok(conv)) r8.push('O fluxo de caixa operacional correspondeu a ' + nf0.format(conv) + '% do EBITDA contábil do período.');
    bloco('Fluxo de caixa', r8, i8);

    // ---- 9. maiores variações da DRE
    var topd = [];
    folhas('dre').forEach(function (l) {
      if (l.cd_conta.indexOf('3.99') === 0 || l.cd_conta.indexOf('3.11.0') === 0) return;
      var a = v('dre', l.cd_conta), bb = v('dre', l.cd_conta, pA);
      if (ok(a) && ok(bb) && Math.abs(a - bb) >= 100) topd.push({ l: l, d: a - bb, a: a, b: bb });
    });
    topd.sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); });
    var tdl = topd.slice(0, 6).map(function (t) { return t.l.conta + ' (' + t.l.cd_conta + '): ' + (t.d >= 0 ? '+' : '−') + rs(Math.abs(t.d)).replace('−', '') + ' (de ' + rs(t.b) + ' para ' + rs(t.a) + ')'; });
    if (tdl.length) bloco('Maiores variações da DRE contra ' + rotA, ['Linhas de menor nível com variação de pelo menos R$ 100 milhões (positivo = aumento do valor, que pode ser aumento de receita ou de despesa):'], tdl);

    // ---- 10. conferências
    if (conf) {
      var tp = conf.filter(function (t) { return t.periodo === p; });
      var dv = tp.filter(function (t) { return t.status === 'divergente'; }).length;
      avisos.push('Conferências automáticas de ' + p + ': ' + tp.length + ' testes, ' + dv + ' divergentes.');
    }
    avisos.push('Texto gerado automaticamente a partir das demonstrações consolidadas da CVM. Não é o Comentário do Desempenho nem o item 10 do Formulário de Referência da Companhia, e não explica causas: para isso, consulte o release e as notas explicativas.');
    return { titulo: 'Análise: ' + ({ T: 'trimestre ' + p, YTD: 'acumulado do ano até ' + p, LTM: '12 meses até ' + p, AN: 'exercício de ' + rotP }[base]), base: base, periodo: p, referencia: rotA, blocos: blocos, ponte: ponte, avisos: avisos };
  }

  return { gerar: gerar, rs: rs };
});
