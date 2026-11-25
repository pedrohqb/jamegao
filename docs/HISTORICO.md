# Histórico

Este documento conta como o Jamegão chegou à forma atual, do protótipo, em novembro de 2026, à versão 0.3.0. Os testes reais foram feitos por Pedro, com certificado A1 de verdade:

- no Firefox e no Brave, no Bluefin e no CachyOS;
- no Firefox do OpenBSD;
- no Firefox do Android, pelo Waydroid.

O texto segue as versões em ordem. Os itens têm numeração corrida de ponta a ponta, para que se possa citar um deles pelo número. Cada problema traz o sintoma, a causa e a correção. Cada decisão traz o motivo.

As mudanças de cada versão, em detalhe, estão no histórico do git e em [Pendências](PENDENCIAS.md). As decisões de desenho estão em [`docs/superpowers/specs`](superpowers/specs).

## Antes da 0.1: o protótipo (até 21/11)

1. **A pergunta.** O ponto de partida foi saber se as extensões oficiais de assinatura do e-SAJ podiam ser trocadas por uma extensão pura, sem programa nativo, para Chromium e Firefox. Essas extensões dependem de um componente nativo instalado à parte, que não existe para todos os sistemas: não há versão para Mac com processador Apple, por exemplo. O alcance ficou restrito:
   - ao e-SAJ, porque os demais sistemas aceitavam o certificado direto no navegador (o PJe entrou depois, na 0.3.0);
   - ao certificado A1, porque o A3 em token ou cartão fica com o projeto irmão, o [Tessera](https://github.com/pedrohqb/tessera).
2. **A leitura do e-SAJ.** Pedro abriu no Chrome a tela de peticionamento do e-SAJ, e o código que o e-SAJ entrega à página foi lido ali. Ele mostrou cinco coisas:
   - **Detecção:** a página considera a extensão instalada quando existe um elemento cujo `id` é o identificador da extensão oficial.
   - **Pedidos:** saem por evento no `document` (Chromium) ou por `postMessage` (Firefox).
   - **Respostas:** voltam no formato `{requestId, success, response | exception}`.
   - **Duas famílias de SDK:** o login usa uma; no peticionamento pelo Firefox, conforme a configuração do tribunal, pode entrar a outra. A extensão precisa atender as duas.
   - **Comandos usados:** `listCertificates`, `readCertificate`, `preauthorizeSignatures`, `signHash` e `signData`, mais os de inicialização.
3. **O limite das plataformas.** Uma extensão não enxerga os certificados guardados no navegador nem no sistema; a API que faria isso só existe no ChromeOS. Pedro queria a extensão sem configuração, de preferência usando os certificados que o navegador já reconhece, mas isso não é possível. Por isso o PFX é importado para dentro da extensão.
4. **Segurança da chave importada.** Pedro levantou a dúvida de a importação ser menos segura. A resposta foram três medidas:
   - o cofre com senha;
   - a confirmação antes de cada assinatura;
   - a extensão sem nenhuma conexão de rede própria.
5. **O protótipo descartável.** O protótipo passou em 94 verificações automáticas no Chrome. Pedro o usou com sucesso no e-SAJ do TJSP e do TJAL, no Chromium e no Firefox. O SDK da página exige uma versão mínima da extensão e do componente nativo, e o protótipo passou a declarar uma versão alta o bastante.

## O desenho e o nome (21/11)

6. **Três caminhos foram considerados:**
   - **JavaScript puro, sem etapa de build (escolhido):** o que está no repositório é o que vai para a loja, arquivo por arquivo, o que torna a auditoria trivial e é a principal defesa contra uma atualização maliciosa.
   - **TypeScript com empacotador (descartado):** o pacote deixaria de ser o fonte, a revisão da Mozilla passaria a exigir o envio do código-fonte, e as bibliotecas modernas não leem PFX legado.
   - **Núcleo em Rust/WebAssembly (descartado):** poria um binário no pacote, por um ganho acima do teto de segurança de um A1.
7. **Decisões de Pedro no desenho:**
   - cofre com senha, que trava depois de 30 minutos sem uso;
   - confirmação a cada lote e a cada login;
   - só os e-SAJ conhecidos;
   - nenhuma comunicação de rede própria.

   Outras restrições:
   - a única biblioteca de terceiros é a node-forge, usada só na importação, porque o WebCrypto não decifra os PKCS#12 legados (3DES e RC2-40);
   - a chave precisa existir em JavaScript durante o `signHash`, porque o WebCrypto não assina um resumo já calculado.
8. **O nome.**
   - O primeiro nome foi Manu Propria; "Assinador PFX" era provisório.
   - Pedro quis algo melhor e escolheu **Jamegão**, "informal, mas bem específico": é como se diz, na fala popular, a assinatura de alguém.
   - A busca exata no INPI não deu resultado, e não havia homônimo nas lojas.
   - O repositório `pedrohqb/jamegao` é público desde o início, sob GPL-3.0; a ideia anterior de mantê-lo privado até a resposta das lojas foi abandonada.
   - O primeiro envio seria não listado, para ver como as lojas tratariam o uso dos identificadores das extensões oficiais. Nenhuma loja questionou.

## 0.1.0 (21 e 22/11)

9. **A implementação.** O plano da v0.1 foi executado em tarefas paralelas, com revisão a cada etapa. As tarefas foram:
   - a ponte entre a página e a extensão;
   - a assinatura RSA;
   - o cofre;
   - os sites e créditos de assinatura;
   - a leitura do PFX e dos certificados;
   - a decisão dos comandos;
   - a importação;
   - a confirmação;
   - o travamento e o bloqueio de rede;
   - o popup e a convivência com as oficiais;
   - o teste no Firefox;
   - o pacote e os textos.
10. **O que as revisões por etapa pegaram:**
    - destravar e criar o cofre ao mesmo tempo podiam se atropelar, e as duas operações passaram a correr em fila;
    - o órgão emissor e a UF do RG, que o certificado ICP-Brasil guarda juntos num campo, eram separados errado;
    - créditos e sites podiam se atropelar em gravações simultâneas;
    - o crédito de assinatura passou a ser consumido de forma atômica;
    - os erros internos passaram a ir opacos à página;
    - a importação passou a limpar as senhas da memória mesmo quando falha.
11. **As nove pendências da revisão final** (21/11, noite):
    - **"Travar agora" mantinha os créditos de assinatura.** Agora os apaga, e o cofre travado sempre mostra de novo o que será assinado.
    - **Manifesto:** ficou com os e-SAJ ainda em uso: TJSP, TJAL, TJMS, TJAC, TJCE (plantão) e TJBA. TJSC e TJAM tinham migrado de sistema e ficaram fora.
    - **Confirmação vencida:** não pode mais ser aprovada nem exibida.
    - **Dados do cofre em `storage.local`:** o sal, a conferência do cofre, o contador de tentativas e as decisões por site estavam num lugar que os scripts de conteúdo alcançam, e foram para o IndexedDB da extensão.
    - **Bloqueio:** a janela ganhou o botão "Bloquear este site". Depois de uma recusa, o site fica 15 segundos sem poder abrir outra janela.
    - **Aceite que falha no meio:** avisa a aba na hora, em vez de deixá-la esperando 120 segundos.
    - **Teste de convivência intermitente:** havia uma corrida real. Quando o site passava a preferir a oficial no meio de um pedido, o Jamegão respondia com recusa; agora fica calado.
    - As outras duas foram de texto e de teste.
12. **A janela reabria sozinha no Brave.**
    - *Sintoma:* sem resposta em 120 segundos, a janela de confirmação do login fechava e abria de novo.
    - *Causa:* quando a listagem de certificados falha, a tela de login do e-SAJ a repete na hora, até três vezes.
    - *Correção:* o prazo vencido passou a contar como recusa e pausa o site por 15 segundos, como a recusa.
13. **A revisão independente** (22/11, de madrugada) aprovou o trabalho com ressalvas, sem achado crítico. Os sete achados menores foram corrigidos:
    - um aceite que falha não deixa crédito sobrando;
    - toda janela antes de assinar mostra a quantidade de documentos;
    - a falha ao gravar um bloqueio é avisada;
    - as conexões do IndexedDB cedem quando outra versão da extensão pede;
    - a janela avisa quando o pedido expirou;
    - os demais foram de texto.
14. **Primeiro uso real:**
    - login no e-SAJ do TJSP no Brave e no Firefox, com a extensão carregada à mão, sem extensão oficial e sem componente nativo;
    - em 22/11, login também no Firefox do OpenBSD, num ThinkPad X230.
15. **As lojas** (22/11):
    - **Chrome Web Store:** a 0.1.0 foi publicada cerca de três horas depois do envio.
    - **Mozilla:** aprovou e assinou a versão não listada no mesmo dia. O identificador definitivo é `jamegao@pedrohqb.github.io`, e o `.xpi` assinado é idêntico ao zip enviado.
    - **Validação da Mozilla:** apontou quatro alertas sem efeito.
      - Dois sumiriam com versões mínimas mais altas (Firefox 140 e Android 142), porque a declaração de coleta de dados só existe a partir delas.
      - Os outros dois são esperados: o `background.service_worker`, que o Firefox ignora (ele usa `background.scripts`, e o manifesto é um só), e o construtor `Function` dentro da node-forge.
16. **O README** foi refeito em tom didático, no modelo do Tessera.

## 0.1.1 (23 e 24/11): a extensão oficial na página

17. **A primeira petição.** Em 23/11, Pedro assinou e protocolou uma petição real com a 0.1.0, no e-SAJ do TJSP, pelo Firefox, no Bluefin.
18. **CERT-99 com as oficiais ativas.**
    - *Sintoma:* com as extensões oficiais ativas no mesmo navegador, o login no e-SAJ falhava com CERT-99, nos dois navegadores.
    - *Causa:* a página fica com a primeira resposta que chega, e a oficial responde na hora "certificado não encontrado" para o A1 do Jamegão.
    - *Desenho anterior:* o Jamegão respondia mesmo com a oficial presente, com um interruptor por site.
    - *Decisão de Pedro:* "não vejo sentido ter o Jamegão para quem já tem o oficial".
    - *Correção:* o Jamegão percebe a oficial pelo elemento de detecção dela ou por uma resposta que não é sua. Então retira os próprios elementos, abandona a confirmação pendente e não responde mais nada naquela página. O interruptor saiu, e o ícone avisa em que sites o Jamegão se desligou.
    - Pedro segurou a 0.1.1 até o primeiro protocolo e a testou em 24/11, com e sem as oficiais, no Brave e no Firefox.
19. **Atualização automática fora da loja.**
    - A versão não listada da Mozilla não se atualiza pela loja. A 0.1.1 ganhou um `update_url` que aponta para o `updates.json` na raiz do repositório, e ele aponta para o `.xpi` de cada release.
    - As versões mínimas subiram para Firefox 140 e Android 142, o que calou os dois alertas evitáveis.
20. **Textos públicos sem marcas.** README, textos das lojas e textos da extensão deixaram de citar os nomes das extensões oficiais e dos seus fornecedores. Um teste de unidade confere isso; os identificadores técnicos que o protocolo exige ficam só no código.

## 0.1.2 (24/11): listada na Mozilla, nunca analisada

21. **A tentativa de listar.**
    - *Objetivo:* Pedro considerou o Jamegão praticamente pronto e quis deixá-lo público também na Mozilla. A 0.1.2 era a 0.1.1 sem o `update_url`, porque uma versão listada é atualizada pela própria loja.
    - *O que aconteceu:* a 0.1.2 foi excluída antes de ser analisada, ao ser enviada a 0.2.0, que passou a ocupar o lugar dela na fila da versão listada (o registro de atividade do AMO mostra as duas coisas no mesmo minuto).
    - *Consequência:* a 0.1.2 saiu do `updates.json`.

## 0.2.0 (24/11): Firefox do Android

22. **Sem janelas, uma aba.**
    - *Problema:* o Firefox do Android não tem `api.windows`.
    - *Solução:* lá, a confirmação abre numa aba. Ela fecha sozinha depois da resposta e devolve o foco à aba do e-SAJ. Fechar a aba de confirmação vale como recusar, e fechar a aba do e-SAJ fecha a confirmação junto.
    - As páginas ganharam `viewport` de celular. No computador, nada muda.
23. **Teste no Waydroid.**
    - Pedro não tem aparelho Android e testou no Waydroid, no CachyOS: importação do PFX, login no TJSP com a confirmação em aba e recusa fechando a aba.
    - Na recusa, o e-SAJ mostra o mesmo CERT-99 genérico que mostra ao clicar em Recusar no computador.
24. **Publicação.**
    - A 0.2.0 foi enviada às duas lojas. Na Mozilla, como versão listada, foi para a fila de revisão manual, que pode levar de dias a semanas.
    - A release `v0.2.0` no GitHub saiu só com o zip para Chromium, sem `.xpi`.
    - As branches antigas foram apagadas do repositório.

## 0.3.0 (24 e 25/11): PJe

### A spike (24/11)

25. **A ideia.**
    - *Antes:* Pedro tinha descartado o PJe, porque o programa assinador do PJe, em Java, já roda em todo computador.
    - *Depois:* reconsiderou e quis o PJe no Jamegão, desde que dentro da regra de não fazer rede. Começou pelo TJMA, num perfil de teste do Brave.
26. **O protocolo do programa assinador.**
    - *Chamada:* a página não fala com extensão nenhuma. Ela cria uma imagem cujo endereço aponta para o programa local, em `http://localhost:8800/...`. O pedido vai no endereço, em JSON: servidor, sessão, tarefa.
    - *Resposta:* sai das dimensões da imagem: 1×1 é sucesso, 2×1 é erro, e uma falha de carga quer dizer que o programa não está rodando.
    - *Envio ao tribunal:* quem manda o resultado ao servidor do PJe é o próprio programa.
    - *Tarefas vistas:*
      - `sso.autenticador`, o login: assina uma mensagem e faz um POST JSON;
      - `cnj.assinadorHash`, a assinatura de documentos: assina com MD5withRSA um resumo MD5 já calculado e faz um POST de formulário por documento.
    - *Caminho escolhido:* interceptar essas imagens no mundo da página, assinar na extensão e deixar que **a própria página** envie o resultado ao seu servidor, com a sessão dela. Assim a extensão continua sem rede.
    - *Descartados:*
      - redirecionar o `localhost` para dentro da extensão pelas regras de rede do navegador, porque quem enviaria ao PJe seria a extensão;
      - um servidor local, porque seria instalar programa.
27. **Login na primeira tentativa.** O login no SSO do PJe do TJMA funcionou de primeira, com A1 real.
28. **A interceptação parou.**
    - *Sintoma:* o console mostrava `ERR_CONNECTION_REFUSED` para o `localhost:8800`, e a página reclamava do assinador.
    - *Causa:* a extensão tinha sido recarregada, mas a página aberta continuava sem o script, porque um script só entra nas páginas carregadas depois.
    - *Correção:* recarregar a extensão e depois a página. Isso virou instrução nos textos: depois de ligar o PJe, recarregue as páginas abertas.
29. **"Resumos do PJe inválidos".**
    - *Sintoma:* na assinatura de documentos, a lista de resumos chegava como texto, e o console dizia "Lista de resumos do PJe inválida (string)".
    - *Causa:* o PJe carrega o Prototype.js, que acrescenta `Array.prototype.toJSON` e faz o `JSON.stringify` da página transformar listas em texto.
    - *Correção:* uma conversão própria, que não passa pelo `toJSON`, e o fundo passou a aceitar a lista também em texto.
30. **Assinatura de documentos.**
    - Os dois documentos de um cadastro foram assinados, e o servidor respondeu "Sucesso" a cada um.
    - A cadeia do certificado foi aceita na ordem em que o Java a monta, a autoridade mais alta primeiro, na primeira tentativa.
    - O WebCrypto não tem MD5: o MD5 é calculado em JavaScript, e a assinatura do resumo usa o caminho do `signHash`.
    - Assinar não protocola. Pedro estranhou "assinar sem protocolar", mas o protocolo é o passo seguinte, na própria página do PJe.

### O desenho da versão pública (24/11)

31. **Modularidade, a pedido de Pedro.** Pedro pediu que outros sistemas de assinatura pudessem entrar depois sem refazer o que existe. O código foi separado em núcleo e protocolos:
    - **Núcleo** (`ext/lib`):
      - uma porta única para usar a chave (`assinar.js`), em que a chave sai sempre do armazém de certificados, nunca de quem chama;
      - o despacho por protocolo;
      - uma ponte comum aos scripts de conteúdo.
    - **Protocolos** (`ext/protocolos/esaj` e `ext/protocolos/pje`): um módulo por sistema. O e-SAJ virou o primeiro protocolo, sem mudar de comportamento.
32. **PJe desligado por padrão.**
    - *Por que opcional:* uma permissão obrigatória nova sobre `*.jus.br` desativaria a extensão no Chrome, na atualização, para todo mundo, inclusive para quem só usa o e-SAJ. Por isso ela é opcional e só é pedida quando o usuário marca "Usar também no PJe".
    - *Por que `*.jus.br`:* o PJe está em dezenas de endereços sob `.jus.br`, sem padrão de nome.
    - *A única permissão obrigatória nova:* `scripting`, que não gera aviso.
    - *O registro dos scripts:* com a permissão, o fundo registra, em tempo de execução, um script no mundo da página e outro no mundo isolado, nos sites `*.jus.br`, exceto os do e-SAJ.
    - Um teste de viabilidade provou esse registro antes de o resto ser construído.
33. **A cadeia do certificado.**
    - O PJe exige a cadeia completa, que o Jamegão não guardava.
    - A importação passou a guardá-la, e os certificados importados antes aparecem no ícone com "Importe de novo para usar no PJe.". No PJe, só contam certificados com cadeia.
    - Um PFX sem as autoridades certificadoras gera um aviso no ícone para pedir à certificadora o arquivo com a cadeia completa.
34. **Convivência com o programa instalado.**
    - A janela oferece "Usar o programa instalado", que vale só para aquele pedido, e "Bloquear este site", que passa o site ao programa de vez, a partir do próximo pedido.
    - Sem certificado importado, o pedido segue para o programa.
    - Uma tarefa que o Jamegão não faz também segue para o programa e aparece no ícone, para ser relatada.
    - Com mais de um certificado, a janela mostra a lista, com o último usado naquele site já marcado.

### O que a implementação e as revisões pegaram (24/11)

35. **O crédito do login servia aos documentos.** Uma confirmação de login deixava um crédito que podia ser gasto numa assinatura de documentos. O crédito passou a ser vinculado ao motivo: `login` ou `documentos`.
36. **A primeira ativação se perdia.**
    - *Sintoma:* ao marcar a caixa, o pedido de permissão do navegador às vezes fechava o popup, que era quem ia registrar os scripts. A permissão era concedida, e o PJe não ligava.
    - *Correção:* o fundo passou a escutar `permissions.onAdded` e `onRemoved`. Conceder `*.jus.br`, pelo popup ou nas configurações do navegador, liga o PJe; retirar desliga.
37. **O PJe se religava sozinho.** Quando o navegador não devolvia a permissão retirada, o PJe voltava a ligar. A escolha do usuário passou a ser guardada à parte (`pjeLigado`), e o fundo só registra os scripts com a escolha e a permissão juntas.
38. **Três defeitos no script da página:**
    - aceitava pedido sem destino;
    - se o mundo isolado não respondesse, a página ficava esperando;
    - o envio seguia redirecionamentos.

    *Correções:*
    - o destino precisa existir e ser da mesma origem da página;
    - o envio usa `redirect: 'manual'`;
    - o mundo isolado confirma na hora que vai atender; sem essa confirmação, a chamada segue intacta para o `localhost`.
39. **Console calado demais.** Todas as falhas ficavam fora do console, o que dificultaria o diagnóstico. Agora só a recusa do usuário fica calada; as outras aparecem com a marca `[Jamegão]`.
40. **A janela não cabia.**
    - *Sintoma:* o caso mais cheio, com site novo, cofre travado, lista de certificados e "Usar o programa instalado", não cabia em 440×520 no Firefox.
    - *Correção:* a janela passou a 440×620, e o conteúdo rola quando o nome do titular é longo.
41. **Os testes de ponta a ponta no Firefox.**
    - *O problema:* o WebDriver BiDi do Firefox ignora os documentos de extensão (bug 1755014 da Mozilla):
      - a navegação para `moz-extension://` nunca termina;
      - o endereço fica em `about:blank`;
      - o fechamento das janelas da extensão não é avisado.
    - *Correção:* o harness passou a usar `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS` e recompõe, só no Firefox, o que falta. A suíte roda no Firefox 161.
    - *Limite que fica:* o clique automático não conta como gesto do usuário, então o pedido de permissão do PJe só se prova no teste manual.

### Publicação (25/11)

42. **A node-forge alterada, e desfeita.**
    - *O erro:* para calar o aviso do validador sobre o construtor `Function`, a node-forge chegou a ser alterada.
    - *A regra:* a política da Mozilla proíbe alterar bibliotecas de terceiros, que o revisor reconhece pelo hash.
    - *Correção:* a alteração foi revertida, e um teste de unidade compara o arquivo, byte a byte, com o da node-forge instalada. O aviso fica, explicado nas notas ao revisor.
43. **`validarCertificado` no TJDFT.**
    - *Sintoma:* a primeira tentativa de assinar no PJe do TJDFT, pelo Firefox, foi recusada com `pje.certificadoDigitalService.error.verificaAssinatura.validarCertificado`. A segunda, logo em seguida e sem mudança nenhuma, foi aceita.
    - *Causa:* o mesmo erro tinha aparecido minutos antes, no mesmo processo, com o programa assinador instalado, assinando outro advogado do escritório. O problema é do servidor do TJDFT, não do Jamegão.
44. **"Qualquer site" no Chrome e no Brave.**
    - *Sintoma:* ao ligar o PJe, o Firefox pede acesso aos "sites no domínio jus.br", mas o Chrome e o Brave dizem que o Jamegão poderá "ler e mudar seus dados em qualquer site".
    - *Causa:* `jus.br` está na Public Suffix List, como `com.br`, e o Chromium descreve um curinga sobre um sufixo público como "todos os sites". O acesso concedido continua só aos sites `*.jus.br`.
    - *Opções:* trocar o curinga pela lista de dezenas de endereços do PJe, que mudam sem aviso, ou manter `*.jus.br` e explicar. Pedro escolheu explicar ("mais econômico e lógico").
    - *Correção:* o popup e a importação mostram, só nos navegadores Chromium, uma nota que explica o pedido. README, descrição da loja e justificativa da permissão também explicam.
    - Na primeira tentativa, a nota não aparecia no Chrome. O Chrome também expõe o objeto `browser`, então a detecção passou a ser pela ausência de `runtime.getBrowserInfo`, que só o Firefox tem.
45. **Os testes manuais da 0.3.0**, por Pedro, com A1 real:
    - login e assinatura de documentos no PJe do TJMA (1º grau), no Brave, e do TJDFT, no Firefox;
    - login no TRT da 1ª Região (Brave), no TRT da 2ª Região (Firefox) e no TRF da 3ª Região (Brave);
    - "Usar o programa instalado" nos dois navegadores;
    - e-SAJ do TJSP sem mudança, nos dois navegadores.
46. **As imagens das lojas.**
    - *O que estava velho:*
      - a captura do popup ainda mostrava o interruptor da convivência, removido na 0.1.1 (item 18), e não tinha a seção do PJe;
      - a imagem promocional falava só em e-SAJ.
    - *Novas imagens:* as duas foram refeitas. A imagem promocional passou a ter script (`scripts/promocional.py`).
    - *Certificado fictício:* as capturas passaram a usar um certificado fictício com a cadeia completa, porque o certificado de teste antigo, sem cadeia, fazia o popup mostrar o aviso de cadeia ausente.
    - *Variante Firefox:* a ficha da Mozilla usa uma variante da captura do popup sem a nota do Chrome (`3-popup-firefox.png`).
47. **O envio.**
    - A 0.3.0 foi enviada à Chrome Web Store com os textos e as imagens atualizados.
    - Na Mozilla, Pedro excluiu a 0.2.0, que ainda esperava a revisão manual. Sem versão nenhuma, a extensão passou a "Incompleto"; dois minutos depois, com a 0.3.0 enviada, voltou a "Aguardando análise". O pacote é o mesmo nas duas lojas.
    - A release `v0.3.0` no GitHub tem só o zip para Chromium.

## Estado em 25/11

- **Testes automáticos:**
  - unidade: 292;
  - ponta a ponta no Chrome: 75, mais 2 pulados;
  - ponta a ponta no Firefox 161: 73, mais 4 pulados.
- **`web-ext lint`:** 0 erros e os 2 avisos esperados do item 15.
- **Lojas:** a 0.3.0 está em análise na Chrome Web Store e na Mozilla.
- **O `updates.json`** ainda aponta a 0.2.0 para um `.xpi` que a release `v0.2.0` não tem. Ele só serve a quem instalou a 0.1.1 pelo `.xpi`; essas pessoas passam para a loja instalando o Jamegão por lá.
- **Falta testar:**
  - a assinatura de petição no Chromium;
  - o e-SAJ do TJMS, do TJAC, do TJCE e do TJBA;
  - a assinatura de documentos no PJe dos TRTs, dos TRFs e de outros tribunais estaduais;
  - o PJe no Firefox do Android.
- **Para a próxima versão:**
  - a tela de importação ainda diz que "só o site do e-SAJ" recebe os dados do certificado, e precisa mencionar também o PJe;
  - as demais tarefas do PJe entram uma a uma, quando aparecerem num tribunal real.
