# Atualização do Formulário de Referência (CVM)

Execução (UTC): 2026-10-24 14:49:12

- 2010: sem formulário da Vibra
- 2011: sem formulário da Vibra
- 2012: sem formulário da Vibra
- 2013: sem formulário da Vibra
- 2014: sem formulário da Vibra
- 2015: sem formulário da Vibra
- 2016: sem formulário da Vibra
- 2017: 1 documento(s), última versão v8 (recebida em 2018-05-08); 30 tabelas
- 2018: 1 documento(s), última versão v9 (recebida em 2019-05-06); 31 tabelas
- 2019: 1 documento(s), última versão v17 (recebida em 2020-06-25); 31 tabelas
- 2020: 1 documento(s), última versão v7 (recebida em 2021-04-26); 31 tabelas
- 2021: 1 documento(s), última versão v16 (recebida em 2022-05-26); 29 tabelas

## ERRO
```
Traceback (most recent call last):
  File "/home/runner/work/painel-resultados-vbbr3/painel-resultados-vbbr3/pipeline/fre.py", line 237, in principal
    aj = extrair_ano(caminho, ano)
         ^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/runner/work/painel-resultados-vbbr3/painel-resultados-vbbr3/pipeline/fre.py", line 125, in extrair_ano
    for r in ler_csv(zf, nome):
             ^^^^^^^^^^^^^^^^^
  File "/home/runner/work/painel-resultados-vbbr3/painel-resultados-vbbr3/pipeline/fre.py", line 99, in ler_csv
    yield from csv.DictReader(io.TextIOWrapper(bruto, encoding="latin-1", newline=""), delimiter=";")
  File "/opt/hostedtoolcache/Python/3.12.15/x64/lib/python3.12/csv.py", line 116, in __next__
    row = next(self.reader)
          ^^^^^^^^^^^^^^^^^
_csv.Error: field larger than field limit (131072)

```
