# Painel de resultados da Vibra Energia (VBBR3)

Painel com as demonstrações financeiras públicas da Vibra Energia S.A., atualizado automaticamente a partir
dos Dados Abertos da CVM (DFP e ITR) e, em etapa futura, dos releases de resultados do site de RI.

Todas as informações são públicas. Valores em R$ milhões, consolidado.

## O que já existe

- `pipeline/cvm.py`: baixa DFP e ITR da CVM, filtra a Vibra (CNPJ 34.274.233/0001-02) e monta séries trimestrais de
  DRE, balanço e fluxo de caixa. O 4º trimestre da DRE e os trimestres do fluxo de caixa são derivados dos acumulados.
- Conferências de fechamento a cada execução (ativo = passivo + PL, somas da DRE, saldo de caixa do fluxo = caixa do
  balanço, continuidade entre trimestres) e teste cruzado com valores já conferidos nos releases.
- `.github/workflows/cvm.yml`: executa diariamente e a cada alteração do pipeline.
- `data/cvm_*.json`: séries geradas. `logs/cvm-ultima-execucao.md`: resultado da última execução.

## Observações sobre as fontes

- **Receita:** a conta 3.01 da CVM inclui a marcação a mercado do trading de energia; o release mostra a receita e a
  marcação a mercado em linhas separadas. As diferenças de 1T25, 3T25, 4T25 e 1T26 são exatamente essa linha.
- **Fluxo de caixa operacional do 1T26:** CVM (DFC) = 2.641; release = 1.903. A diferença, 738, é igual ao saldo de
  "Financiamento de fornecimento de produtos" no balanço de 31/03/2026. O fluxo de caixa total do período fecha nas duas
  fontes (variação de 1.460); o motivo da classificação diferente não foi confirmado nas notas explicativas.
- Os períodos de 1T25 a 4T25 do fluxo operacional coincidem com o release.

- `pipeline/fre.py`: baixa o Formulário de Referência (FRE) 2017–atual dos Dados Abertos, mantém a última versão de cada ano e
  gera `data/fre/{ano}.json` e `data/fre_series.json` (remuneração, dividendos, capital, acionistas, empregados). Dados
  pessoais (CPF, nascimento, currículos) não são publicados. O texto do formulário (ex.: item 10) não faz parte dos dados abertos.
- DVA, DRA, DMPL e composição do capital (ações) também são lidos da CVM, de 1T16 em diante.
- `docs/`: painel interativo com 12 abas: visão executiva, resultado, balanço, fluxo de caixa, DVA/DRA/DMPL, 45 indicadores
  (margens, retorno, endividamento, liquidez, ciclo de caixa, por ação), comparação de quaisquer dois períodos, análise
  automática, EBITDA por segmento, dividendos e JCP, Formulário de Referência e conferências. Bases: trimestre, acumulado
  no ano, últimos 12 meses e ano. Publicado no GitHub Pages pelo mesmo workflow.
- **Análise automática**: texto gerado por regras a partir das demonstrações. Não é o Comentário do Desempenho (MD&A) oficial
  e não explica causas.
- `data/release_segmentos.json` e `data/dividendos.json`: EBITDA Ajustado por segmento (releases) e proventos (site de RI), por ora carregados manualmente.
- Testes: `tests/test_cvm_fixture.py`, `tests/test_fre_fixture.py` e `tests/test_dados.js` rodam a cada execução.

## Em construção

- Leitura automática dos releases (EBITDA Ajustado por segmento e indicadores operacionais) com conferência contra a CVM.
- Leitura automática da página de dividendos e JCP.

EBITDA Ajustado e seus segmentos são medidas não contábeis definidas pela Companhia e não constam nos Dados Abertos da CVM.
