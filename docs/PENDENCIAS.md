# Pendências da v0.1

Estado em 22/11/2026, 1h30. Ramo `v0.1`. Testes: unidade 140/140; ponta a
ponta no Chrome 39/39.

## Testado por Pedro

- Login no e-SAJ do TJSP com a v0.1 no Brave e no Firefox (extensão
  temporária). Sem extensão oficial, sem componente nativo.
- Protótipo anterior: login e assinatura no TJSP e no TJAL, Chromium e Firefox.

Falta testar com a v0.1: assinatura de petição real (no Firefox o e-SAJ pode
assinar pela outra marca, que o login não exercita) e os tribunais além do
TJSP.

## Corrigido depois da revisão final (21/11, noite)

1. "Travar agora" apaga os créditos de assinatura, e o cofre travado sempre
   pede a senha junto com o que será assinado, mesmo que sobre crédito.
2. Manifesto com os e-SAJ em uso: TJSP (`esaj.tjsp.jus.br`), TJAL
   (`www2.tjal.jus.br`), TJMS (`esaj.tjms.jus.br`), TJAC
   (`esaj.tjac.jus.br`), TJCE (`esaj.tjce.jus.br`, plantão) e TJBA
   (`esaj.tjba.jus.br`). Ficaram fora TJSC e TJAM, que já migraram. Só
   HTTPS. TJMS, TJAC, TJCE e TJBA não foram testados.
3. Confirmação vencida (120 s) não pode mais ser aprovada nem exibida.
4. Sal e conferência do cofre, contador de tentativas e decisões por site
   saíram de `storage.local` (alcançável pelos scripts de conteúdo) e foram
   para o IndexedDB da extensão. `storage.local` não é lido em momento
   algum (sem migração: a v0.1 nunca foi publicada; quem tinha versão de
   desenvolvimento reimporta o PFX).
5. Texto do desenho corrigido: no `signHash` a chave fica em memória do
   JavaScript durante a assinatura.
6. Janela de confirmação: botão "Bloquear este site", e depois de uma recusa
   (ou de fechar a janela) o mesmo site fica 15 s sem poder reabri-la.
7. Aceite que falha no meio avisa a aba na hora, em vez de deixá-la esperando
   120 s, e não deixa o site liberado.
8. Teste negativo do script de conteúdo usa página HTTP real fora do
   manifesto, em vez de `data:`.
9. Teste intermitente de convivência: havia uma corrida real. Quando o site
   passa a preferir a extensão oficial no meio de um pedido, o Jamegão agora
   fica calado em vez de responder com recusa. O teste também passou a
   esperar a gravação do interruptor. Passou 5 de 5.

10. Prazo de 120 s vencido no login reabria a janela no Brave: a tela de
   login do e-SAJ repete a listagem na hora quando ela falha, até três vezes
   (`carregarCertificadosWebSigner` em `saj-certificado.js`). Agora o prazo
   vencido conta como recusa e pausa o site por 15 s, e as repetições falham
   sem abrir janela.

11. Revisão independente das correções (22/11, 1h): aprovada com ressalvas,
   sem achado crítico nem importante. Os sete achados menores foram
   corrigidos: crédito não sobra quando o aceite falha e toda janela antes de
   assinar mostra a quantidade; falha ao gravar o bloqueio é avisada;
   migração retirada; conexões do banco cedem quando outra versão pede
   (sem rejeitar no "bloqueado", que vazaria conexão); janela avisa
   quando o pedido expirou; desenho atualizado. O login e o prazo de 120 s
   no Firefox e no Brave foram testados por Pedro com a build e11110e,
   anterior a esta revisão; as correções da revisão foram testadas só pela
   suíte automática.

## Firefox

O login manual funcionou. A suíte automática nunca rodou no Firefox (não há
Firefox no ambiente de desenvolvimento). Para rodar:

    BROWSER=firefox FIREFOX_BIN=/caminho/do/firefox npm run e2e

## Para a próxima versão (0.1.1)

- Atualização automática no Firefox: o `.xpi` distribuído por arquivo só se
  atualiza sozinho se o manifesto tiver `browser_specific_settings.gecko.update_url`
  apontando para um arquivo de atualizações (por exemplo, `updates.json`
  servido pelo GitHub Pages ou pelo próprio repositório, com o link do `.xpi`
  de cada versão). Precisa estar já na 0.1.1: quem instalar a 0.1.0 terá de
  atualizar à mão uma vez.

- Validação da Mozilla (22/11): passou, com 4 alertas sem efeito. Para
  silenciar dois deles, subir `strict_min_version` de 128 para 140 (Firefox)
  e declarar `gecko_android` mínimo 142, ou excluir o Android: o
  `data_collection_permissions` só existe a partir dessas versões. Os
  outros dois são esperados: `background.service_worker` ignorado pelo
  Firefox (ele usa `background.scripts`) e o construtor `Function` dentro
  do node-forge.

## Envio às lojas (22/11/2026)

- Chrome Web Store: enviada para análise, não listada, com publicação
  automática após a aprovação.
- addons.mozilla.org: aprovada e assinada no mesmo dia (identificador
  `jamegao@pedrohqb.github.io`, definitivo). O `.xpi` assinado é idêntico ao
  zip enviado (a Mozilla só reformata o `manifest.json`); SHA-256
  `d61d86952f0e62322062f63b67da67428bf9e8cc1defc39e0ef8ff5e414b0841`.
  Pedro instalou o `.xpi` no Firefox.
- Release v0.1.0 no GitHub, com o `.xpi` e o zip: a criar por Pedro (a
  sessão do Claude não pode criar releases).

## Com Pedro

- Testar a assinatura de uma petição real (Chromium e Firefox).
- Abrir a tela de login por certificado em TJMS, TJAC, TJCE ou TJBA, se
  tiver acesso.
- Conferir se a tela de login usa `signHash` ou `signData`.
- Decidir se os dados do certificado podem ser listados com o cofre travado
  (hoje podem, desde que o site esteja autorizado).
- Quando a Chrome Web Store aprovar, pôr o link no README.

## Menores adiados

Estão no registro de execução do plano; nenhum impede o uso.
