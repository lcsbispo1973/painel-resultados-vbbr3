// Confere o motor de indicadores do painel com contas feitas à mão sobre os JSON reais (caminho de cálculo independente).
const fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const ld = n => JSON.parse(fs.readFileSync(path.join(raiz, 'data', n + '.json'), 'utf8'));
const D = require(path.join(raiz, 'docs', 'js', 'dados.js'));
const dre = ld('cvm_dre'), bp = ld('cvm_balanco'), dfc = ld('cvm_fluxo_caixa'), dva = ld('cvm_dva'), dra = ld('cvm_dra'), acoes = ld('cvm_acoes');
const b3 = ld('b3_cotacoes');
const m = D.criar({ dre, bp, dfc, dva, dra, acoes, b3 });
const g = (t, cd, p) => { const l = t.linhas.find(x => x.cd_conta === cd); return l ? l[p] : undefined; };
const lab = (a, q) => q + 'T' + String(a).padStart(2, '0');
const perto = (a, b, nome, tol = 1e-6) => { assert(a !== null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${nome}: painel=${a} esperado=${b}`); };
let n = 0;
const chk = (id, p, base, esperado) => { perto(m.ind(id, p, base), esperado, `${id} ${p} ${base}`); n++; };

// 2T26, trimestre
chk('mb', '2T26', 'T', 100 * g(dre, '3.03', '2T26') / g(dre, '3.01', '2T26'));
chk('mliq', '2T26', 'T', 100 * g(dre, '3.11', '2T26') / g(dre, '3.01', '2T26'));
const ebitda = p => g(dre, '3.05', p) - g(dre, '3.04.06', p) - g(dva, '7.04.01', p);
chk('ebitda', '2T26', 'T', ebitda('2T26'));
// UDM 2T26 = 3T25 + 4T25 + 1T26 + 2T26
const ps = ['3T25', '4T25', '1T26', '2T26'];
const udm = (t, cd) => ps.reduce((s, p) => s + g(t, cd, p), 0);
chk('receita', '2T26', 'LTM', udm(dre, '3.01'));
chk('ebitda', '2T26', 'LTM', ps.reduce((s, p) => s + ebitda(p), 0));
// ROE UDM: lucro controladores UDM / média simples do PL dos controladores em 2T26 e 2T25
const plc = p => g(bp, '2.03', p) - g(bp, '2.03.09', p);
chk('roe', '2T26', 'T', 100 * udm(dre, '3.11.01') / ((plc('2T26') + plc('2T25')) / 2));
// dívida líquida e alavancagem
const dliq = p => g(bp, '2.01.04', p) + g(bp, '2.02.01', p) - g(bp, '1.01.01', p) - (g(bp, '1.01.02', p) || 0);
chk('dliq', '2T26', 'T', dliq('2T26'));
chk('dlebitda', '2T26', 'T', dliq('2T26') / ps.reduce((s, p) => s + ebitda(p), 0));
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
chk('evebitda', '2T26', 'T', evv / ps.reduce((s, p) => s + ebitda(p), 0));
chk('fcfy', '2T26', 'T', 100 * (udm(dfc, '6.01') + udm(dfc, '6.02.01')) / mc);
chk('dy', '2T26', 'T', 100 * -udm(dfc, '6.03.05') / mc);
// cotação atual: último fechamento da B3 com as demonstrações do último trimestre
const ult = b3.dias[b3.dias.length - 1];
perto(m.indAtual('mcap'), ult[2] * sh('2T26') / 1e6, 'mcap atual'); n++;
perto(m.indAtual('pl'), ult[2] * sh('2T26') / 1e6 / udm(dre, '3.11.01'), 'P/L atual'); n++;
// sem cotação antes do IPO e sem ações antes de 1T20
assert.strictEqual(m.ind('preco', '1T17', 'T'), null); n++;
assert.strictEqual(m.ind('mcap', '4T19', 'T'), null); n++;
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
// períodos
assert.strictEqual(m.periodos('dre', 'AN').length, new Set(m.periodos('dre', 'AN')).size);
assert(m.periodos('dre', 'LTM')[0] === '4T16', 'primeiro UDM = ' + m.periodos('dre', 'LTM')[0]); n++;
console.log(`TESTE DADOS OK: ${n} conferências`);
