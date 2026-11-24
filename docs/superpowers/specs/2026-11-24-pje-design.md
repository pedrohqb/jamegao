# Jamegão no PJe — desenho

Data: 24/11/2026. Ramo: `pje`. Base: `main` na 0.2.0. Complementa o desenho
geral (`2026-11-21-jamegao-design.md`), que continua valendo em tudo o que
este não muda.

## 1. Intenção e motivo

O Jamegão já deixa o advogado com certificado A1 entrar e assinar no e-SAJ
sem instalar programa. O PJe, usado por dezenas de tribunais, exige o
PJeOffice: um programa em Java que fica rodando no computador e atende a
página por um endereço local (`localhost:8800`). Pedro quer que o Jamegão
substitua também o PJeOffice, para que o A1 funcione no PJe só com a
extensão, inclusive onde o PJeOffice não roda bem (Mac com processador Apple,
Android, sistemas menos comuns).

Pedro pediu ainda que o código fique modular, para que outros sistemas de
assinatura possam entrar depois sem refazer o que existe **(decisão de
Pedro)**.

## 2. O que a spike provou

Spike no ramo `pje-spike` (não vai para o `main`), testada por Pedro no PJe do
TJMA em 24/11/2026, no Brave, com A1 real:

- **Login** pelo SSO (`sso.cloud.pje.jus.br`, Keycloak, realm `pje`):
  funcionou.
- **Assinatura de documentos** (`cnj.assinadorHash`) num cadastro de processo
  com dois documentos: os dois foram assinados, o servidor respondeu
  `Sucesso` a cada um.
- A cadeia de certificados foi aceita na ordem do PkiPath do Java (a
  autoridade mais alta primeiro, o titular por último), na primeira
  tentativa.
- O PJe carrega o Prototype.js, que põe `Array.prototype.toJSON` e faz o
  `JSON.stringify` da página transformar listas em texto. Isso quebrou a
  primeira versão da spike.

### 2.1 O protocolo do PJeOffice

A página não fala com extensão nenhuma. Ela cria uma imagem cujo endereço é
`http://localhost:8800/pjeOffice/...` (ou `127.0.0.1`). A resposta é lida
pelas dimensões da imagem: 1×1 = sucesso, 2×1 = erro, falha de carga =
PJeOffice indisponível.

- Consulta de disponibilidade: `/pjeOffice/` (e `/pjeOffice/versao/`).
- Tarefa: `/pjeOffice/requisicao/?r=<JSON>&u=<data>`. O JSON tem `aplicacao`,
  `servidor` (raiz da aplicação, por exemplo `https://pje.tjma.jus.br/pje`),
  `sessao` (cookies da página), `codigoSeguranca`, `tarefaId` e `tarefa`
  (outro JSON, em texto).
- O PJeOffice executa a tarefa e ele mesmo envia o resultado ao servidor do
  PJe, com os cookies recebidos.

Tarefas vistas:

| Tarefa | Onde | O que o PJeOffice faz |
|---|---|---|
| `sso.autenticador` | login no SSO | Assina `mensagem` (MD5withRSA por padrão) e faz POST JSON `{uuid: token, mensagem, assinatura, certChain}` para `servidor + enviarPara`, com o cabeçalho `versao`. Sucesso: códigos 200, 201, 202, 204, 302, 304. |
| `cnj.assinadorHash` | assinar documentos | Para cada item de `arquivos` (`id`, `codIni`, `hash` em hexadecimal, `isBin`), assina o resumo já calculado (`ASN1MD5withRSA`: DigestInfo MD5 + RSA) e faz POST de formulário `assinatura`, `cadeiaCertificado`, `id`, `codIni`, `hash` (e `idTarefa`, se houver) para `servidor + uploadUrl`. O servidor responde texto: `Sucesso` ou `Erro: ...`. |

