# Jamegão — desenho

Data: 21/11/2026 · Autor do pedido: Pedro Barreto · Situação: pontos confirmados por Pedro em 21/11/2026

## 1. Intenção e motivo

Uma extensão de navegador que permita ao advogado entrar e peticionar no e-SAJ
com certificado A1 (arquivo PFX), sem instalar nenhum programa no computador.

Motivos, nas palavras de quem pediu:

- o WebSigner da Softplan dá muita dor de cabeça e sequer foi portado para
  macOS em ARM;
- uma extensão sem componente nativo resolve em definitivo as barreiras de
  sistema operacional para usar o e-SAJ;
- os demais sistemas (PJe, eproc etc.) já funcionam nativamente e ficam fora.

Público: advogado comum, no computador, que não vai carregar extensão em modo
desenvolvedor. A extensão precisa estar nas lojas.

## 2. O que já se sabe (do protótipo)

Tudo abaixo foi lido no código que o e-SAJ entrega à página ou medido em teste.

- **Detecção.** O SDK da página considera a extensão instalada se existir um
  elemento cujo `id` é o ID da extensão oficial (Softplan:
  `bbafmabaelnnkondpfpjmdklbmfnbmol` no Chromium, `websigner_softplan_com_br`
  no Firefox; Lacuna: `dcngeagmmhegagicpcmpinaoklddcgon`,
  `webpki_lacunasoftware_com`).
- **Mensagens.** Pedidos saem por `CustomEvent` no `document` (Chromium) ou
  `window.postMessage` (Firefox), no porto `<prefixo>.RequestEvent`; respostas
  voltam em `<prefixo>.ResponseEvent`, no formato
  `{requestId, success, response | exception{message, complete, origin, code}}`.
  Prefixos: `br.com.softplan.WebPKI` e `com.lacunasoftware.WebPKI`.
- **Marcas.** O login usa o SDK da Softplan. No peticionamento, o código escolhe
  o SDK da Lacuna quando o navegador é Firefox e a configuração do tribunal
  está ligada; nos demais casos, o da Softplan. A extensão precisa atender as
  duas.
- **Comandos usados.** Login: `listCertificates`, `readCertificate`,
  `preauthorizeSignatures`, `signHash` ou `signData`. Peticionamento:
  `listCertificates`, `preauthorizeSignatures`, `signData` (um por documento,
  o servidor manda os resumos). Inicialização: `getExtensionVersion`,
  `initialize`, e eventualmente `getVersion` e `pollNative`.
- **Versões mínimas.** O SDK da Softplan exige extensão ≥ 2.6.6 e componente
  nativo Linux ≥ 2.4.1; o da Lacuna embutido no e-SAJ (2.14.8) exige nativo
  Linux ≥ 2.10.0. O protótipo declara 2.99.0.
- **Validado.** O protótipo (em `assinador-pfx-spike/`, nome antigo) passa em 94
  verificações automatizadas no Chrome e foi usado por Pedro com sucesso no
  e-SAJ do TJSP e do TJAL, em Chromium e em Firefox.
- **Limite das plataformas.** Extensão não acessa os certificados do
  repositório do navegador nem do sistema (a API que faria isso só existe no
  ChromeOS). Por isso o PFX é importado para dentro da extensão.

## 3. Metas

1. Login e peticionamento no e-SAJ com A1, em Chromium e Firefox de desktop
   (Linux, Windows, macOS, ChromeOS, BSD), sem componente nativo.
2. Instalação pelas lojas (Chrome Web Store e loja de extensões do Firefox).
3. Configuração mínima: arrastar o PFX, digitar a senha dele, criar a senha do
   cofre. Depois disso, o uso diário é destravar e confirmar.
4. Segurança proporcional a um certificado com valor jurídico: chave cifrada em
   repouso, confirmação antes de assinar, nenhuma comunicação de rede própria.
5. Convivência com as extensões oficiais para quem também usa token A3.

## 4. Fora de escopo

- Token e cartão (A3), certificado em nuvem.
- PJe, eproc, Projudi e qualquer assinador que não seja da família
  Web PKI/WebSigner.
- Assinatura local de PDF, CAdES e XML (`signPdf`, `signCades`, `signXml`) e
  os demais comandos do SDK. O e-SAJ não os usa.
- Celular, tablet e Safari.
- Usar certificados do repositório do navegador ou do sistema.
- Chaves que não sejam RSA.
- Sincronização entre navegadores ou cópia de segurança da chave. A cópia é o
  próprio PFX do usuário.

## 5. O que seria fracasso mesmo funcionando

- A extensão, ou uma atualização dela, conseguir enviar qualquer dado para
  fora do computador.
