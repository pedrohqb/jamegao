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

## Com Pedro

- Confirmar o identificador do Firefox (hoje provisório:
  `jamegao@pedrohqb.github.io`). É permanente depois do primeiro envio.
- Testar a assinatura de uma petição real (Chromium e Firefox).
- Abrir a tela de login por certificado em TJMS, TJAC, TJCE ou TJBA, se
  tiver acesso.
- Conferir se a tela de login usa `signHash` ou `signData`.
- Decidir se os dados do certificado podem ser listados com o cofre travado
  (hoje podem, desde que o site esteja autorizado).
- Envio não listado às lojas, pelo `docs/lojas/roteiro-de-envio.md`.

## Menores adiados

Estão no registro de execução do plano; nenhum impede o uso.
