// Fatos numéricos do MD&A por par de períodos, calculados com o mesmo motor do painel (docs/js/dados.js).
// Saída: data/mda_fatos.json — cada fato traz os valores já formatados em português, que são os ÚNICOS números
// que o texto redigido pode usar (a trava de publicação confere isso).
// Pares: cada trimestre com release × mesmo trimestre do ano anterior e × trimestre anterior; cada ano × ano anterior.
'use strict';
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const ld = (n) => { try { return JSON.parse(fs.readFileSync(path.join(raiz, 'data', n + '.json'), 'utf8')); } catch (e) { return null; } };
const D = require(path.join(raiz, 'docs', 'js', 'dados.js'));
const dre = ld('cvm_dre'), bp = ld('cvm_balanco'), dfc = ld('cvm_fluxo_caixa'), dva = ld('cvm_dva'), dra = ld('cvm_dra'), acoes = ld('cvm_acoes');
const b3 = ld('b3_cotacoes'), aj = ld('ebitda_ajustado'), dlrel = ld('divida_release'), oper = ld('release_operacional'), reltxt = ld('releases_texto');
const M = D.criar({ dre, bp, dfc, dva, dra, acoes, b3, aj, dlrel });
const ok = (v) => v !== null && v !== undefined && isFinite(v);

// ---------- formatação (pt-BR) ----------
const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dec = (v, c) => { const s = Math.abs(v).toFixed(c).split('.'); return milhar(s[0]) + (c ? ',' + s[1] : ''); };
const sinal = (v) => (v < 0 ? '−' : '');
const fmt = {
  mi: (v) => sinal(v) + 'R$ ' + dec(v, 0) + ' milhões',
  bi: (v) => sinal(v) + 'R$ ' + dec(v / 1000, 1) + ' bilhões',
  pct: (v) => dec(v, 1).replace(/^/, v < 0 ? '−' : '') + '%',
  pp: (v) => (v >= 0 ? '+' : '−') + dec(v, 1) + ' p.p.',
  x: (v) => dec(v, 2) + 'x',
  m3: (v) => 'R$ ' + dec(v, 0) + '/m³',
  vol: (v) => dec(v, 0) + ' mil m³',
  dias: (v) => dec(v, 1) + ' dias',
};
const nomeTri = { 1: '1º trimestre', 2: '2º trimestre', 3: '3º trimestre', 4: '4º trimestre' };
const rotLongo = (l) => l.base === 'AN' ? 'ano de ' + (2000 + +l.p.slice(2)) : nomeTri[+l.p[0]] + ' de ' + (2000 + +l.p.slice(2));
const rotCurto = (l) => l.base === 'AN' ? String(2000 + +l.p.slice(2)) : l.p;

// volume e margem por m³ do release (mesma regra da aba Operacional)
function volume(seg, l) {
  const k = D.trimestresBase(l.base, l.p), n = D.ord(l.p); let s = 0;
  for (let i = n - k + 1; i <= n; i++) {
    const q = oper && oper.series[D.lab(i)]; if (!q) return null;
    const x = seg === 'CONS' ? ((q.CONS && q.CONS.vol) || (q.DIST && q.DIST.vol)) : (q[seg] && q[seg].vol);
    if (!x || !ok(x.v)) return null; s += x.v;
  }
  return s;
}
function margem(seg, l) {
  let e = M.aj(seg, l.p, l.base); const v = volume(seg, l);
  if (seg === 'CONS' && ok(e) && M.aj('REN', l.p, l.base) !== null) e -= M.aj('REN', l.p, l.base);
  return ok(e) && v ? e / v * 1000 : null;
}

