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

## Em construção

- EBITDA Ajustado por segmento e demais indicadores gerenciais (release do RI).
- Painel interativo publicado a partir destes dados.

EBITDA Ajustado e seus segmentos são medidas não contábeis definidas pela Companhia e não constam nos Dados Abertos da CVM.
