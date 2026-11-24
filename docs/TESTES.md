# Guia de testes do Jamegão

Duas partes: o teste manual no e-SAJ, que só você pode fazer, e a suíte
automática, para quem mexer no código.

Regra combinada: login, sempre. Assinatura de petição, só quando houver uma
real para protocolar. Nada é protocolado só para testar.

## Parte 1 — Teste manual no e-SAJ

### Preparar

**Chromium ou Brave**

1. Baixe o ramo `v0.1` (ou descompacte o `jamegao-0.1.0.zip` numa pasta fixa).
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

### Se algo falhar, me mande

- O passo e o navegador.
- O console da página do e-SAJ: F12 → Console.
- O console da extensão:
  - Chromium/Brave: em `chrome://extensions`, no cartão do Jamegão, clique
    em "service worker".
  - Firefox: em `about:debugging`, clique em "Inspecionar" no Jamegão.
- Uma captura da janela de confirmação, se ela abriu.

Não mande a senha do cofre nem o PFX.

## Parte 2 — Suíte automática

Precisa de Node 22 ou mais novo e de Chrome ou Chromium instalado.

    npm run preparar     # baixa as cópias do SDK usadas nos testes e instala dependências
    npm run unit         # testes de unidade (≈3 s)
    npm run e2e          # ponta a ponta no Chrome (≈4 min)

Para o Firefox (nunca rodou; espere ajustes no harness):

    BROWSER=firefox FIREFOX_BIN=/caminho/do/firefox npm run e2e

Um arquivo só, por exemplo para repetir o de convivência:

    node --test test/e2e/convivencia.test.mjs

Estado em 22/11/2026: unidade 140/140, ponta a ponta no Chrome 39/39.
