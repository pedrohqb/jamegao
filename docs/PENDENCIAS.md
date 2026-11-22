# Pendências da v0.1

Estado em 21/11/2026, 22h45. Ramo `v0.1`. Testes: unidade 127/127; ponta a ponta
no Chrome 38 testes, com um intermitente (item 9 abaixo). O Firefox nunca foi executado (não havia Firefox no ambiente
de desenvolvimento).

A revisão final do ramo inteiro não achou nenhum caminho em que uma página
obtenha dados do certificado ou uma assinatura sem site autorizado, cofre
destravado e confirmação. Veredito: pronto para teste manual no Chrome (TJSP);
não pronto para envio às lojas.

## Corrigir antes do envio às lojas (achados da revisão final)

1. **"Travar agora" não apaga os créditos de assinatura.** Quem trava no meio
   de um lote e depois digita a senha vê só o pedido de senha, sem a
   quantidade, e o crédito antigo é gasto. Limpar créditos ao travar e sempre
   reapresentar o que será assinado.
2. **TJAL fora do manifesto.** Só `esaj.tjsp.jus.br` está na lista. Falta o
   endereço do e-SAJ do TJAL (a confirmar com Pedro) e os demais tribunais.
3. **Confirmação órfã ainda pode ser aprovada depois de vencida.** `answer` e
   `describe` não conferem a idade do pedido.
4. **`storage.local` não fica fechado aos scripts de conteúdo.** O
   `setAccessLevel` provavelmente só vale para `storage.session`. Um processo
   de página comprometido do e-SAJ leria o sal e o valor de conferência do
   cofre (o que permite tentar senhas fora do navegador) e poderia zerar o
   contador de tentativas. As chaves continuam protegidas no IndexedDB. Mover
   `vaultMeta` e `lockout` para o IndexedDB.
5. **O desenho diz "chave não exportável", mas o `signHash` precisa exportá-la**
   para JavaScript. É inevitável sem WebAssembly; corrigir o texto do desenho.
6. **Janela de confirmação pode ser reaberta em laço** por um site autorizado
   depois de uma recusa. Pôr uma pausa por origem ou um botão "Bloquear este
   site" na janela.
7. **Aceite que falha no meio** pode deixar o site autorizado sem o crédito,
   e a aba esperando 120 s.
8. **Teste negativo do script de conteúdo** usa página `data:`; trocar por
   `127.0.0.1`.

9. **Teste intermitente de convivência** (`convivencia.test.mjs`, "página já
   aberta: escolher a oficial cala o Jamegão na mesma página"): falhou em 2 de
   5 execuções. Indício: logo depois de ligar o interruptor, um pedido ainda
   é respondido pelo Jamegão com a recusa "Neste site a extensão oficial
   responde", antes da oficial. Causa não confirmada. O Jamegão deveria ficar
   calado nesse caso, em vez de responder com recusa.

## Firefox

O suporte foi escrito por leitura da documentação e nunca rodou. Para testar:

    BROWSER=firefox FIREFOX_BIN=/caminho/do/firefox npm run e2e

Falha mais provável na primeira execução: o script de conteúdo não ser
injetado, por falta de concessão de acesso ao site numa instalação temporária.

## Com Pedro (Task 13 do plano)

- Confirmar o identificador do Firefox (hoje provisório:
  `jamegao@pedrohqb.github.io`). É permanente depois do primeiro envio.
- Informar o endereço do e-SAJ do TJAL e de outros tribunais a incluir.
- Carregar `ext/` no Chromium e fazer o login no e-SAJ do TJSP.
- Conferir se a tela de login usa `signHash` ou `signData`.
- Decidir se os dados do certificado podem ser listados com o cofre travado
  (hoje podem, desde que o site esteja autorizado).

## Menores adiados

Estão no registro de execução do plano; nenhum impede o teste manual.