Nas duas tarefas, o destino do envio é o mesmo servidor da página. Outras
tarefas existem na referência aberta (`cnj.autenticador`, `cnj.assinador`,
`cnj.assinadorBase64`, `cnj.certchain`, `util.downloader`,
`util.impressor`), mas nenhuma foi vista num tribunal real.

## 3. Metas

1. Login e assinatura de documentos no PJe com A1, sem o PJeOffice, em
   Chromium e Firefox (computador e Android).
2. As mesmas garantias do e-SAJ: confirmação do usuário a cada login e a
   cada lote, cofre com senha, autorização por site, nenhuma comunicação de
   rede da extensão.
3. Código organizado em núcleo comum + um módulo por sistema de assinatura
   (e-SAJ, PJe), de modo que um terceiro sistema entre como mais um módulo.
4. Quem usa só o e-SAJ não percebe mudança nenhuma, e a atualização não
   desativa a extensão no Chrome.

## 4. Fora de escopo

- Certificado A3 (token, cartão), como no resto do Jamegão.
- Tarefas do PJeOffice além de `sso.autenticador` e `cnj.assinadorHash`
  nesta versão. As outras são recusadas com aviso (8.4) e entram em versões
  seguintes, uma a uma, quando forem vistas num tribunal real.
- Modo de teste do PJe (`modoTeste: true`): recusado.
- Outros sistemas de assinatura (eproc, PROJUDI, JUCESP...): fora; a
  modularidade só prepara o terreno.

## 5. O que seria fracasso mesmo funcionando

- Assinar algo que o usuário não viu na confirmação, ou o Jamegão enviar
  assinatura a servidor diferente do da página. (Contra um site hostil, a
  conferência de destino não basta, porque a assinatura volta ao mundo da
  página; ali a defesa é a de 8.9.)
- A extensão passar a fazer qualquer conexão de rede própria, ou falar com o
  `localhost`.
- Quem tem o PJeOffice instalado e não quer o Jamegão no PJe ser
  atrapalhado.
- A atualização desativar o Jamegão no Chrome de quem só usa o e-SAJ.
- O código do PJe virar um apêndice do e-SAJ, com `if` de protocolo
  espalhado pelo núcleo.

## 6. Restrições

Valem todas as do desenho geral (Manifest V3, JavaScript puro sem build,
forge só na importação, fundo sem memória entre eventos, interface em
português). Mais:

- O script que intercepta precisa rodar no mundo da página (`world: MAIN`) e
  antes dos scripts do PJe (`document_start`).
- O WebCrypto não tem MD5: o MD5 é feito em JavaScript (já está na spike) e a
  assinatura do resumo usa o caminho de `signHash` (exponenciação em BigInt).
- Mínimos atuais: Chrome 121, Firefox 140, Firefox Android 142.

## 7. Caminhos considerados

1. **Interceptar no mundo da página e enviar pela própria página — escolhido
   (Pedro concordou em 24/11/2026).** É o que a spike provou. O envio sai da
   página, para o servidor dela, com a sessão dela; a extensão continua sem
   rede.
2. **Redirecionar `localhost:8800` para dentro da extensão** pelas regras de
   rede do navegador. Quem enviaria ao PJe seria a extensão (fere a regra de
   rede) e seria preciso expor arquivos da extensão a todos os sites.
   Descartado.
3. **Servidor local no lugar do PJeOffice.** É instalar programa, o que o
   Jamegão existe para evitar. Descartado.

## 8. Desenho

Itens marcados **(decisão de Pedro)** foram ditos por ele. Os marcados
**(proposta)** são escolhas minhas, abertas a correção.

### 8.1 Modularidade: núcleo e protocolos **(proposta, atendendo à decisão de Pedro)**

Um "protocolo" é a forma como um sistema da Justiça pede assinatura à
página: o do e-SAJ (eventos das extensões oficiais) e o do PJe (imagens para
`localhost:8800`). Cada protocolo vira uma pasta; tudo o que não depende de
protocolo fica no núcleo.

