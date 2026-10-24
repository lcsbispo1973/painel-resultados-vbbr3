# Vibra em Números — resultados, mercado e comunicados da Vibra Energia (VBBR3)

Painel público com os números da Vibra Energia S.A., atualizado e publicado automaticamente todos os dias:
https://vibraemnumeros.github.io/

Todas as informações são públicas. Valores em R$ milhões, consolidado.

## Abas

| Aba | Conteúdo |
| --- | --- |
| Visão geral | Indicadores-chave do período escolhido, com histórico, e gráficos com o período em destaque. |
| Demonstrações | DRE, balanço, fluxo de caixa, DVA, DRA e DMPL (resumo ou detalhado; análise vertical opcional). |
| Indicadores | Margens, retorno (com DuPont), endividamento, liquidez, ciclo de caixa e por ação. |
| Operacional | Volumes, EBITDA Ajustado por segmento e margem por m³. |
| Comparar | Dois períodos lado a lado, com análise vertical, variação absoluta e horizontal; intervalo livre. |
| MD&A | Comentário do desempenho para o par de períodos escolhido, gerado por regras (sem custo), com trechos dos releases e do Formulário de Referência (item 10). Exporta para Word e PDF. |
| Mercado | Ação e múltiplos; dividendos, payout e retorno total (VBBR3 × BOVA11); Vibra × Ipiranga. |
| Dívida | Cronograma de vencimentos, dívida bruta e líquida, alavancagem e relatórios de rating. |
| Simulador | EBITDA Ajustado e alavancagem a partir de volume e margem por m³. |
| Governança | Remuneração da administração, acionistas, capital e empregados (Formulário de Referência). |
| Comunicados | Fatos relevantes, comunicados e avisos (IPE da CVM). |

A seleção de período é feita em dois passos (ano, depois trimestre/semestre/9 meses/ano). A faixa verde traz uma
manchete calculada a partir dos números da aba e do período escolhidos. O link da página guarda a seleção.

## Fontes e regras

- **Demonstrações** (`pipeline/cvm.py`): DFP e ITR dos Dados Abertos da CVM, última versão de cada documento.
  Trimestres de fluxo obtidos pela diferença dos acumulados. 778 conferências de fechamento a cada execução.
- **EBITDA Ajustado** (`pipeline/ebitda_df.py`): sempre da nota de informações por segmento das ITRs/DFPs
  (desde 2022, incluindo comparativos). 4º trimestre = acumulado de dezembro (DFP) − acumulado de setembro (ITR).
  De 4T17 a 4T21 vem do release de resultados (não há nota com essa medida). A série começa em 4T17.
- **Volumes e margens** (`pipeline/releases.py`, `releases_ler.py`): releases de resultados arquivados na CVM.
- **Ipiranga** (`pipeline/ipiranga.py`): releases da Ultrapar arquivados na CVM. Visão principal Vibra Consolidada ×
  Ipiranga; complementar Vibra Distribuição (sem Renováveis) × Ipiranga.
- **Dívida** (`pipeline/divida.py`): tabela de vencimentos da nota de empréstimos e financiamentos.
- **Textos do MD&A** (`pipeline/releases_texto.py`, `pipeline/fre_mda.py`): parágrafos dos releases por tema e item 10
  do Formulário de Referência (PDF embutido no pacote da CVM; disponível de 2023 em diante).
- **Formulário de Referência** (`pipeline/fre.py`), **cotações** (`pipeline/b3.py`, VBBR3/BRDT3 e BOVA11),
  **comunicados** (`pipeline/ipe.py`), **documentos** (`pipeline/documentos.py`).
- **Dívida líquida e alavancagem** (`pipeline/divida_release.py`): dívida líquida como a Companhia divulga no release
  (dívida bruta + swap − disponibilidades); alavancagem = essa dívida ÷ EBITDA Ajustado de 12 meses da nota de segmentos.
  A dívida líquida contábil (balanço) segue disponível como indicador à parte.
- **Proventos**: totais anuais da DMPL (automático); eventos em `data/dividendos.json` (site de RI), com valor por ação
  exato e data com conferidos pelos avisos arquivados na CVM (`pipeline/proventos.py` → `data/proventos.json`).

## Trava de publicação e alertas

- `pipeline/validar.py` roda antes de publicar: conferências da CVM, aritmética do EBITDA Ajustado por segmento,
  continuidade da série, vencimentos da dívida, margens da Ipiranga, cotações e proventos; depois `tests/test_dados.js`.
  Se algo falhar, o site não é publicado (fica no ar a última versão aprovada) e uma issue é aberta no repositório.
- `pipeline/registro.py` registra cada documento novo (ITR/DFP, release, fato relevante, Formulário de Referência) em
  `data/registro.json` e abre uma issue com o resumo do que mudou. As issues geram aviso por e-mail ao dono do repositório.

## Observações sobre as fontes

- **Receita:** a conta 3.01 da CVM inclui a marcação a mercado do trading de energia; o release mostra a receita e a
  marcação a mercado em linhas separadas.
- **EBITDA Ajustado da nota × release:** em alguns trimestres (ex.: 4T23, 1T24, 3T24) o release destaca um EBITDA sem
  efeitos não recorrentes; o painel usa o valor da nota explicativa. Na ITR do 1T26 o total dos segmentos publicado
  (3.449) difere da soma das linhas (3.349); o painel usa a soma, que fecha com o consolidado.
- **Fluxo de caixa operacional do 1T26:** CVM (DFC) = 2.641; release = 1.903. A diferença, 738, é igual ao saldo de
  "Financiamento de fornecimento de produtos" no balanço de 31/03/2026.

EBITDA Ajustado e seus segmentos são medidas não contábeis definidas pela Companhia.
