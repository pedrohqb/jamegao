# Guia de testes do Jamegão

Duas partes: o teste manual no e-SAJ e no PJe, que só você pode fazer, e a
suíte automática, para quem mexer no código.

Regra combinada: login, sempre. Assinatura de petição, só quando houver uma
real para protocolar. Nada é protocolado só para testar.

## Parte 1 — Teste manual no e-SAJ

### Preparar

**Chromium ou Brave**

1. Baixe o ramo em teste (para a 0.3.0, o `pje`) ou descompacte o
   `jamegao-<versão>.zip` numa pasta fixa.
2. Abra `chrome://extensions` (no Brave, `brave://extensions`) e ligue o
   "Modo do desenvolvedor".
3. Se o Jamegão já estiver instalado, clique em **recarregar** (a seta
   circular) no cartão dele. Se não, use "Carregar sem compactação" e
   escolha a pasta `ext` (ou a pasta do zip).
4. Desative as extensões oficiais de assinatura nesse perfil.

Para atualizar sem perder cofre, certificados e sites: substitua os arquivos
**na mesma pasta** e clique em recarregar no cartão. Remover a extensão, ou
carregá-la de outra pasta, cria uma extensão nova e apaga tudo (é o
navegador que apaga os dados de uma extensão removida).

**Firefox**

Para a versão publicada, instale o `.xpi` assinado da página de versões do
GitHub (arraste-o para o Firefox) e pule para o passo 2. Para testar uma
alteração ainda não publicada:

1. Abra `about:debugging#/runtime/this-firefox` e use "Carregar extensão
   temporária…", escolhendo o `manifest.json`.
2. Em `about:addons`, abra o Jamegão, vá à aba "Permissões" e ligue o acesso
   aos sites do e-SAJ.
3. Importe o PFX: a página abre sozinha na instalação.
4. Desative as extensões oficiais.

A extensão temporária e o cofre somem quando o Firefox fecha. É normal. O
`.xpi` assinado tem o mesmo identificador: instalá-lo por cima da temporária
mantém o cofre.

### Roteiro

Marque cada item. Os de 1 a 7 rodam no e-SAJ do TJSP; repita pelo menos o 2
no Firefox.

1. **Atualização preserva o cofre.** Com o Jamegão já instalado e com
   certificado, substitua os arquivos na mesma pasta e recarregue. Abra o
   ícone. Esperado: o certificado e os sites continuam lá e o cofre está
   "travado"; a senha continua valendo no passo 2.

2. **Login por certificado.** No e-SAJ, vá em "Identificar-se" e escolha o
   certificado digital. Esperado:
   - se o site ainda não foi autorizado, a janela de confirmação pergunta se
     o site pode ver os certificados;
   - na assinatura do login, a janela mostra "Assinar 1 documento com o
     certificado de [seu nome]" e, se o cofre estiver travado, pede a senha
     na mesma janela;
   - o login conclui.

3. **Travar agora.** Logado, abra o ícone e clique em "Travar agora". Saia e
   faça o login de novo. Esperado: a janela pede a senha e também mostra
   "Assinar 1 documento". Os dois aparecem juntos.

4. **Recusar pausa o site.** No login, clique em "Recusar". Tente o login de
   novo logo em seguida, em menos de 15 s. Esperado: nenhuma janela abre e o
   login falha (o e-SAJ pode mostrar a mensagem "recusado há pouco" ou um
   erro genérico). Espere 15 s e tente de
   novo: a janela volta. Fechar a janela no X tem o mesmo efeito de
   recusar.

5. **Prazo de 120 s.** Peça o login e não responda a janela. Esperado: em
   cerca de 2 minutos a janela fecha sozinha, o e-SAJ mostra o erro e a
   janela **não** volta (a tela de login repete o pedido três vezes, e as
   repetições caem na pausa de 15 s).

6. **Bloquear este site.** No login, clique em "Bloquear este site".
   Esperado: o e-SAJ recebe o cancelamento; no ícone, o site aparece como
   "(bloqueado)"; novas tentativas falham sem abrir janela. Para desfazer,
   clique em "Desbloquear" no ícone e faça o login de novo.

7. **Com a oficial ativa (só se você tiver a oficial instalada).** Ligue a
   oficial com o Jamegão, recarregue a página e faça o login. Esperado: quem
   responde é a oficial, nenhuma janela do Jamegão abre, nenhum erro
   CERT-99, e o ícone do Jamegão avisa que ele se desligou no site.
   Desative a oficial, recarregue, e o Jamegão volta a responder.

8. **Outros tribunais.** Faça o login por certificado no TJAL
   (`www2.tjal.jus.br`). Se tiver cadastro, repita no TJMS, TJAC, TJCE ou
   TJBA. Esperado: igual ao passo 2. Se a página disser que o
   "componente/plugin não está instalado", anote o tribunal e o endereço
   exato da página: o tribunal pode usar outro endereço.