```
ext/
  background.js            despacha mensagens; não conhece protocolo
  lib/                     núcleo: cofre, certificados, sites, créditos,
                           confirmações, RSA, MD5, PkiPath, bytes, kv, db
  lib/assinar.js           NOVO: a porta única para usar uma chave
  conteudo/ponte.js        NOVO: ponte comum do mundo isolado
  protocolos/
    esaj/                  conteudo.js (o content.js de hoje), fundo.js
    pje/                   pagina.js (mundo MAIN), conteudo.js, fundo.js
  pages/                   importação, confirmação, popup
```

Contratos:

- **Fundo de um protocolo** (`protocolos/<id>/fundo.js`, módulo ES) exporta
  `{ id, aceitaOrigem(origin), comandos }`. `comandos` é um objeto
  `nome -> async (pedido, contexto) => resposta | { needs }`. O `contexto`
  traz os serviços do núcleo (certificados, sites, `assinar`).
  `background.js` tem uma lista fixa de protocolos e encaminha cada mensagem
  ao protocolo indicado nela, depois de conferir `aceitaOrigem` com a origem
  que o navegador informa (nunca a da mensagem).
- **`lib/assinar.js`**: a única função que decifra chave.
  `assinar({ origin, thumbprint, quantidade, novoLote }, fazer)` confere site,
  cofre e créditos; devolve `{ needs }` quando falta algo; senão consome os
  créditos, decifra o PKCS#8, chama `fazer(pkcs8)`, toca o cofre e zera a
  chave no `finally`. O e-SAJ (`signData`, `signHash`) e o PJe passam a usar
  essa função; o código duplicado que existe hoje em `commands.js` some.
- **Ponte do mundo isolado** (`conteudo/ponte.js`): carregada antes do
  `conteudo.js` de cada protocolo, na mesma entrada de script (o navegador
  roda os arquivos de uma entrada em ordem, no mesmo mundo isolado). Oferece
  `pedir(protocolo, comando, pedido)`, que envia ao fundo, espera a janela de
  confirmação, repete uma vez depois do aceite e abandona a confirmação se a
  página sair. Hoje esse trecho existe duplicado no `content.js` e no
  `pje.js` da spike.
- **Janela de confirmação** genérica: o protocolo descreve o que será feito
  em `needs.sign` com `quantidade`, `motivo` (`login` ou `documentos`) e o
  nome do sistema (`e-SAJ`, `PJe`), e a janela monta o texto a partir disso.
  Estados que só um protocolo usa (a cadeia ausente de 8.6, o botão de 8.5)
  vêm como campos de `needs` que a janela sabe exibir; a janela não testa o
  nome do protocolo.
- **Novo protocolo** = nova pasta em `protocolos/`, uma linha na lista do
  `background.js` e o registro dos seus scripts (manifesto ou 8.2). O núcleo
  não muda.

As cópias literais que existem hoje entre scripts de conteúdo e módulos (as
marcas do e-SAJ, o PkiPath da spike) continuam conferidas por teste de
unidade, como já se faz.

### 8.2 Sites e permissão: o PJe é ligado pelo usuário **(proposta)**

O PJe está em 63 endereços conhecidos (lista do CNJ, servida em
`www.pje.jus.br/navegador/data/tribunais.json`, consultada em 24/11/2026), todos em `.jus.br`, sem
padrão de nome e incompletos (o SSO, por exemplo, não aparece). Pôr
`https://*.jus.br/*` no manifesto faria o Chrome **desativar a extensão de
todos os usuários** na atualização até cada um aprovar, inclusive de quem
só usa o e-SAJ.

Proposta:

- O manifesto ganha `optional_host_permissions: ["https://*.jus.br/*"]`
  (opcional) e a permissão obrigatória `scripting`. Nenhuma das duas gera
  aviso de instalação, então a atualização não desativa ninguém no Chrome. O
  teste de manifesto passa a aceitar `scripting`.
