# Pendências do Jamegão

## Versão 0.3.0 (ramo `pje`, 24/11/2026): PJe

Estado em 24/11/2026. Desenho em
`docs/superpowers/specs/2026-11-24-pje-design.md`; plano em
`docs/superpowers/plans/2026-11-24-pje.md`.

### O que a 0.3.0 traz

- Login (`sso.autenticador`) e assinatura de documentos
  (`cnj.assinadorHash`) no PJe com A1, sem o programa assinador. O PJe vem
  desligado e é ligado em "Usar também no PJe" (ícone ou fim da
  importação), que pede a permissão opcional `https://*.jus.br/*`.
- Nova permissão obrigatória `scripting`, sem aviso: a atualização não
  desativa ninguém no Chrome.
- A importação guarda a cadeia do certificado; os importados antes são
  marcados no ícone ("Importe de novo para usar no PJe.").
- Na janela do PJe: "Usar o programa instalado" (só aquele pedido) e
  "Bloquear este site" (o site passa ao programa de vez). Tarefas que o
  Jamegão não faz seguem para o programa instalado e aparecem no ícone.
- Código em núcleo comum + um módulo por protocolo (`ext/protocolos/esaj`,
  `ext/protocolos/pje`).
- `vendor/forge.min.js` segue idêntico ao node-forge (a política da Mozilla
  proíbe alterar bibliotecas de terceiros). O validador mostra dois avisos
  esperados: o construtor `Function` dentro da forge e o
  `background.service_worker` ignorado pelo Firefox.
- Textos: README (seção "PJe"), política de privacidade, descrição das
  lojas, ficha da Mozilla, notas ao revisor e notas da versão
  (`docs/lojas/notas-0.3.0.md`). Nenhum texto público cita as marcas nem o
  nome do programa do PJe (o teste de textos confere).
- `updates.json` sem entrada nova: a 0.3.0 não tem `.xpi` no GitHub (decisão
  de Pedro, 24/11/2026).

### Testado pela suíte automática

Unidade 284/284. Ponta a ponta no Chrome e no Firefox 161 (números no fim de
`docs/TESTES.md`), com páginas do PJe imitadas: login no SSO, lote de
documentos no TJMA, `toJSON` do Prototype.js, tarefa desconhecida,
`modoTeste`, destino de outra origem e redirecionamento recusados, site
bloqueado e nenhum certificado (a chamada segue para o `localhost`), dois
certificados com escolha, certificado sem cadeia, "Usar o programa
instalado", ligar e desligar pelo ícone e pela importação, permissão retirada
por fora (Firefox), nenhuma requisição da extensão nem a `:8800` nas tarefas
atendidas, e-SAJ sem os scripts do PJe e toda a suíte do e-SAJ intacta.

Não coberto pela suíte: no Firefox, o caminho real "clique → pedido de
permissão → registro" (o clique automático não conta como gesto do
usuário); só o teste manual prova.

### Com Pedro, antes de publicar

- Roteiro manual do PJe (`docs/TESTES.md`, "Roteiro do PJe"), no Brave e no
  Firefox: ligar o PJe (no Firefox, inclusive com o pedido de permissão atrás
  da janela do ícone), reimportar o PFX, login e assinatura de documentos no
  TJMA, login num TRT ou TRF, "Usar o programa instalado" e o e-SAJ do TJSP
  sem mudança.
- O README, as descrições das lojas e as notas da versão dizem que login e
  assinatura foram testados no TJMA, no Brave, "numa versão de teste
  anterior à 0.3.0" (a spike, `pje-spike`, 24/11/2026). Depois do teste
  manual da 0.3.0, esses textos passam a dizer o que foi testado nela.
- Enviar às duas lojas: zip `dist/jamegao-0.3.0.zip`, notas da versão e notas
  ao revisor (`docs/lojas/roteiro-de-envio.md`, seção 5). O aviso da
  validação da Mozilla de que `background.service_worker` é ignorado pelo
  Firefox fica (um manifesto só para os dois navegadores) e está explicado
  nas notas ao revisor.
- Criar a release `v0.3.0` no GitHub, só com o zip para Chromium.

## Histórico (0.1 a 0.2.0)

Estado em 22/11/2026, 1h30. Ramo `v0.1`. Testes: unidade 140/140; ponta a
ponta no Chrome 39/39.

### Testado por Pedro

- Primeira petição real assinada e protocolada com a 0.1.0: e-SAJ do TJSP,
  Firefox, Linux (Bluefin), 23/11/2026.
- 0.1.1 (24/11/2026), em perfis de teste do Brave e do Firefox: sem as
  oficiais, o login funciona com a janela do Jamegão; com Web PKI e
  WebSigner ativos, o Jamegão se desliga e a oficial responde, sem CERT-99.
- Login no e-SAJ do TJSP com a v0.1 no Brave e no Firefox (extensão
  temporária). Sem extensão oficial, sem componente nativo.
- Login no e-SAJ do TJSP no OpenBSD (22/11/2026).
- Protótipo anterior: login e assinatura no TJSP e no TJAL, Chromium e Firefox.

