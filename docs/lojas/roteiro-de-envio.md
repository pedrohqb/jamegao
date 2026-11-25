# Roteiro de envio às lojas

Legenda: **[PEDRO]** = só você pode fazer (contas, aceite de termos, pagamentos, envio final). Os demais passos são mecânicos.

Textos prontos: nome, resumo e descrição longa em `docs/lojas/descricao.md`; política de privacidade em `PRIVACIDADE.md` (URL pública: https://github.com/pedrohqb/jamegao/blob/main/PRIVACIDADE.md, depois que o repositório estiver publicado).

## 0. Antes de tudo

1. Rode `npm run empacotar`. O arquivo `dist/jamegao-<versão>.zip` é o mesmo para as duas lojas.
2. ID do Firefox: `jamegao@pedrohqb.github.io` (confirmado por Pedro em 22/11/2026). Fica permanente a partir do primeiro envio ao addons.mozilla.org; não troque.
3. Ícones: `ext/icons/` (fonte em `docs/marca/icone.svg`; o de 128 px é `ext/icons/icon-128.png`). Capturas de tela prontas, 1280x800, com dados fictícios: `docs/lojas/capturas/1-assinatura.png` a `4-importar.png`. Imagem promocional pequena (440x280, Chrome): `docs/lojas/capturas/promocional-440x280.png`. Para refazer: `node scripts/capturas.mjs <pasta>` e `python3 scripts/compor-capturas.py <pasta> docs/lojas/capturas`.

## 1. Chrome Web Store

1. **[PEDRO]** Crie a conta de desenvolvedor em https://chrome.google.com/webstore/devconsole: aceite o contrato e pague a taxa única de inscrição.
2. No painel, clique em "Novo item" e envie o zip.
3. Aba "Listagem da loja": cole o nome (`Jamegão`), o resumo e a descrição longa de `docs/lojas/descricao.md`; envie o ícone de 128 px, as quatro capturas e a imagem promocional pequena; categoria "Produtividade"; idioma Português (Brasil).
4. Aba "Práticas de privacidade":
   - Finalidade única: "Entrar e assinar documentos nos sites do e-SAJ e do PJe com certificado digital A1 guardado no próprio navegador, sem instalar programa."
   - Justificativa da permissão `storage`: "Mantém, só enquanto o navegador estiver aberto, a chave do cofre destravado e as autorizações de assinatura em curso (storage.session). Os certificados, com a chave privada cifrada pela senha do cofre, e as configurações ficam no IndexedDB da extensão. Nada é enviado ao desenvolvedor nem a terceiros."
   - Justificativa da permissão `alarms`: "Agenda o bloqueio automático do cofre após 30 minutos sem uso."
   - Justificativa da permissão `scripting`: "Quando o usuário liga o PJe, registra os scripts que atendem o PJe nos sites do Judiciário (scripting.registerContentScripts); ao desligar, retira o registro. Sem o PJe ligado, não é usada."
   - Justificativa da permissão de host opcional `https://*.jus.br/*`: "Pedida só quando o usuário marca 'Usar também no PJe'. O PJe está em dezenas de endereços sob .jus.br, sem padrão de nome. Nesses sites, o script só trata as imagens com que a página do PJe chama o assinador local (http://localhost:8800/...), pede a assinatura à extensão, com a confirmação do usuário, e a própria página envia o resultado ao seu servidor. Precisa rodar no mundo da página (world MAIN) porque é a página que cria essas imagens. Não lê nem altera outras páginas, e a extensão não faz requisição alguma. O pedido de permissão do Chrome descreve esse padrão como 'qualquer site' porque jus.br é sufixo público; o acesso concedido é só a https://*.jus.br/*."
   - Justificativa do script de conteúdo (hosts `https://esaj.tjsp.jus.br/*`, `https://www2.tjal.jus.br/*`, `https://esaj.tjms.jus.br/*`, `https://esaj.tjac.jus.br/*`, `https://esaj.tjce.jus.br/*`, `https://esaj.tjba.jus.br/*`): "Necessário para que o site do e-SAJ encontre a extensão e peça a assinatura de documentos. O script só repassa as solicitações de assinatura do próprio site à extensão e não lê nem altera outras páginas."
   - Código remoto: "Não" (todo o código está no pacote).
   - Dados do usuário coletados: nenhum (deixe todas as caixas desmarcadas e marque as três declarações de conformidade).
   - URL da política de privacidade: a do cabeçalho deste roteiro.
5. Aba "Distribuição": visibilidade **"Não listado"** (só quem tem o link instala); regiões: todas, ou só Brasil.
6. **[PEDRO]** Clique em "Enviar para revisão" (e, se pedido, verifique o e-mail de contato). Depois da aprovação, o link do item aparece no painel.

## 2. addons.mozilla.org (Firefox)

1. **[PEDRO]** Crie a conta em https://addons.mozilla.org/developers/ (conta Firefox) e aceite o Contrato de Distribuição.
2. "Enviar novo complemento" e escolha **"Por conta própria" ("On your own")**: distribuição não listada, em que a Mozilla assina o arquivo e você mesmo divulga o link. Envie o mesmo zip.
3. Se pedido, indique que não há código-fonte separado (o pacote não usa build nem minificação próprios; `vendor/forge.min.js` é a biblioteca node-forge sem alteração, e licença em `vendor/forge-LICENSE`).
4. Coleta de dados: "nenhum" (o manifesto já declara `data_collection_permissions: none`).
5. Notas ao revisor, se houver campo (o texto atual, da 0.3.0, está em `docs/lojas/ficha-mozilla.md`, "Notas para os revisores"): "Extensão sem servidor próprio e sem conexões de rede: assina localmente com certificado A1 importado pelo usuário. Permissões: storage (sessão do cofre destravado), alarms (bloqueio automático do cofre) e scripting (registro dos scripts do PJe, só quando o usuário liga o recurso). Dados persistentes no IndexedDB da extensão. Script de conteúdo fixo apenas nos portais e-SAJ de TJSP, TJAL, TJMS, TJAC, TJCE e TJBA. Permissão opcional https://*.jus.br/*: pedida (permissions.request) só quando o usuário marca "Usar também no PJe" no popup ou no fim da importação, porque o PJe está em dezenas de endereços sob .jus.br, sem padrão de nome. Com ela, a extensão registra (scripting.registerContentScripts) dois scripts em https://*.jus.br/*, excluídos os endereços do e-SAJ: protocolos/pje/pagina.js no mundo MAIN e protocolos/pje/conteudo.js no mundo isolado. O do mundo MAIN é necessário porque a página do PJe chama o assinador local pelo endereço de uma imagem (http://localhost:8800/...): o script trata só essas imagens, pede a assinatura à extensão, que pede a confirmação do usuário em janela própria, e a própria página envia o resultado ao seu servidor, na mesma origem. A extensão não faz requisição alguma, nem ao localhost; qualquer outra imagem passa intacta. vendor/forge.min.js é o node-forge 1.4.3 sem alteração (dist/forge.min.js do pacote npm); o aviso do validador sobre o construtor Function vem dele. O aviso de que background.service_worker é ignorado pelo Firefox é esperado: o mesmo manifesto serve ao Chrome, que usa service_worker, e ao Firefox, que usa background.scripts. Código: https://github.com/pedrohqb/jamegao"
6. **[PEDRO]** Envie. A assinatura de um complemento não listado costuma sair em minutos ou horas; baixe o `.xpi` assinado na página de versões e distribua o arquivo.

## 3. Situação

- 22/11/2026: Chrome Web Store, enviada e publicada no mesmo dia (https://chromewebstore.google.com/detail/pkmhmpmgojhgogcklacckpideochcggj). addons.mozilla.org, aprovada e assinada.

## 4. Depois do envio

- A cada nova versão: aumente `version` em `ext/manifest.json`, rode `npm run empacotar` e envie o novo zip nas duas lojas.

## 5. Nova versão (a partir da 0.1.1)

1. Suba `version` em `ext/manifest.json` e `package.json` e rode
   `npm run unit`, `npm run e2e` no Chrome e no Firefox e `npm run empacotar`.
   Desde a 0.3.0, o `updates.json` não ganha entrada nova: a versão não tem
   `.xpi` no GitHub, e quem atualiza no Firefox é a Mozilla (decisão de
   Pedro, 24/11/2026). Ele fica só para quem ainda tem a 0.1.1 pelo `.xpi`.
2. Chrome Web Store: no item Jamegão, **Pacote** → **Enviar novo pacote**,
   escolha o zip e **Enviar para análise**.
3. addons.mozilla.org: **Enviar uma nova versão** → **Neste site** (listada,
   desde a 0.1.2) → o mesmo zip → código-fonte **Não**. O manifesto não pode
   ter `update_url`. Quando sair assinada, baixe o `.xpi` em **Gerenciar
   status e versões**, para a release do GitHub.
4. GitHub: crie a release `v<versão>` com o zip renomeado para
   `jamegao-<versão>-chromium.zip` (até a 0.2.0, também com o `.xpi`
   renomeado para `jamegao-<versão>-firefox.xpi`).
5. Na 0.3.0: use as notas de `docs/lojas/notas-0.3.0.md` na release e no
   campo de notas da versão das lojas, e as notas ao revisor acima (permissão
   opcional, script no mundo da página, node-forge sem alteração e avisos
   esperados do validador).