9. **Petição real (quando houver).** Protocole normalmente. Esperado: a
   janela mostra "Assinar N documentos", com o número de arquivos do lote,
   e pede uma única confirmação para o lote inteiro. No Firefox, faça pelo
   menos uma vez: a assinatura pode usar a outra marca, que o login não
   exercita.

### Roteiro do PJe (0.3.0)

Faça os passos 1 a 4 e o 8 no Brave (ou Chrome) **e** no Firefox; os demais,
em pelo menos um dos dois. Como no e-SAJ, nada é protocolado só para testar.
Antes de começar, tenha um certificado importado **antes** da 0.3.0 (o do
perfil de sempre serve), para o passo 2.

1. **Ligar o PJe na primeira vez.** Abra o ícone e marque **Usar também no
   PJe**. Esperado: o navegador pede permissão para `https://*.jus.br/*`; ao
   aceitar, o ícone mostra "Recarregue as páginas do PJe que estiverem
   abertas." Feche e reabra o ícone: a caixa continua marcada.
   - **No Firefox**, o pedido de permissão pode aparecer atrás da janela do
     ícone, ou a janela do ícone pode fechar sozinha. Feche a janela do
     ícone, se ainda estiver aberta, e aceite o pedido. Reabra o ícone.
     Esperado: a caixa está marcada (o PJe ficou ligado mesmo com o ícone
     fechado durante o pedido).
   - Variante: num perfil em que o PJe esteja desligado, importe um
     certificado e use o botão **Usar também no PJe** no fim da importação.
     Esperado: o mesmo pedido e o mesmo aviso.
   - Recusar o pedido deixa a caixa desmarcada, e o PJe segue desligado.

2. **Certificado antigo e reimportação.** Esperado, antes de reimportar: no
   ícone, o certificado aparece com "Importe de novo para usar no PJe.". No
   login do PJe (passo 3), a janela do Jamegão diz que o certificado foi
   importado antes do suporte ao PJe e só oferece **Fechar**; nada é
   assinado. Então importe o **mesmo** PFX (ícone → **Importar
   certificado**). Esperado: um só certificado na lista (o registro foi
   substituído, não duplicado), sem o aviso. Se o ícone disser que o arquivo
   não trouxe as autoridades certificadoras, anote: o PJe pode recusar.

3. **Login no PJe do TJMA.** Recarregue a página do PJe do TJMA e entre por
   certificado. Esperado:
   - na primeira vez em cada site, a janela pergunta se ele pode ver os
     certificados (o login fica em `sso.cloud.pje.jus.br`; o tribunal, em
     `pje.tjma.jus.br`);
   - a janela mostra "Entrar no PJe de https://sso.cloud.pje.jus.br com o
     certificado de [seu nome]" (pede a senha do cofre na mesma janela, se
     travado), com os botões **Confirmar**, **Recusar**, **Bloquear este
     site** e **Usar o programa instalado**;
   - o login conclui, sem o programa do PJe rodando.

4. **Assinatura de documentos no TJMA.** Num cadastro de processo ou numa
   petição em elaboração com dois ou mais documentos, mande assinar.
   Esperado: uma janela "Assinar N documentos no PJe de
   https://pje.tjma.jus.br com o certificado de [seu nome]", com o número
   certo de documentos; uma confirmação para o lote; o PJe mostra cada
   documento assinado. Não protocole só para testar.

5. **Login num TRT ou TRF.** Entre por certificado no PJe de um Tribunal
   Regional do Trabalho ou Federal (por exemplo, o do seu estado). Esperado:
   igual ao passo 3. Se nenhuma janela abrir e o PJe disser que o assinador
   não está disponível, abra o ícone: ele deve mostrar "O PJe pediu uma
   operação que o Jamegão ainda não faz: [operação] em [site]". Anote a
   operação e o site.

6. **"Usar o programa instalado".** Com o programa do PJe instalado e
   rodando, peça o login e clique em **Usar o programa instalado** na
   janela do Jamegão. Esperado: a janela fecha e quem atende é o programa.
   Peça o login de novo logo em seguida: a janela do Jamegão volta na hora
   (esse botão não pausa o site por 15 s). Sem o programa rodando, o mesmo
   botão leva ao aviso do próprio PJe de que o assinador não está
   disponível.

7. **Bloquear este site no PJe (opcional).** Clique em **Bloquear este
   site** no login. Esperado: as tentativas seguintes naquele site vão
   direto ao programa instalado (ou ao aviso do PJe), sem janela do
   Jamegão. Desfaça com **Desbloquear** no ícone.

8. **e-SAJ do TJSP sem mudança.** Faça o login no e-SAJ do TJSP com o PJe
   ligado. Esperado: igual ao passo 2 do roteiro do e-SAJ, com o texto
   "Assinar 1 documento com o certificado de [seu nome]" e sem o botão
   **Usar o programa instalado**.

