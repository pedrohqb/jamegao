# Roteiro de envio às lojas

Legenda: **[PEDRO]** = só você pode fazer (contas, aceite de termos, pagamentos, envio final). Os demais passos são mecânicos.

Textos prontos: nome, resumo e descrição longa em `docs/lojas/descricao.md`; política de privacidade em `PRIVACIDADE.md` (URL pública: https://github.com/pedrohqb/jamegao/blob/main/PRIVACIDADE.md, depois que o repositório estiver publicado).

## 0. Antes de tudo

1. Rode `npm run empacotar`. O arquivo `dist/jamegao-<versão>.zip` é o mesmo para as duas lojas.
2. **Atenção ao ID do Firefox.** O ID em `browser_specific_settings.gecko.id` do `ext/manifest.json` (`jamegao@pedrohqb.github.io`) é provisório. Confirme-o (ou troque-o) ANTES do primeiro envio ao addons.mozilla.org: depois que uma versão é enviada com um ID, ele não pode mudar sem criar outro complemento. Se trocar, gere o zip de novo.
3. Ícones: `ext/icons/` (fonte em `docs/marca/icone.svg`). Capturas de tela (1280x800 ou 640x400): tire do popup e da tela de confirmação, com dados fictícios.

## 1. Chrome Web Store

1. **[PEDRO]** Crie a conta de desenvolvedor em https://chrome.google.com/webstore/devconsole: aceite o contrato e pague a taxa única de inscrição.
2. No painel, clique em "Novo item" e envie o zip.
3. Aba "Listagem da loja": cole o nome (`Jamegão`), o resumo e a descrição longa de `docs/lojas/descricao.md`; envie o ícone de 128 px e as capturas; categoria "Produtividade"; idioma Português (Brasil).
4. Aba "Práticas de privacidade":
   - Finalidade única: "Assinar documentos nos sites do e-SAJ com certificado digital A1 guardado no próprio navegador, sem instalar programa."
   - Justificativa da permissão `storage`: "Guarda no perfil do navegador os certificados A1 importados pelo usuário, com a chave cifrada pela senha do cofre, e as configurações da extensão. Nada é enviado ao desenvolvedor nem a terceiros."
   - Justificativa da permissão `alarms`: "Agenda o bloqueio automático do cofre após 30 minutos sem uso."
   - Justificativa do script de conteúdo (hosts `https://esaj.tjsp.jus.br/*`, `https://www2.tjal.jus.br/*`, `https://esaj.tjms.jus.br/*`, `https://esaj.tjac.jus.br/*`, `https://esaj.tjce.jus.br/*`, `https://esaj.tjba.jus.br/*`): "Necessário para que o site do e-SAJ encontre a extensão e peça a assinatura de documentos. O script só repassa as solicitações de assinatura do próprio site à extensão e não lê nem altera outras páginas."
   - Código remoto: "Não" (todo o código está no pacote).
   - Dados do usuário coletados: nenhum (deixe todas as caixas desmarcadas e marque as três declarações de conformidade).
   - URL da política de privacidade: a do cabeçalho deste roteiro.
5. Aba "Distribuição": visibilidade **"Não listado"** (só quem tem o link instala); regiões: todas, ou só Brasil.
6. **[PEDRO]** Clique em "Enviar para revisão" (e, se pedido, verifique o e-mail de contato). Depois da aprovação, o link do item aparece no painel.

## 2. addons.mozilla.org (Firefox)

1. **[PEDRO]** Crie a conta em https://addons.mozilla.org/developers/ (conta Firefox) e aceite o Contrato de Distribuição.
2. "Enviar novo complemento" e escolha **"Por conta própria" ("On your own")**: distribuição não listada, em que a Mozilla assina o arquivo e você mesmo divulga o link. Envie o mesmo zip.
3. Se pedido, indique que não há código-fonte separado (o pacote não usa build nem minificação próprios; `vendor/forge.min.js` é a biblioteca node-forge sem alterações, com licença em `vendor/forge-LICENSE`).
4. Coleta de dados: "nenhum" (o manifesto já declara `data_collection_permissions: none`).
5. Notas ao revisor, se houver campo: "Extensão sem servidor próprio e sem conexões de rede: assina localmente com certificado A1 importado pelo usuário. Permissões: storage (certificados e configurações), alarms (bloqueio automático do cofre). Script de conteúdo apenas nos portais e-SAJ de TJSP, TJAL, TJMS, TJAC, TJCE e TJBA."
6. **[PEDRO]** Envie. A assinatura de um complemento não listado costuma sair em minutos ou horas; baixe o `.xpi` assinado na página de versões e distribua o arquivo.

## 3. Depois do envio

- A cada nova versão: aumente `version` em `ext/manifest.json`, rode `npm run empacotar` e envie o novo zip nas duas lojas.