- O PJe vem **desligado**. No popup e no fim da importação aparece "Usar
  também no PJe". Ao ligar, o navegador pede a permissão de `*.jus.br`; com
  ela, o fundo registra os scripts do PJe (`scripting.registerContentScripts`,
  persistentes, um no mundo MAIN e outro no isolado, `document_start`, todos
  os quadros) em `https://*.jus.br/*`, **excluídos os endereços do e-SAJ** do
  manifesto (`excludeMatches`), para que os dois protocolos nunca dividam a
  mesma página. A ponte comum é idempotente mesmo assim. Fora do PJe, o
  script da página fica inerte: só age em imagem que aponte para
  `localhost:8800/pjeOffice/`.
- Ao desligar, o fundo retira o registro e tenta devolver a permissão. Se o
  navegador recusar (a permissão engloba endereços do e-SAJ que já estão no
  manifesto), desligar é só retirar o registro, e a permissão fica.
- Na inicialização do fundo, se a permissão existe e o registro sumiu (ou o
  contrário), o fundo acerta o estado.
- O e-SAJ segue com a lista fixa no manifesto, como hoje.
- Isso também resolve a convivência (8.5). O item do desenho geral que
  previa ligar o e-SAJ em outros `*.jus.br` continua pendente; esta permissão
  não leva o e-SAJ a lugar nenhum.
- Depois de ligar, só as páginas carregadas em seguida têm o Jamegão; o
  popup diz isso.

Dentro de `*.jus.br`, a autorização por origem continua como no e-SAJ: o
primeiro pedido de cada origem (por exemplo `sso.cloud.pje.jus.br` e depois
`pje.tjma.jus.br`) pergunta na janela de confirmação; "Bloquear este site"
vale para ela.

A conferir na implementação: suporte a `world: "MAIN"` em
`registerContentScripts` e a `permissions.request` no Firefox (computador e
Android). Se faltar no Firefox, o recurso fica só no Chromium nesta versão e
isso volta a Pedro antes de publicar.

### 8.3 O script da página (mundo MAIN) **(proposta)**

- Substitui o `src` de `HTMLImageElement` e o `setAttribute('src')` das
  imagens: endereço `http://localhost|127.0.0.1:8800/pjeOffice/...` é tratado
  pelo Jamegão e nunca chega à rede; qualquer outro passa intacto.
- Guarda, ao carregar, as funções originais que usa (`fetch`, o setter de
  `src`, `setAttribute`) e converte JSON sem o `toJSON` do Prototype.js.
- Consulta de disponibilidade: responde sucesso (1×1).
- `requisicao`: lê `r` e `tarefa` (aceitando `tarefa` e `arquivos` em
  texto ou já como objeto), despacha pela tabela de tarefas (8.4) e responde
  1×1 ou 2×1.
- Fala com o mundo isolado por `CustomEvent` no `document`, com o detalhe em
  texto JSON, como na spike.
- O envio ao PJe é feito por este script com o `fetch` da página, `credentials:
  'same-origin'`. Antes de enviar, confere que o destino (`servidor +
  enviarPara`, `servidor + uploadUrl`) tem a **mesma origem da página**; se
  não tiver, recusa sem assinar.
- Registro no console: só avisos de erro e de tarefa não suportada, com o
  prefixo `[Jamegão]`, sem cookies nem resumos. Os registros de passo da
  spike saem.

### 8.4 Tarefas **(proposta)**

Tabela de tarefas no `pagina.js`, uma função por tarefa; tarefa nova = uma
entrada nova (e, se assinar algo de outra forma, um comando novo no
`fundo.js` do PJe).

- `sso.autenticador`: como na spike. Algoritmos aceitos: `MD5withRSA`
  (padrão), `SHA1withRSA`, `SHA256withRSA`. Cadeia na ordem do Java, sem a
  segunda tentativa da spike.