9. **Desligar (opcional).** Desmarque a caixa no ícone e recarregue o PJe.
   Esperado: o Jamegão não responde mais no PJe; atende o programa
   instalado, se houver.

No console da página do PJe (F12 → Console), os avisos do Jamegão começam
com `[Jamegão]` (por exemplo, quando o PJe recusa um documento). Mande-os
junto, se algo falhar.

### Se algo falhar, me mande

- O passo e o navegador.
- O console da página do e-SAJ ou do PJe: F12 → Console.
- O console da extensão:
  - Chromium/Brave: em `chrome://extensions`, no cartão do Jamegão, clique
    em "service worker".
  - Firefox: em `about:debugging`, clique em "Inspecionar" no Jamegão.
- Uma captura da janela de confirmação, se ela abriu.

Não mande a senha do cofre nem o PFX.

## Android (Firefox do Android, pelo Waydroid)

Desde a 0.2.0, sem janelas (Firefox do Android), a confirmação abre numa aba,
que fecha sozinha depois da resposta e devolve você à aba do e-SAJ. Fechar a
aba de confirmação vale como recusar.

### Preparar (uma vez)

1. Com o Waydroid rodando (`waydroid session start` e `waydroid show-full-ui`),
   baixe o Firefox para Android na versão **x86_64**, em
   `https://ftp.mozilla.org/pub/fenix/releases/` (arquivo
   `fenix-<versão>.multi.android-x86_64.apk`), e instale:
   `waydroid app install fenix-<versão>.multi.android-x86_64.apk`
2. No Firefox do Android: **Configurações → Depuração remota via USB**, ligado.
3. Ligue o adb ao Waydroid: `waydroid status` mostra o IP; então
   `adb connect <IP>:5555` e confira com `adb devices`.
4. Copie o PFX para o Android: `adb push certificado.pfx /sdcard/Download/`.

### Carregar a versão de teste (sem loja)

Na pasta do repositório (ramo `android`), com o Node instalado:

    npx web-ext run -t firefox-android --adb-device <IP>:5555 --firefox-apk org.mozilla.firefox -s ext

O Firefox abre no Waydroid com o Jamegão carregado como temporário (some ao
fechar). Se não abrir, tente acrescentar
`--firefox-apk-component org.mozilla.fenix.HomeActivity`.

### Roteiro

1. A página de importação abre: escolha o PFX em **Download**, a senha dele
   e crie a senha do cofre.
2. Abra o e-SAJ do TJSP e entre por certificado. Se o portal não mostrar a
   aba de certificado, use **⋮ → Site para computador**.
3. Esperado: abre uma **aba** "Confirmação - Jamegão"; ao confirmar, ela fecha
   e você volta ao e-SAJ, que conclui o login.
4. Repita fechando a aba de confirmação em vez de responder: o e-SAJ recebe
   o cancelamento.
5. Toque no ícone do Jamegão (menu **⋮ → Extensões → Jamegão**): a página
   do ícone abre e cabe na tela.

## Parte 2 — Suíte automática

Precisa de Node 22 ou mais novo e de Chrome ou Chromium instalado.

    npm run preparar     # baixa as cópias do SDK usadas nos testes e instala dependências
    npm run unit         # testes de unidade (≈3 s)
    npm run e2e          # ponta a ponta no Chrome (≈4 min)

Para o Firefox (testado no 161, headless, ≈5 min):

    BROWSER=firefox FIREFOX_BIN=/caminho/do/firefox npm run e2e

O harness já põe `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` (sem isso o WebDriver BiDi
recusa navegar para `moz-extension://`); quem abrir o Firefox por outro
caminho precisa pôr essa variável. Além disso, o BiDi do Firefox ignora
de propósito os documentos de extensão (bug 1755014 da Mozilla): não emite
`load`, não atualiza `page.url()`, não avisa quando uma janela de extensão
fecha e recusa `input.*` e `evaluateOnNewDocument` nelas. O harness contorna
isso só no Firefox (`apoiarPaginasDaExtensao`): espera o documento por
`evaluate`, lê o URL real por um relógio, dá a janela por fechada quando o
contexto some (duas falhas seguidas), e faz `click`, `reload` e `uploadFile` dentro
da página. Atenção: o clique é `el.click()`, sem evento de ponteiro real nem
ativação do usuário. Quando
a Mozilla corrigir o bug, o apoio pode sair.

Um arquivo só, por exemplo para repetir o de convivência:

    node --test test/e2e/convivencia.test.mjs

Estado em 24/11/2026 (0.3.0, ramo `pje`): unidade 284/284; ponta a ponta
no Chrome 75 de 77, com 2 SKIP (dois casos só do Firefox), e no Firefox 161
73 de 77, com 4 SKIP: três casos encerram o fundo, o que o BiDi do Firefox
não faz ("fundo encerrado no meio do lote" e dois do registro do PJe), e
"ligar pelo popup", porque o clique automático não conta como gesto para o
pedido de permissão.