- Telemetria, análise de uso ou coleta de qualquer espécie.
- Assinar sem que o usuário tenha visto e confirmado o que está assinando.
- Quebrar o uso das extensões oficiais para quem depende de token.
- Exigir do usuário algo além de arrastar um arquivo e digitar senhas.
- Usar nomes ou marcas da Softplan ou da Lacuna de modo a parecer produto
  delas.

## 6. Restrições

- Manifest V3, um único código para Chromium e Firefox.
- JavaScript puro, sem etapa de build: o pacote da loja é o conteúdo da pasta
  da extensão, arquivo por arquivo.
- Única dependência embutida: a biblioteca forge, só na tela de importação,
  para ler PKCS#12 (inclusive os legados 3DES e RC2-40, que o WebCrypto não
  decifra).
- O service worker do Chromium e a página de fundo do Firefox são descartados
  quando ociosos. Nada pode depender de memória do processo de fundo.
- A chave precisa existir em JavaScript no `signHash`, porque o WebCrypto não
  assina resumo já calculado.
- Interface só em português do Brasil.

## 7. Caminhos considerados

1. **Evoluir o protótipo em JavaScript puro, sem build — escolhido por Pedro.**
   O que está no repositório é o que vai para a loja, o que torna a auditoria
   trivial. É a principal defesa contra atualização maliciosa. Custo: sem
   tipagem; a organização do código depende de disciplina.
2. **TypeScript com empacotador e bibliotecas modernas.** Mais fácil de manter,
   mas o pacote deixa de ser o fonte, exige build reproduzível e envio de
   fontes à revisão do Firefox, e as bibliotecas modernas não leem PFX legado.
   Descartado.
3. **Núcleo criptográfico em Rust/WebAssembly.** RSA em tempo constante e
   memória apagada de verdade, mas põe um binário no pacote e dificulta a
   revisão e a auditoria, por um ganho acima do teto de segurança de um A1.
   Descartado; pode voltar, só para o `signHash`, se um dia fizer falta.

## 8. Desenho

Itens marcados **(decisão de Pedro)** foram ditos por ele. Os marcados
**(proposta)** são escolhas minhas, abertas a correção.

### 8.1 Peças

| Peça | Papel |
|---|---|
| Script de conteúdo | Anuncia as duas marcas e repassa pedidos e respostas. Não vê chave nem certificado. |
| Fundo (service worker / página de fundo) | Atende os comandos, guarda a regra de autorização, assina. |
| Cofre | Guarda no IndexedDB os certificados, as chaves cifradas, o sal e a conferência do cofre, o contador de tentativas e as decisões por site (não em `storage.local`, que os scripts de conteúdo alcançam); mantém a chave do cofre destravada só em `storage.session`. |
| Janela de importação | Lê o PFX com a forge, monta os dados do certificado, cria ou usa o cofre. |
| Janela de confirmação | Pede senha se o cofre estiver travado e confirma cada assinatura ou lote. |
| Popup do ícone | Estado (travado/destravado), certificados, sites, travar agora. |

### 8.2 Sites **(decisão de Pedro)**

- O script de conteúdo é registrado só nos endereços de e-SAJ conhecidos, em
  lista fixa no manifesto. A lista é levantada e conferida na implementação;
  TJSP e TJAL estão confirmados.
- Para outros endereços `*.jus.br`, o usuário pode ligar a extensão pelo popup
  ("usar o Jamegão neste site"), por permissão opcional de host. Nada é
  injetado em site que não esteja na lista nem tenha sido ligado.
- A primeira vez que qualquer site pede certificados, inclusive os da lista
  fixa, a janela de confirmação pergunta se ele pode usar o Jamegão. A lista
  de certificados expõe nome, CPF e data de nascimento, então nenhum site a
  recebe sem essa resposta. Ela fica guardada por origem e pode ser revogada
  no popup.
- A ligação manual de outros endereços `*.jus.br` fica fora da primeira
  entrega; entra depois da resposta das lojas.

### 8.3 Convivência com as extensões oficiais **(decisão de Pedro)**

O elemento de detecção é injetado pela extensão oficial mesmo quando o
componente nativo dela está ausente ou quebrado. Justamente o público deste
projeto (WebSigner instalado e sem funcionar, ou sem versão para o sistema)
pareceria ter "a oficial ativa". Por isso a presença dela não silencia o
Jamegão.

- Regra: num site autorizado, se há certificado importado, o Jamegão se
  anuncia e responde, com ou sem extensão oficial instalada.
- Se o script de conteúdo encontra o elemento de detecção de uma extensão
  oficial, o popup avisa que há outra extensão de assinatura na página e
  oferece o interruptor "deixar a extensão oficial responder neste site". É o
  caminho de quem usa token naquele tribunal.