- `cnj.assinadorHash`: como na spike. Algoritmos: `ASN1MD5withRSA` e
  `ASN1SHA256withRSA`; resumo em hexadecimal ou Base64. Um pedido de
  assinatura para o lote inteiro; envio de um documento por vez, na ordem;
  falha num documento não impede os seguintes (como o PJeOffice), e a
  resposta final é 2×1 se algum falhou.
- Qualquer outra tarefa, ou `modoTeste: true`: o Jamegão não assina e
  **deixa a chamada seguir para o `localhost`**, como se não existisse. Quem
  tem o PJeOffice rodando é atendido por ele; quem não tem vê o aviso do
  próprio PJe de que o assinador não está disponível. O Jamegão avisa no
  console e registra a tarefa e a origem na sessão, para o popup mostrar "O
  PJe pediu uma operação que o Jamegão ainda não faz (tarefa X em site Y)".

### 8.5 Convivência com o PJeOffice **(proposta)**

Diferente do e-SAJ, não há duas respostas brigando: com o Jamegão ligado no
PJe, a chamada nunca chega ao PJeOffice. Por isso:

- Quem não liga o PJe no Jamegão continua com o PJeOffice, sem mudança
  nenhuma.
- Site bloqueado no Jamegão, ou nenhum certificado importado: o script da
  página deixa a chamada seguir para o `localhost`, como se o Jamegão não
  existisse. Assim, "Bloquear este site" devolve aquele tribunal ao
  PJeOffice. Para isso o script da página segura a imagem, pergunta ao fundo
  e, se for o caso, só então aplica o endereço original.
- Na janela de confirmação do PJe há um botão a mais, **"Usar o programa
  instalado"**, que vale só para aquele pedido: o Jamegão não assina e deixa a
  chamada seguir para o `localhost`. Serve a quem usa A1 no Jamegão e outro
  certificado (A3, nuvem) pelo PJeOffice, sem bloquear o SSO, que é comum a
  muitos tribunais. Não gera a pausa de 15 s.
- O Jamegão não sonda o `localhost` para descobrir se o PJeOffice está
  rodando. Sondar seria rede da extensão para o computador do usuário, e
  navegadores recentes pedem permissão de "rede local" a cada site que tenta
  isso.

### 8.6 Certificado e cadeia **(proposta)**

- O PJe não escolhe o certificado. Com um só, usa ele. Com mais de um, a
  janela de confirmação mostra a lista para escolher, já marcado o último
  usado naquela origem (guardado por origem no IndexedDB). A escolha vale
  para o pedido e vira o padrão da origem.
- A importação passa a guardar a cadeia do PFX (`chainB64`, do titular para a
  raiz, como na spike). Nada muda para o e-SAJ.
- Certificado importado antes desta versão não tem cadeia. No PJe, o pedido é
  recusado antes de assinar, com a mensagem "Importe o certificado de novo
  para usar no PJe" na janela de confirmação, e o popup marca esses
  certificados. Reimportar o mesmo PFX substitui o registro (mesma
  impressão digital).
- PFX sem as autoridades dentro: a cadeia fica só com o titular. O PJe pode
  recusar; a mensagem de erro do servidor aparece no console e o popup
  orienta a obter o PFX com a cadeia completa.

### 8.7 Confirmação **(proposta; as regras são as do e-SAJ)**

- Login: "Entrar no PJe de <origem> com o certificado de <titular>". Vale o
  crédito de assinatura como no e-SAJ.
- Documentos: "Assinar N documentos no PJe de <origem> com o certificado de
  <titular>". Todo lote abre confirmação nova com a quantidade, mesmo havendo
  crédito (como na spike).
- Cofre travado, site novo e escolha de certificado entram na mesma janela.
- Pausa de 15 s depois de recusa, prazo de 120 s, "Bloquear este site":
  iguais ao e-SAJ.

