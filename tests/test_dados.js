// Confere o motor de indicadores do painel com contas feitas à mão sobre os JSON reais (caminho de cálculo independente).
const fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const ld = n => JSON.parse(fs.readFileSync(path.join(raiz, 'data', n + '.json'), 'utf8'));
const D = require(path.join(raiz, 'docs', 'js', 'dados.js'));
const dre = ld('cvm_dre'), bp = ld('cvm_balanco'), dfc = ld('cvm_fluxo_caixa'), dva = ld('cvm_dva'), dra = ld('cvm_dra'), acoes = ld('cvm_acoes');
const b3 = ld('b3_cotacoes');
const aj = ld('ebitda_ajustado');
const dlrel = ld('divida_release');
const m = D.criar({ dre, bp, dfc, dva, dra, acoes, b3, aj, dlrel });
const ajv = (p) => aj.series[p].CONS.v;
const g = (t, cd, p) => { const l = t.linhas.find(x => x.cd_conta === cd); return l ? l[p] : undefined; };
const lab = (a, q) => q + 'T' + String(a).padStart(2, '0');
const perto = (a, b, nome, tol = 1e-6) => { assert(a !== null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${nome}: painel=${a} esperado=${b}`); };
let n = 0;
const chk = (id, p, base, esperado) => { perto(m.ind(id, p, base), esperado, `${id} ${p} ${base}`); n++; };

// 2T26, trimestre
chk('mb', '2T26', 'T', 100 * g(dre, '3.03', '2T26') / g(dre, '3.01', '2T26'));
chk('mliq', '2T26', 'T', 100 * g(dre, '3.11', '2T26') / g(dre, '3.01', '2T26'));
const ebitda = p => g(dre, '3.05', p) - g(dre, '3.04.06', p) - g(dva, '7.04.01', p);
chk('ebitdac', '2T26', 'T', ebitda('2T26'));
chk('ebitda', '2T26', 'T', 4499);   // EBITDA Ajustado da nota de segmentos da ITR 2T26
// UDM 2T26 = 3T25 + 4T25 + 1T26 + 2T26
const ps = ['3T25', '4T25', '1T26', '2T26'];
const udm = (t, cd) => ps.reduce((s, p) => s + g(t, cd, p), 0);
chk('receita', '2T26', 'LTM', udm(dre, '3.01'));
chk('ebitdac', '2T26', 'LTM', ps.reduce((s, p) => s + ebitda(p), 0));
chk('ebitda', '2T26', 'LTM', ps.reduce((s, p) => s + ajv(p), 0));
chk('ebitda', '2T26', 'S', ajv('1T26') + ajv('2T26'));
chk('mebitda', '2T26', 'T', 100 * 4499 / g(dre, '3.01', '2T26'));
// ROE UDM: lucro controladores UDM / média simples do PL dos controladores em 2T26 e 2T25
const plc = p => g(bp, '2.03', p) - g(bp, '2.03.09', p);
chk('roe', '2T26', 'T', 100 * udm(dre, '3.11.01') / ((plc('2T26') + plc('2T25')) / 2));
// dívida líquida e alavancagem
const dliqc = p => g(bp, '2.01.04', p) + g(bp, '2.02.01', p) - g(bp, '1.01.01', p) - (g(bp, '1.01.02', p) || 0);
const dliq = p => dlrel.series[p].v;
assert.strictEqual(dliq('2T26'), 16062); n++;   // linha "Dívida Líquida" do release 2T26
chk('dliqc', '2T26', 'T', dliqc('2T26'));
chk('dliq', '2T26', 'T', 16062);
chk('dliq', '1T26', 'T', 18615);
chk('dlebitda', '2T26', 'T', dliq('2T26') / ps.reduce((s, p) => s + ajv(p), 0));
// liquidez e ciclo
chk('lcor', '2T26', 'T', g(bp, '1.01', '2T26') / g(bp, '2.01', '2T26'));
chk('pmp', '2T26', 'T', g(bp, '2.01.02', '2T26') / -udm(dre, '3.02') * 365);
// acumulado no ano e anual
chk('receita', '2T26', 'YTD', g(dre, '3.01', '1T26') + g(dre, '3.01', '2T26'));
chk('receita', '4T25', 'AN', ['1T25', '2T25', '3T25', '4T25'].reduce((s, p) => s + g(dre, '3.01', p), 0));
chk('fco', '3T25', 'YTD', ['1T25', '2T25', '3T25'].reduce((s, p) => s + g(dfc, '6.01', p), 0));
// por ação (R$): lucro UDM em R$ / média das ações ex-tesouraria
const sh = p => acoes.valores[p].total - (acoes.valores[p].tesouro || 0);
chk('lpa', '2T26', 'T', udm(dre, '3.11.01') * 1e6 / ((sh('2T26') + sh('2T25')) / 2));
// DuPont: ROE consolidado = lucro UDM ÷ PL consolidado médio, calculado de forma independente; e produto dos três fatores
const plm = (g(bp, '2.03', '2T26') + g(bp, '2.03', '2T25')) / 2;
chk('roecons', '2T26', 'T', 100 * udm(dre, '3.11') / plm);
chk('mliqudm', '2T26', 'T', 100 * udm(dre, '3.11') / udm(dre, '3.01'));
for (const p of ['2T26', '4T25', '2T25']) {
  perto(m.ind('mliqudm', p, 'T') * m.ind('giro', p, 'T') * m.ind('alav', p, 'T'), m.ind('roecons', p, 'T'), 'DuPont ' + p); n++;
}
// valuation: cotação da B3 no fim do período (busca linear independente) × ações em circulação da CVM
const fechAte = data => { let r = null; for (const x of b3.dias) if (x[0] <= data) r = x; return r; };
assert.strictEqual(fechAte('2026-06-30')[2], 29.89); n++;            // fechamento conferido no arquivo da B3
assert.strictEqual(m.cotacaoAte('2026-06-30').p, 29.89); n++;
const mc = fechAte('2026-06-30')[2] * sh('2T26') / 1e6;
chk('preco', '2T26', 'T', 29.89);
chk('mcap', '2T26', 'T', mc);
const evv = mc + dliq('2T26') + g(bp, '2.03.09', '2T26');
chk('ev', '2T26', 'T', evv);
chk('pl', '2T26', 'T', mc / udm(dre, '3.11.01'));
chk('pvp', '2T26', 'T', mc / plc('2T26'));
chk('evebitda', '2T26', 'T', evv / ps.reduce((s, p) => s + ajv(p), 0));
chk('fcfy', '2T26', 'T', 100 * (udm(dfc, '6.01') + udm(dfc, '6.02.01')) / mc);
chk('dy', '2T26', 'T', 100 * -udm(dfc, '6.03.05') / mc);
// cotação atual: último fechamento da B3 com as demonstrações do último trimestre
const ult = b3.dias[b3.dias.length - 1];
perto(m.indAtual('mcap'), ult[2] * sh('2T26') / 1e6, 'mcap atual'); n++;
perto(m.indAtual('pl'), ult[2] * sh('2T26') / 1e6 / udm(dre, '3.11.01'), 'P/L atual'); n++;
// sem cotação antes do IPO; de 4T17 a 4T19, ações pelo FRE (1.165.000.000, sem tesouraria)
assert.strictEqual(m.ind('preco', '1T17', 'T'), null); n++;
const c4t19 = m.cotacaoAte('2019-12-31').p;
perto(m.ind('mcap', '4T19', 'T'), c4t19 * 1165000000 / 1e6, 'mcap 4T19'); n++;
perto(m.ind('mcap', '4T17', 'T'), 17.10 * 1165000000 / 1e6, 'mcap 4T17 (fechamento de 28/12/2017)'); n++;
// semestre, 9 meses e intervalo livre
chk('receita', '2T26', 'S', g(dre, '3.01', '1T26') + g(dre, '3.01', '2T26'));
chk('receita', '4T25', 'S', g(dre, '3.01', '3T25') + g(dre, '3.01', '4T25'));
chk('lucro', '3T25', '9M', ['1T25', '2T25', '3T25'].reduce((s, p) => s + g(dre, '3.11', p), 0));
chk('fco', '1T26', 'R:3T25', ['3T25', '4T25', '1T26'].reduce((s, p) => s + g(dfc, '6.01', p), 0));
assert.strictEqual(m.agg('dre', '3.01', '1T26', 'S'), null); n++;            // 1T não fecha semestre
assert.strictEqual(m.agg('dre', '3.01', '2T26', '9M'), null); n++;
assert.strictEqual(m.agg('dre', '3.01', '2T25', 'R:3T25'), null); n++;       // fim antes do início
assert.strictEqual(D.rotulo('2T26', 'S'), '1S26'); assert.strictEqual(D.rotulo('4T25', 'S'), '2S25');
assert.strictEqual(D.rotulo('3T25', '9M'), '9M25'); assert.strictEqual(D.rotulo('1T26', 'R:3T25'), '3T25–1T26'); n += 4;
perto(m.agg('dfc', '6.05.01', '1T26', 'R:3T25'), g(dfc, '6.05.01', '3T25'), 'saldo inicial do intervalo'); n++;
assert(m.periodos('bp', 'S').every(p => p[0] === '2' || p[0] === '4')); n++;
// fluxo de caixa: saldo inicial do acumulado = saldo inicial do 1T; final = saldo do último trimestre
perto(m.agg('dfc', '6.05.01', '3T25', 'YTD'), g(dfc, '6.05.01', '1T25'), 'saldo inicial YTD'); n++;
perto(m.agg('dfc', '6.05.02', '3T25', 'YTD'), g(dfc, '6.05.02', '3T25'), 'saldo final YTD'); n++;
// coerência: soma dos trimestres do ano = valor anual calculado
for (const a of [17, 20, 23, 25]) {
  const qs = [1, 2, 3, 4].map(q => g(dre, '3.11', lab(a, q)));
  perto(m.agg('dre', '3.11', lab(a, 4), 'AN'), qs.reduce((s, x) => s + x, 0), 'lucro anual 20' + a); n++;
}
// antes do IPO (comparativos dos releases de 2018): EBITDA Ajustado e dívida líquida
chk('ebitda', '4T17', 'AN', 3067);   // exercício 2017 no release do 4T17 = 647 + 481 + 1.056 + 883
chk('ebitda', '4T16', 'AN', 2995);   // exercício 2016 no release do 4T17 (trimestres de 2016 não divulgados)
chk('ebitda', '2T17', 'S', 1128);    // 1S17 no release do 2T18
chk('ebitda', '3T17', '9M', 2184);   // 9M17 no release do 3T18
chk('ebitda', '3T17', 'LTM', 3004);  // UDM 3T17 na tabela do release do 4T17
assert.strictEqual(dliq('2T17'), 9560); assert.strictEqual(dliq('3T17'), 3865); assert.strictEqual(dliq('4T16'), 9509); n += 3;
assert.strictEqual(Math.round(m.ind('dlebitda', '4T16', 'T') * 10) / 10, 3.2); n++;   // "3,2x em 2016" (release 4T17)
assert.strictEqual(Math.round(m.ind('dlebitda', '4T17', 'T') * 10) / 10, 1.3); n++;   // "1,3x em 2017"
// períodos
assert.strictEqual(m.periodos('dre', 'AN').length, new Set(m.periodos('dre', 'AN')).size);
assert(m.periodos('dre', 'LTM')[0] === '4T15', 'primeiro UDM = ' + m.periodos('dre', 'LTM')[0]); n++;
// 2015: só anual (comparativo do DFP de 2016); trimestres de 2015 não existem
chk('receita', '4T15', 'AN', 97280); chk('lucro', '4T15', 'AN', g(dre, '3.11', 'AN2015'));
assert.strictEqual(m.ind('receita', '4T15', 'T'), null); assert.strictEqual(m.disponivel(2015, '4T'), false); assert.strictEqual(m.disponivel(2015, 'AN'), true); n += 3;
assert.strictEqual(m.ind('dliq', '4T15', 'T'), null); n++;   // sem release antes de 2016: não mistura com a dívida pelo balanço
perto(m.ind('receita', '4T16', 'AN') / m.ind('receita', '4T15', 'AN') - 1, 86637 / 97280 - 1, 'variação da receita 2016 × 2015'); n++;
// gráficos-síntese (Demonstrações) e pontes (Comparar): fecham com os totais da CVM em todos os períodos e bases
{
  const m2 = D.criar({ dre, bp, dfc, dva, dra, acoes, b3, aj, dlrel, dmpl: ld('cvm_dmpl') }), E = m2.estrutura, falhas = [];
  for (const p of m2.periodos('bp', 'T')) { const b = E.balanco(p); if (!b || !b.fecha) falhas.push('balanço ' + p); }
  for (const base of ['T', 'S', '9M', 'AN', 'LTM']) for (const p of m2.periodos('dre', base)) {
    for (const [k, f] of [['resultado', E.resultado], ['caixa', E.caixa], ['dva', E.dva], ['dra', E.dra]]) { const r = f(p, base); if (!r || !r.fecha) falhas.push(k + ' ' + p + ' ' + base); }
  }
  for (const p of ld('cvm_dmpl').periodos) { const r = E.pl(p); if (!r || !r.fecha) falhas.push('PL ' + p); }
  const dp = dlrel.periodos; for (let i = 1; i < dp.length; i++) { const r = E.ponteDivida(dp[i - 1], dp[i]); if (!r || !r.fecha) falhas.push('dívida ' + dp[i]); }
  const pb = m2.periodos('bp', 'T'); for (let i = 4; i < pb.length; i++) for (const lado of ['ativo', 'passivo']) { const r = E.ponteBalanco(pb[i - 4], pb[i], lado); if (!r || !r.fecha) falhas.push('ponte ' + lado + ' ' + pb[i]); }
  assert.deepStrictEqual(falhas, [], 'estruturas que não fecham: ' + falhas.slice(0, 10).join(', ')); n++;
  // valores conferidos à mão (2T26)
  const b = E.balanco('2T26'); assert.strictEqual(b.ativo[0].v, g(bp, '1.01.01', '2T26') + (g(bp, '1.01.02', '2T26') || 0)); assert.strictEqual(b.passivo[5].v, g(bp, '2.03', '2T26')); n += 2;
  const pd = E.ponteDivida('2T25', '2T26'), fco = ['3T25', '4T25', '1T26', '2T26'].reduce((s_, p) => s_ + g(dfc, '6.01', p), 0);
  assert.strictEqual(pd.inicio.v, 21005); assert.strictEqual(pd.fim.v, 16062); perto(pd.passos[0].v, -fco, 'ponte da dívida: geração operacional'); n += 3;
  const cx = E.caixa('2T26', 'T'); assert.strictEqual(cx.inicio.v, g(dfc, '6.05.01', '2T26')); assert.strictEqual(cx.fim.v, g(dfc, '6.05.02', '2T26')); n += 2;
}
// análise horizontal (a/a): fórmula e valores reais conferidos à mão
{
  assert.strictEqual(D.ah(110, 100).toFixed(10), (0.1).toFixed(10)); assert.strictEqual(D.ah(-110, -100).toFixed(10), (0.1).toFixed(10));
  assert(isNaN(D.ah(50, -100)) && isNaN(D.ah(5, 0)) && isNaN(D.ah(1100, 100))); assert.strictEqual(D.ah(null, 1), null); assert.strictEqual(D.ah(0, 0), null); assert.strictEqual(D.ah(0, -10), -1); n += 5;
  const ahT = (t, ds, cd, a, b) => { const v = g(t, cd, a), w = g(t, cd, b); perto(D.ah(m.agg(ds, cd, a, 'T'), m.agg(ds, cd, b, 'T')), v / w - 1, `AH ${ds} ${cd} ${a}`); n++; };
  ahT(dre, 'dre', '3.01', '2T26', '2T25'); ahT(dre, 'dre', '3.04.01', '2T26', '2T25'); ahT(dre, 'dre', '3.11', '1T26', '1T25');
  ahT(bp, 'bp', '1', '2T26', '2T25'); ahT(bp, 'bp', '2.03', '2T26', '2T25'); ahT(dva, 'dva', '7.01', '2T26', '2T25'); ahT(dfc, 'dfc', '6.01', '2T26', '2T25');
  // acumulado do ano (S): 1T+2T de cada ano
  const s2 = (t, cd, a) => g(t, cd, '1T' + a) + g(t, cd, '2T' + a);
  perto(D.ah(m.agg('dre', '3.01', '2T26', 'S'), m.agg('dre', '3.01', '2T25', 'S')), s2(dre, '3.01', '26') / s2(dre, '3.01', '25') - 1, 'AH dre 3.01 1S26'); n++;
  // exercício (AN): soma dos quatro trimestres
  const an = (t, cd, a) => [1, 2, 3, 4].reduce((x, q) => x + g(t, cd, q + 'T' + a), 0);
  perto(D.ah(m.agg('dre', '3.05', '4T25', 'AN'), m.agg('dre', '3.05', '4T24', 'AN')), an(dre, '3.05', '25') / an(dre, '3.05', '24') - 1, 'AH dre 3.05 2025'); n++;
}
console.log(`TESTE DADOS OK: ${n} conferências`);