- Com o interruptor ligado, o Jamegão não se anuncia nem responde naquele
  site. Se o interruptor for ligado com a página aberta, o Jamegão retira o
  próprio elemento de detecção e fica calado também nos pedidos em curso
  (não responde nem com recusa, para não chegar à página antes da oficial).
- Com as duas respondendo, a primeira resposta vence e a segunda é descartada
  pelo SDK com um erro no console. A implementação precisa confirmar em teste
  que isso não quebra o fluxo da página; se quebrar, é achado a relatar.

### 8.4 Cofre **(senha única e travamento em 30 minutos: decisão de Pedro; o restante é proposta)**

- Uma senha do cofre, criada na primeira importação. A tela sugere que pode
  ser a mesma do certificado, mas não a reaproveita sozinha.
- Derivação: PBKDF2-SHA-256 do WebCrypto, 600.000 iterações, sal aleatório por
  cofre. Resultado: chave AES-GCM de 256 bits.
- Em repouso, por certificado: certificado (público), dados de exibição
  (públicos) e a chave privada em PKCS#8 cifrada com AES-GCM e IV próprio.
  Nenhuma `CryptoKey` é gravada no IndexedDB (a revisão do protótipo mostrou
  que o navegador as grava em claro).
- Destravar: a senha deriva a chave do cofre, que fica em `storage.session`
  (só em memória, some ao fechar o navegador, inacessível a scripts de
  conteúdo). A cada assinatura, o fundo decifra o PKCS#8 e o usa só naquela
  operação, zerando os bytes ao final. No `signData` a chave entra no
  WebCrypto; no `signHash` (assinatura RSA de um resumo já pronto, que o
  WebCrypto não oferece) a conta é feita em JavaScript, com cegamento, e por
  isso a chave fica em memória do JavaScript durante a assinatura. Sem
  WebAssembly ou componente nativo isso é inevitável; a proteção é a chave
  só existir decifrada no fundo da extensão, por instantes.
- Travamento automático após 30 minutos sem uso, por alarme, e botão "travar
  agora". Fechar o navegador trava.
- Senha errada: espera crescente entre tentativas. Sem recuperação de senha:
  quem esquece remove o certificado e importa o PFX de novo.

### 8.5 Confirmação de assinatura **(a cada lote e a cada login: decisão de Pedro; prazos e mecânica são proposta)**

- `preauthorizeSignatures(n)` abre a janela de confirmação com o site, o
  titular do certificado e a quantidade de documentos. Confirmado, o fundo
  concede `n` assinaturas para aquela origem e aquele certificado, válidas por
  5 minutos e consumidas uma a uma.
- `signData` ou `signHash` sem crédito disponível abre a mesma janela para uma
  assinatura (é o caso do login).
- A janela mostra a origem informada pelo navegador, nunca texto vindo da
  página.
- Recusa ou janela fechada respondem à página com o código de cancelamento
  pelo usuário, que o e-SAJ já trata.
- A janela tem também "Bloquear este site", que recusa e grava o bloqueio.
- A página desiste em 120 s; depois disso a janela não pode mais ser
  aprovada.
- Depois de uma recusa, de fechar a janela ou de deixar os 120 s vencerem, o
  mesmo site fica 15 s sem poder abrir outra janela: a tela de login do
  e-SAJ repete a listagem de certificados na hora, até três vezes, e sem a
  pausa a janela reabriria.
- Sempre que uma janela abre antes de uma assinatura (site novo ou cofre
  travado), ela mostra a quantidade, mesmo que sobre crédito.
- O estado dos créditos fica em `storage.session`, não em memória do fundo.

### 8.6 Rede **(decisão de Pedro)**

A extensão não faz nenhuma comunicação de rede própria.

- Política de conteúdo das páginas da extensão sem nenhuma origem de conexão
  (`connect-src 'none'`), sem `host_permissions` além dos sites de e-SAJ
  necessários ao script de conteúdo.
- Um teste automatizado tenta `fetch` a partir do fundo e das páginas da
  extensão e precisa falhar. Se a política de conteúdo não cobrir o fundo em
  algum dos navegadores, isso é um achado a relatar antes de publicar, não um
  detalhe a contornar em silêncio.

### 8.7 Assinatura

- `signData`: WebCrypto, RSASSA-PKCS1-v1_5, SHA-1/256/384/512.
- `signHash`: como no protótipo, com cegamento da base e conferência do
  resultado com a chave pública. Os números da chave saem do PKCS#8 decifrado
  e existem só durante a operação.
- Erros devolvem mensagem em português, sem rastro interno.

### 8.8 Compatibilidade declarada

- Quando ativo num site, o Jamegão atende sempre as duas marcas, porque o
  e-SAJ usa uma no login e pode usar a outra na assinatura.
- A extensão declara uma versão alta fixa para passar na conferência dos SDKs.
- Comando fora da lista responde "não suportado" no formato de erro do SDK.

