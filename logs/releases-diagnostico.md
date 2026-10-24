# Diagnóstico de acesso aos releases

- OK https://ri.vibraenergia.com.br/ → HTTP 200, text/html; charset=UTF-8, 70729 bytes
- OK https://ri.vibraenergia.com.br/informacoes-financeiras/central-de-resultados/ → HTTP 200, text/html; charset=UTF-8, 73911 bytes
  PDFs na página: 0; exemplos: []
  URLs mziq na página: ['https://api.mziq.com/mzevents/events', 'https://apicatalog.mziq.com/filemanager', 'https://apicatalog.mziq.com/mailer', 'https://cdn-sites-assets.mziq.com/wp-content/plugins/google-analytics-for-wordpress/assets/js/frontend-gtag.min.js', 'https://cdn-sites-assets.mziq.com/wp-content/themes/mziq_brdistribuidora_ri/fonts/fonts.css', 'https://cdn-sites-assets.mziq.com/wp-content/themes/mziq_brdistribuidora_ri/img/favicon/favicon.ico', 'https://cdn-sites-assets.mziq.com/wp-content/themes/mziq_brdistribuidora_ri/img/favicon/favicon144.png', 'https://cdn-sites-assets.mziq.com/wp-content/themes/mziq_brdistribuidora_ri/img/favicon/favicon16.png', 'https://cdn-sites-assets.mziq.com/wp-content/themes/mziq_brdistribuidora_ri/img/favicon/favicon180.png', 'https://cdn-sites-assets.mziq.com/wp-content/themes/mziq_brdistribuidora_ri/img/favicon/favicon32.png']
- ERRO https://api.mziq.com/mzfilemanager/v2/d/ → HTTPError: HTTP Error 401: Unauthorized
- OK https://apicatalog.mziq.com/ → HTTP 200, text/html, 0 bytes

Documentos IPE com 'release/resultado' (amostra): 3
  2026-09-25 | Comunicado ao Mercado | Outros Comunicados Não Considerados Fatos Relevantes | Comunicado sobre o resultado do Procedimento de Bookbuilding
- OK https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&descTipo=IPE&CodigoInstituicao=1&numProtocolo=1571880&numSequencia=1096586&numVersao=1 → HTTP 200, text/html, 231332 bytes
  2026-09-03 | Comunicado ao Mercado | Apresentações a analistas/agentes do mercado | Apresentação Call de Resultados 2T26
- OK https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&descTipo=IPE&CodigoInstituicao=1&numProtocolo=1564536&numSequencia=1089242&numVersao=1 → HTTP 200, text/html; charset=utf-8, 4260 bytes
  2026-08-19 | Reunião da Administração | Conselho de Administração | Distribuição de Dividendos/Juros sobre Capital Próprio||Resultados de desempenho das atividades Vibra 2T26
- OK https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&descTipo=IPE&CodigoInstituicao=1&numProtocolo=1559393&numSequencia=1084099&numVersao=1 → HTTP 200, text/html, 117725 bytes