Falta testar: petição real no Chromium e os tribunais além do TJSP.

### Corrigido depois da revisão final (21/11, noite)

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

### Firefox

O login manual funcionou. A suíte automática nunca rodou no Firefox (não há
Firefox no ambiente de desenvolvimento). Para rodar:

    BROWSER=firefox FIREFOX_BIN=/caminho/do/firefox npm run e2e

### Versão 0.1.1 (23/11/2026, liberada em 24/11)

- Com extensão oficial na página, o Jamegão se desliga (decisão de Pedro,
  depois do erro CERT-99 com Web PKI e WebSigner ativos nos dois
  navegadores). O interruptor "deixar a extensão oficial responder" saiu.
  Testado na suíte com a oficial imitada (elemento de detecção e resposta
  alheia, no Chrome) e por Pedro com as oficiais de verdade, no Brave e no
  Firefox (24/11).
- Atualização automática no Firefox: `update_url` aponta para `updates.json`
  na raiz do repositório, servido pelo GitHub, que aponta para o `.xpi` da
  release. A cada versão: acrescentar a entrada no `updates.json` e publicar
  o `.xpi` assinado na release com o nome `jamegao-<versão>-firefox.xpi`.
- Firefox mínimo 140 e Android mínimo 142 (exigidos pelo
  `data_collection_permissions`), o que cala os dois alertas da validação.

### Versão 0.2.0 (ramo `android`): Firefox do Android

- Sem `api.windows` (Firefox do Android), a confirmação abre numa aba; ao
  responder, a aba fecha e o foco volta à aba do e-SAJ; fechar a aba de
  confirmação recusa e pausa o site, e fechar a aba do e-SAJ fecha a
  confirmação junto. No computador nada muda (continua janela).
- Páginas com `viewport` para tela de celular; ícone com largura limitada.
- Testes de unidade cobrem o modo aba; a suíte de ponta a ponta roda no
  Chrome (com janelas), então o modo aba só é provado no teste manual pelo
  Waydroid (`docs/TESTES.md`, seção Android).
- A declaração `gecko_android` (mínimo 142) fica: agora o Android é suportado
  de verdade.
- Testada por Pedro no Waydroid (Firefox do Android x86_64, 24/11/2026):
  importação do PFX, login no TJSP com a confirmação em aba (fecha e volta ao
  e-SAJ) e recusa fechando a aba. Na recusa, o e-SAJ mostra o mesmo CERT-99
  genérico que mostra ao clicar em Recusar no computador.
- Falta: enviar às duas lojas (Mozilla listada; Chrome junto, pelo
  `viewport` e pela largura do ícone).

### Versão 0.1.2 (24/11/2026): listada na Mozilla

- Igual à 0.1.1, sem `update_url` no manifesto: vai à Mozilla como "Neste
  site" (listada), e quem atualiza é a própria loja, inclusive quem ficou na
  0.1.0 (o Firefox consulta a Mozilla para extensões sem endereço próprio).
- Quem tem a 0.1.1 pelo `.xpi` chega à 0.1.2 pelo `updates.json`, que aponta
  para `jamegao-0.1.2-firefox.xpi` na release `v0.1.2` do GitHub; daí em
  diante, a Mozilla atualiza. O `updates.json` fica no repositório para isso.
- Na Chrome Web Store, a 0.1.1 basta (o código é o mesmo; o Chrome ignora a
  linha que mudou). A 0.1.2 pode ir junto na próxima mudança de verdade.
- A release `v0.1.1` no GitHub não precisa ser criada: a `v0.1.2` a
  substitui.
- A 0.1.2 nunca foi analisada: a Mozilla a desativou quando a 0.2.0 entrou
  na fila. Saiu do `updates.json`.

### Envio às lojas (22/11/2026)

- Chrome Web Store: enviada para análise e publicada no mesmo dia, cerca de
  três horas depois: https://chromewebstore.google.com/detail/pkmhmpmgojhgogcklacckpideochcggj
- addons.mozilla.org: aprovada e assinada no mesmo dia (identificador
  `jamegao@pedrohqb.github.io`, definitivo). O `.xpi` assinado é idêntico ao
  zip enviado (a Mozilla só reformata o `manifest.json`); SHA-256
  `d61d86952f0e62322062f63b67da67428bf9e8cc1defc39e0ef8ff5e414b0841`.
  Pedro instalou o `.xpi` no Firefox.
- Release v0.1.0 no GitHub, com o `.xpi` e o zip: a criar por Pedro (a
  sessão do Claude não pode criar releases).

### Com Pedro

- Testar a assinatura de uma petição real (Chromium e Firefox).
- Abrir a tela de login por certificado em TJMS, TJAC, TJCE ou TJBA, se
  tiver acesso.
- Conferir se a tela de login usa `signHash` ou `signData`.
- Decidir se os dados do certificado podem ser listados com o cofre travado
  (hoje podem, desde que o site esteja autorizado).

### Menores adiados

Estão no registro de execução do plano; nenhum impede o uso.