### 8.8 Rede **(decisão de Pedro, mantida)**

A extensão continua sem nenhuma comunicação de rede própria. O que sai para
o PJe são pedidos da própria página, para o servidor dela, que a página faria
de qualquer modo por meio do PJeOffice. O teste de rede existente continua
valendo e ganha um caso: com o PJe ligado, nenhuma requisição a `:8800` sai
do navegador nas tarefas que o Jamegão atende. Nos casos de 8.4 e 8.5 em que
a chamada segue para o `localhost`, quem a faz é a página, como faria sem o
Jamegão.

### 8.9 Segurança **(proposta)**

- O mundo da página é controlado pelo site. Um site `*.jus.br` malicioso
  poderia pedir assinatura de resumos quaisquer, exatamente como pode pedir
  ao PJeOffice ou ao Web PKI. A defesa é a mesma: autorização por origem e
  confirmação com a quantidade e a origem, vindas do navegador.
- O fundo só aceita os comandos do PJe de origens `https://*.jus.br`.
- MD5 é exigência do PJe; a assinatura vale o que vale o MD5. Registrado aqui
  para não ser lido como escolha nossa.
- Nada do pedido (cookies, `codigoSeguranca`) vai ao fundo; só a mensagem ou
  os resumos.

### 8.10 Textos

- README, descrição das lojas e popup: "entrar e assinar no PJe com
  certificado A1, sem instalar programa". Pela regra do desenho geral, os
  textos públicos não citam marcas de terceiros; "PJeOffice" também fica fora
  dos textos públicos e entra no teste de textos **(proposta)**.
- Notas da versão explicam o "Usar também no PJe" e a reimportação.

## 9. Publicação

- Versão 0.3.0, nas duas lojas, depois dos testes de 10.
- A atualização só acrescenta a permissão `scripting`, sem aviso, e a
  permissão opcional de `*.jus.br` (8.2); não desativa ninguém no Chrome.
- Revisão das lojas: a permissão opcional ampla e o script no mundo da página
  devem ser explicados nas notas ao revisor (como os identificadores
  oficiais foram explicados na 0.1).

## 10. Testes

- **Unidade**: MD5 (vetores e Node), assinatura de resumo MD5 e SHA-256
  conferida com o Node, PkiPath, cadeia do PFX (com e sem autoridades),
  `assinar.js` (todas as combinações de site, cofre, créditos e lote), fundo
  do PJe (origens, algoritmos, resumos inválidos, cadeia ausente,
  certificado escolhido), despacho por protocolo, cópias literais.
- **Ponta a ponta, Chrome e Firefox**, com páginas imitadas servidas por
  interceptação (como na spike): login no SSO; lote de documentos no TJMA;
  página com o `toJSON` do Prototype; tarefa desconhecida; `modoTeste`;
  destino de outra origem recusado; site bloqueado e nenhum certificado
  (a chamada segue para o `localhost`); dois certificados com escolha;
  certificado sem cadeia; "Usar o programa instalado"; ligar e desligar o PJe
  no popup; nenhuma requisição a `:8800` nas tarefas atendidas; página do
  e-SAJ sem os scripts do PJe; toda a suíte do e-SAJ intacta.
- **Manual, por Pedro, antes de publicar**: login e assinatura no PJe do TJMA
  no Brave e no Firefox, e login em pelo menos um PJe de outro ramo (um TRT
  ou TRF) para ver se pede outra tarefa. Como no e-SAJ, nada é protocolado só
  para testar.

## 11. Deixado a quem implementar

- Nomes exatos de arquivos e funções dentro do desenho de 8.1.
- Se `content.js` muda de lugar já nesta versão ou numa etapa própria do
  plano (o teste de textos e o manifesto apontam para ele).
- Visual do seletor de certificado e do "Usar também no PJe".
- Como o popup mostra as tarefas recusadas.
