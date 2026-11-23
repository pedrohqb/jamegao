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
   - Finalidade única: "Assinar documentos nos sites do e-SAJ com certificado digital A1 guardado no próprio navegador, sem instalar programa."
   - Justificativa da permissão `storage`: "Mantém, só enquanto o navegador estiver aberto, a chave do cofre destravado e as autorizações de assinatura em curso (storage.session). Os certificados, com a chave privada cifrada pela senha do cofre, e as configurações ficam no IndexedDB da extensão. Nada é enviado ao desenvolvedor nem a terceiros."
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
5. Notas ao revisor, se houver campo: "Extensão sem servidor próprio e sem conexões de rede: assina localmente com certificado A1 importado pelo usuário. Permissões: storage (sessão do cofre destravado) e alarms (bloqueio automático do cofre). Dados persistentes no IndexedDB da extensão. Script de conteúdo apenas nos portais e-SAJ de TJSP, TJAL, TJMS, TJAC, TJCE e TJBA. vendor/forge.min.js é o node-forge 1.4.3 sem alterações. Código: https://github.com/pedrohqb/jamegao"
6. **[PEDRO]** Envie. A assinatura de um complemento não listado costuma sair em minutos ou horas; baixe o `.xpi` assinado na página de versões e distribua o arquivo.

## 3. Situação

- 22/11/2026: Chrome Web Store, enviada e publicada no mesmo dia (https://chromewebstore.google.com/detail/pkmhmpmgojhgogcklacckpideochcggj). addons.mozilla.org, aprovada e assinada.

## 4. Depois do envio

- A cada nova versão: aumente `version` em `ext/manifest.json`, rode `npm run empacotar` e envie o novo zip nas duas lojas.

## 5. Nova versão (a partir da 0.1.1)

1. Suba `version` em `ext/manifest.json` e `package.json`, acrescente a
   entrada em `updates.json` e rode `npm run unit`, `BROWSER=chrome npm run e2e`
   e `npm run empacotar`.
2. Chrome Web Store: no item Jamegão, **Pacote** → **Enviar novo pacote**,
   escolha o zip e **Enviar para análise**.
3. addons.mozilla.org: **Enviar uma nova versão** → **Por conta própria** →
   o mesmo zip → código-fonte **Não**. Quando sair assinada, baixe o `.xpi`
   em **Gerenciar status e versões**.
4. GitHub: crie a release `v<versão>` com o `.xpi` renomeado para
   `jamegao-<versão>-firefox.xpi` (é o nome que o `updates.json` aponta) e o
   zip renomeado para `jamegao-<versão>-chromium.zip`.