// ---------- catálogo de fatos ----------
// [id, seção, rótulo, função(l) → valor, unidade de exibição, tipo de variação]
const g = (id) => (l) => M.ind(id, l.p, l.base);
const a = (ds, cd) => (l) => M.agg(ds, cd, l.p, l.base);
const s = (seg) => (l) => M.aj(seg, l.p, l.base);
const CAT = [
  ['receita', 'resultado', 'Receita líquida', a('dre', '3.01'), 'mi', 'pct'],
  ['lbruto', 'resultado', 'Lucro bruto', a('dre', '3.03'), 'mi', 'pct'],
  ['mbruta', 'resultado', 'Margem bruta', g('mb'), 'pct', 'pp'],
  ['dvendas', 'resultado', 'Despesas com vendas', a('dre', '3.04.01'), 'mi', 'pct'],
  ['dga', 'resultado', 'Despesas gerais e administrativas', a('dre', '3.04.02'), 'mi', 'pct'],
  ['outras', 'resultado', 'Outras receitas e despesas operacionais (líquidas, com equivalência)', (l) => { const t = M.agg('dre', '3.04', l.p, l.base), v = M.agg('dre', '3.04.01', l.p, l.base), ga = M.agg('dre', '3.04.02', l.p, l.base); return ok(t) && ok(v) && ok(ga) ? t - v - ga : null; }, 'mi', 'pct'],
  ['ebitda', 'resultado', 'EBITDA Ajustado consolidado', s('CONS'), 'mi', 'pct'],
  ['mebitda', 'resultado', 'Margem EBITDA Ajustado sobre a receita', g('mebitda'), 'pct', 'pp'],
  ['rfin', 'resultado', 'Resultado financeiro', a('dre', '3.06'), 'mi', 'pct'],
  ['ir', 'resultado', 'Imposto de renda e contribuição social', a('dre', '3.08'), 'mi', 'pct'],
  ['aliq', 'resultado', 'Alíquota efetiva de IR/CS', g('aliq'), 'pct', 'pp'],
  ['lucro', 'resultado', 'Lucro líquido consolidado', a('dre', '3.11'), 'mi', 'pct'],
  ['lucroc', 'resultado', 'Lucro atribuído aos controladores', a('dre', '3.11.01'), 'mi', 'pct'],
  ['mliq', 'resultado', 'Margem líquida', g('mliq'), 'pct', 'pp'],
  ['vol', 'operacional', 'Volume vendido total', (l) => volume('CONS', l), 'vol', 'pct'],
  ['vol_rede', 'operacional', 'Volume vendido — Rede de Postos', (l) => volume('REDE', l), 'vol', 'pct'],
  ['vol_b2b', 'operacional', 'Volume vendido — B2B', (l) => volume('B2B', l), 'vol', 'pct'],
  ['aj_rede', 'operacional', 'EBITDA Ajustado — Rede de Postos', s('REDE'), 'mi', 'pct'],
  ['aj_b2b', 'operacional', 'EBITDA Ajustado — B2B', s('B2B'), 'mi', 'pct'],
  ['aj_ren', 'operacional', 'EBITDA Ajustado — Renováveis', s('REN'), 'mi', 'pct'],
  ['aj_corp', 'operacional', 'EBITDA Ajustado — Corporativo e reconciliação', s('CORP'), 'mi', 'pct'],
  ['m3', 'operacional', 'Margem EBITDA Ajustado por m³ da distribuição (sem Renováveis)', (l) => margem('CONS', l), 'm3', 'pct'],
  ['m3_rede', 'operacional', 'Margem EBITDA Ajustado por m³ — Rede de Postos', (l) => margem('REDE', l), 'm3', 'pct'],
  ['m3_b2b', 'operacional', 'Margem EBITDA Ajustado por m³ — B2B', (l) => margem('B2B', l), 'm3', 'pct'],
  ['dbruta', 'balanco', 'Dívida bruta (empréstimos, financiamentos e arrendamentos), fim do período', g('dbruta'), 'mi', 'pct'],
  ['caixa', 'balanco', 'Caixa e aplicações financeiras, fim do período', g('caixa'), 'mi', 'pct'],
  ['dliq', 'balanco', 'Dívida líquida como divulgada pela Companhia, fim do período', g('dliq'), 'mi', 'pct'],
  ['alav', 'balanco', 'Alavancagem: dívida líquida ÷ EBITDA Ajustado de 12 meses', (l) => M.ind('dlebitda', l.p, 'T'), 'x', 'xx'],
  ['pl', 'balanco', 'Patrimônio líquido consolidado, fim do período', a('bp', '2.03'), 'mi', 'pct'],
  ['pmr', 'balanco', 'Prazo médio de recebimento (12 meses)', (l) => M.ind('pmr', l.p, 'T'), 'dias', 'abs'],
  ['pme', 'balanco', 'Prazo médio de estocagem (12 meses)', (l) => M.ind('pme', l.p, 'T'), 'dias', 'abs'],
  ['pmp', 'balanco', 'Prazo médio de pagamento (12 meses)', (l) => M.ind('pmp', l.p, 'T'), 'dias', 'abs'],
  ['ciclo', 'balanco', 'Ciclo de caixa (12 meses)', (l) => M.ind('cfin', l.p, 'T'), 'dias', 'abs'],
  ['fco', 'caixa', 'Caixa líquido das atividades operacionais (DFC)', g('fco'), 'mi', 'pct'],
  ['capex', 'caixa', 'Investimentos em imobilizado e intangível', g('capex'), 'mi', 'pct'],
  ['fcl', 'caixa', 'Fluxo de caixa livre (operacional + investimentos em imobilizado e intangível)', g('fcl'), 'mi', 'pct'],
  ['prov', 'caixa', 'Dividendos e JCP pagos', g('prov'), 'mi', 'pct'],
  ['conv', 'caixa', 'Conversão de caixa: caixa operacional ÷ EBITDA Ajustado', g('convfco'), 'pct', 'pp'],
  ['roe', 'retorno', 'ROE dos controladores (12 meses)', (l) => M.ind('roe', l.p, 'T'), 'pct', 'pp'],
];