### 8.9 Aparência e textos

- Três telas pequenas: importação, confirmação, popup. Sem página de opções
  para o uso normal.
- Avisa quando um certificado está a 30 dias ou menos de vencer, e quando
  venceu.
- Texto de primeira execução explica, em poucas linhas, onde a chave fica e o
  que a extensão não faz.

## 9. Publicação

- Contas de publicação de Pedro nas duas lojas. Pedro cria as contas, aceita os
  termos e envia; quem implementa prepara os pacotes e os textos.
- Nome: **Jamegão** **(decisão de Pedro)**. Na vitrine das lojas vai com til;
  em identificadores, repositório e endereços vai `jamegao`. Subtítulo
  sugerido: "assinatura no e-SAJ com certificado A1". O identificador do Firefox
  deriva dele e é permanente; a forma exata fica para a seção 11.
- Primeira entrega: versão mínima já com cofre, confirmação e bloqueio de
  rede, enviada às duas lojas como **não listada** **(decisão de Pedro)**, para descobrir como a
  revisão trata o uso dos identificadores das extensões oficiais. Entram nela
  também a regra de convivência (8.3) e o teste automatizado em Firefox.
- A resposta que importa é a da Chrome Web Store, que revisa também as não
  listadas. A assinatura não listada da Mozilla tende a sair só com validação
  automática e pode não dizer nada sobre os identificadores.
- Se uma loja recusar por causa dos identificadores, o projeto para e volta a
  Pedro com a resposta da loja. Não se tenta disfarçar o mecanismo.
- Política de privacidade de uma página: não coleta nada. No Firefox,
  declaração de coleta de dados "nenhuma".
- Projeto novo, em repositório próprio, separado do Tessera. Licença
  GPL-3.0. Repositório público desde o início, em
  `github.com/pedrohqb/jamegao` **(decisões de Pedro; a ideia anterior de
  mantê-lo privado até a resposta das lojas foi abandonada em 21/11/2026)**. Cada versão publicada corresponde a
  uma etiqueta do repositório, e o pacote da loja é o conteúdo da pasta
  `ext/` daquela etiqueta.
- A descrição nas lojas não cita WebSigner, Web PKI, Softplan nem Lacuna.
  Descreve só a função: entrar e assinar no e-SAJ com certificado A1
  **(decisão de Pedro)**.

## 10. Testes

- Manter e ampliar o teste de ponta a ponta do protótipo (Chrome real, SDK
  real na página, assinaturas conferidas contra o OpenSSL).
- Acrescentar o mesmo teste em Firefox real.
- Casos novos: cofre (senha errada, travamento, reinício do processo de fundo
  no meio de um lote), créditos de assinatura (expiração, origem diferente,
  certificado diferente), convivência com extensão oficial simulada, bloqueio
  de rede.
- Tudo o que fica depois do login no e-SAJ só é alcançável com um A1 de
  verdade. Pedro faz esses testes em pontos de controle combinados, e os
  scripts dessas telas são lidos pelo navegador dele, com ele logado.
- Antes de cada publicação **(decisão de Pedro)**: teste manual de login no e-SAJ do
  TJSP, em Chromium e Firefox. A assinatura de petição só acontece no
  protocolo de verdade, então é conferida quando Pedro tiver uma petição real
  a protocolar; não se protocola nada só para testar.

## 11. Pendências antes do primeiro envio às lojas

Nenhuma impede começar a implementação.

1. **Marca.** Lojas do Chrome e do Firefox sem extensão com esse nome
   (conferido por Pedro). INPI, base atualizada até 07/07/2026, consultado
   em 21/11/2026: busca exata sem resultado; busca aproximada com 491
   resultados, nenhum "Jamegão". Nas classes de software e serviços
   (9, 35, 38, 42, 45), os vigentes mais próximos são JAMECO (classe 9,
   aparelhos de medição), JOMEGA (classe 42, arquitetura), LG AMEGO e aMeGo
   (classe 9, áudio) e AMEGA PHARMA (classe 42, pesquisa química). De grafia
   quase igual, só JAMELÃO (classe 41, entretenimento, vigente), TAMEGÃO
   (óleos comestíveis, vigente) e XAMEGÃO (classe 41, extinto). A avaliação
   de colidência é de Pedro.
2. **Identificador do Firefox.** `jamegao@pedrohqb.github.io`, confirmado por
   Pedro e registrado na Mozilla em 22/11/2026 (permanente).

## 12. Deixado a quem implementar

- Organização dos arquivos e módulos dentro de `ext/`.
- Lista de endereços de e-SAJ, a levantar e conferir.
- Desenho visual das três telas.
- Ferramenta do teste em Firefox.
- Descobrir em quais fluxos do e-SAJ o `signHash` é de fato usado.