function textoValor(un, v) {
  if (!ok(v)) return null;
  if (un === 'mi') return Math.abs(v) >= 1000 ? [fmt.mi(v), fmt.bi(v)] : [fmt.mi(v)];
  return [fmt[un](v)];
}
function textoVar(tipo, un, va, vb) {
  if (!ok(va) || !ok(vb)) return null;
  if (tipo === 'pct') {
    if (vb === 0 || (va < 0) !== (vb < 0)) return null;   // variação percentual sem sentido com troca de sinal
    const p = (va / vb - 1) * 100; return (p >= 0 ? '+' : '−') + dec(p, 1) + '%';
  }
  if (tipo === 'pp') return fmt.pp(va - vb);
  if (tipo === 'xx') return (va - vb >= 0 ? '+' : '−') + dec(va - vb, 2) + 'x';
  if (tipo === 'abs') return (va - vb >= 0 ? '+' : '−') + dec(va - vb, 1) + ' dias';
  return null;
}

function fatos(A, B) {
  const out = [];
  for (const [id, secao, rot, f, un, tipo] of CAT) {
    let va = null, vb = null;
    try { va = f(A); vb = f(B); } catch (e) { /* período sem dado */ }
    if (!ok(va)) continue;
    const item = { id, secao, rotulo: rot, a: textoValor(un, va), b: textoValor(un, vb) };
    const vr = textoVar(tipo, un, va, vb); if (vr) item.variacao = vr;
    if (tipo === 'pct' && ok(vb) && un === 'mi') { const d = va - vb; item.diferenca = textoValor('mi', d); }
    item.valor_a = va; item.valor_b = ok(vb) ? vb : null;
    out.push(item);
  }
  return out;
}

// ---------- pares ----------
const pares = {};
const comRelease = Object.keys((reltxt && reltxt.trimestres) || {});
const ajPer = (aj && aj.periodos) || [];
const temAj = (p) => ajPer.indexOf(p) >= 0;
const add = (A, B, tipo) => {
  if (!temAj(A.p) || !temAj(B.p)) return;
  const f = fatos(A, B); if (f.length < 10) return;
  const k = [A.p, A.base, B.p, B.base].join('|');
  pares[k] = { tipo, A: Object.assign({ rotulo: rotLongo(A), curto: rotCurto(A) }, A), B: Object.assign({ rotulo: rotLongo(B), curto: rotCurto(B) }, B), fatos: f };
};
for (const p of comRelease) {
  add({ p, base: 'T' }, { p: D.desloca(p, 4), base: 'T' }, 'anual');
  add({ p, base: 'T' }, { p: D.desloca(p, 1), base: 'T' }, 'trimestral');
  if (p[0] === '4') add({ p, base: 'AN' }, { p: D.desloca(p, 4), base: 'AN' }, 'exercicio');
}
fs.writeFileSync(path.join(raiz, 'data', 'mda_fatos.json'), JSON.stringify({ gerado_em: new Date().toISOString(), pares }));
console.log('mda_fatos: ' + Object.keys(pares).length + ' pares');
