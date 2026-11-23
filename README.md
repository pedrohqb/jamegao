# Jamegão

**[Português](#português)** · **[English](#english)**

---

## Português

O Jamegão é uma extensão para Firefox e para os navegadores Chromium (Chrome, Edge, Brave) que permite **entrar e assinar no e-SAJ com certificado digital A1** (o arquivo PFX), direto no navegador, **sem instalar programa algum no computador**. Ela ocupa o lugar das extensões oficiais de assinatura que o e-SAJ pede, que dependem de um programa nativo instalado à parte e que não existe para todos os sistemas: não há versão para Mac com processador Apple (M1 em diante), por exemplo. Com o Jamegão, basta o navegador.

*Jamegão* é como se diz, na fala popular, a assinatura de alguém.

O Jamegão é um projeto independente, sem vínculo com os fornecedores do e-SAJ e das extensões oficiais nem com os tribunais.

| Certificado | Atende? |
|---|---|
| A1 (arquivo `.pfx` ou `.p12`) | **sim** |
| A3 em token ou cartão | não: use o [Tessera](https://github.com/pedrohqb/tessera), projeto irmão, com as extensões oficiais |
| Certificado em nuvem (SerproID, RemoteID, Bird ID) | não |

![Janela de confirmação do Jamegão antes de assinar um lote, com certificado fictício](docs/lojas/capturas/1-assinatura.png)

---

### Onde funciona

**Sistemas:** Linux, Windows, macOS (Intel e Apple), ChromeOS e até OpenBSD, onde o login no e-SAJ já foi testado. O que importa é o navegador.

| Navegador | Versão mínima | Como instalar |
|---|---|---|
| Firefox | 128 | arquivo `.xpi` assinado pela Mozilla ([abaixo](#firefox)) |
| Google Chrome, Microsoft Edge, Brave, Chromium | 121 | [Chrome Web Store](https://chromewebstore.google.com/detail/pkmhmpmgojhgogcklacckpideochcggj) ([abaixo](#chrome-edge-brave-e-chromium)) |

**Tribunais:** o Jamegão só atua nos portais e-SAJ abaixo. Nos sistemas que já aceitam o certificado direto no navegador (eproc, Projudi, PJe pelo navegador), ele não é necessário.

| Tribunal | Endereço | Situação |
|---|---|---|
| TJSP | `esaj.tjsp.jus.br` | login testado no Firefox e no Brave |
| TJAL | `www2.tjal.jus.br` | login e assinatura testados na versão de teste |
| TJMS | `esaj.tjms.jus.br` | incluído, ainda não testado |
| TJAC | `esaj.tjac.jus.br` | incluído, ainda não testado |
| TJCE | `esaj.tjce.jus.br` | incluído (peticionamento de plantão), ainda não testado |
| TJBA | `esaj.tjba.jus.br` | incluído, ainda não testado |

Se você usar um desses que ainda não foram testados, conte como foi numa [issue](https://github.com/pedrohqb/jamegao/issues).

---

### Instalação

#### Firefox

1. Baixe o arquivo `jamegao-<versão>-firefox.xpi` da [página de versões](https://github.com/pedrohqb/jamegao/releases).
2. Arraste o arquivo para uma janela do Firefox e confirme. A instalação é permanente. Por enquanto, para atualizar, baixe e arraste o arquivo da versão nova da mesma forma: o cofre e os certificados continuam.
3. Em `about:addons` → Jamegão → **Permissões**, confira se o acesso aos sites do e-SAJ está ligado. O Firefox às vezes deixa desligado.

#### Chrome, Edge, Brave e Chromium

Instale pela **[Chrome Web Store](https://chromewebstore.google.com/detail/pkmhmpmgojhgogcklacckpideochcggj)**, com o botão **Usar no Chrome**. A mesma loja serve ao Edge, ao Brave e ao Chromium (no Edge, aceite "Permitir extensões de outras lojas" quando ele perguntar). A extensão se atualiza sozinha.

Se preferir instalar à mão, sem a loja:

1. Baixe o arquivo `jamegao-<versão>-chromium.zip` da [página de versões](https://github.com/pedrohqb/jamegao/releases) e descompacte-o **numa pasta fixa**, que você não vai apagar nem mover.
2. Abra `chrome://extensions` (no Edge, `edge://extensions`; no Brave, `brave://extensions`) e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta.

Para atualizar a instalação manual, substitua os arquivos **na mesma pasta** e clique em recarregar (a seta circular) no cartão do Jamegão. Carregar de outra pasta cria outra extensão, vazia.

#### Antes de usar: as extensões oficiais

Se o navegador também tiver uma extensão oficial de assinatura ativa, as duas respondem ao e-SAJ ao mesmo tempo, e o login falha (erro CERT-99). Escolha uma das saídas:

- desative as extensões oficiais nesse perfil do navegador; ou
- no ícone do Jamegão, em **Sites**, ligue **Deixar a extensão oficial responder** no site em que você quer usar a oficial (por exemplo, com token A3). O Jamegão fica calado ali.

---

### Uso

#### 1. Importar o certificado (uma vez)

A página de importação abre sozinha na instalação; depois, fica no ícone do Jamegão → **Importar certificado**.

1. Escolha o arquivo `.pfx` ou `.p12` (ou arraste-o para a página) e digite a senha dele.
2. Crie a **senha do cofre**, com pelo menos 8 caracteres. É ela que você vai digitar no dia a dia; a senha do PFX não é guardada.

A chave privada fica cifrada com a senha do cofre, no perfil do navegador. **Guarde o arquivo PFX**: ele é a sua cópia de segurança. Desinstalar a extensão apaga o cofre.

#### 2. Entrar no e-SAJ

Abra o e-SAJ e escolha a entrada por certificado digital, como faria com a extensão oficial.

- **Na primeira vez em cada tribunal**, uma janela do Jamegão pergunta se aquele site pode ver os seus certificados. Responda **Confirmar**.
- **A cada login**, a janela mostra "Assinar 1 documento com o certificado de [seu nome]" e, se o cofre estiver travado, pede a senha do cofre na mesma janela.

#### 3. Peticionar

Ao protocolar, o e-SAJ pede a assinatura de todos os arquivos de uma vez. A janela mostra **quantos documentos** serão assinados e com qual certificado, e uma confirmação vale para o lote inteiro.

#### A janela de confirmação

| Botão | O que faz |
|---|---|
| **Confirmar** | autoriza o que está descrito na janela |
| **Recusar** | o e-SAJ recebe "cancelado pelo usuário"; o site fica 15 segundos sem poder abrir outra janela |
| **Bloquear este site** | recusa e bloqueia o site; para desfazer, use **Desbloquear** no ícone |

Sem resposta em 2 minutos, o pedido vence e a janela fecha.

#### O ícone do Jamegão

- **Cofre:** se está travado ou destravado, e o botão **Travar agora**. O cofre trava sozinho depois de 30 minutos sem uso e quando o navegador fecha.
- **Certificados:** os importados, com a validade. Avisa quando faltam menos de 30 dias para vencer.
- **Sites:** cada e-SAJ que já pediu acesso, com as opções **Permitido**, **Deixar a extensão oficial responder** e **Desbloquear**.
- **Esqueci a senha:** sem a senha do cofre não há como recuperar a chave; o botão apaga cofre, certificados e sites, e você importa o PFX de novo.

Senhas erradas seguidas fazem o Jamegão esperar antes da próxima tentativa (até 5 minutos).

---

### Segurança e privacidade

- A chave privada só existe decifrada dentro da extensão, durante a assinatura. Ela nunca vai para a página do e-SAJ.
- Nenhum site recebe dados do certificado sem a sua autorização, e nenhuma assinatura é feita sem o cofre destravado e a sua confirmação na janela do Jamegão.
- A extensão não tem servidor, não faz conexões de rede e não coleta dados. Só o site do e-SAJ que você autorizou recebe, quando pede, os dados públicos do certificado e as assinaturas que você confirmou.
- Permissões pedidas ao navegador: só `storage` e `alarms`, e acesso apenas aos endereços da tabela de tribunais.

Detalhes na [política de privacidade](PRIVACIDADE.md).

---

### Perguntas frequentes

**O e-SAJ diz que o componente de assinatura não está instalado.** Confira se há algum certificado importado (o Jamegão só se apresenta ao e-SAJ quando há). No Firefox, confira também a permissão de acesso aos sites (passo 3 da instalação). Depois, recarregue a página.

**Reinstalei a extensão e sumiu tudo.** É o navegador: ao remover uma extensão, ele apaga os dados dela. Importe o PFX de novo. Para atualizar sem perder nada, veja a instalação de cada navegador.

**Posso usar no mesmo navegador o Jamegão para o A1 e a extensão oficial para o token?** Sim, site a site, com a opção **Deixar a extensão oficial responder**.

**Funciona no PJe, no eproc ou no Projudi?** Esses sistemas não usam as extensões que o Jamegão substitui. O eproc e o Projudi aceitam o certificado direto no navegador; o PJe usa o PJeOffice.

---

### A fazer

- **Testar a assinatura de petição** com a versão publicada, no Firefox e no Chromium (no protótipo, já funcionou no TJSP e no TJAL).
- **Testar TJMS, TJAC, TJCE e TJBA.**
- **Versão 0.1.1:** atualização automática no Firefox (endereço de atualização no manifesto) e ajustes apontados na validação da Mozilla (veja [pendências](docs/PENDENCIAS.md)).

---

### Desenvolvimento

O código não tem etapa de compilação: a pasta `ext/` é a extensão, com o mesmo código para Firefox e Chromium (Manifest V3). A única biblioteca de terceiros é a [node-forge](https://github.com/digitalbazaar/forge), sem alterações, usada só para ler o PFX na importação.

```
npm run preparar     # baixa as cópias do SDK do e-SAJ usadas nos testes e instala as dependências
npm run unit         # testes de unidade
BROWSER=chrome npm run e2e   # ponta a ponta no Chrome
BROWSER=firefox FIREFOX_BIN=/caminho/do/firefox npm run e2e   # ponta a ponta no Firefox
npm run empacotar    # gera dist/jamegao-<versão>.zip, o mesmo para as duas lojas
```

Para testar uma alteração sem empacotar: no Chromium, "Carregar sem compactação" com a pasta `ext/`; no Firefox, `about:debugging#/runtime/this-firefox` → "Carregar extensão temporária…" → `ext/manifest.json`.

- [Guia de testes](docs/TESTES.md): o roteiro manual no e-SAJ e a suíte automática.
- [Pendências](docs/PENDENCIAS.md): o que foi testado, o que falta e o que vai para a próxima versão.
- [Desenho](docs/superpowers/specs/2026-11-21-jamegao-design.md): decisões, protocolo e segurança.
- [Envio às lojas](docs/lojas/roteiro-de-envio.md): textos, capturas e passo a passo.

---

### Suporte e licença

- **Suporte:** abra uma [issue](https://github.com/pedrohqb/jamegao/issues) ou peça ajuda no grupo oficial no [Telegram](https://t.me/advogados_linux).
- **Licença:** GPL-3.0. A node-forge é distribuída sob a licença própria, em `ext/vendor/forge-LICENSE`.

---

## English

Jamegão is a Firefox and Chromium (Chrome, Edge, Brave) extension that lets Brazilian lawyers **log in and sign on e-SAJ court portals with an A1 digital certificate** (a PFX file), right in the browser, **with no native software installed**. It stands in for the official signing extensions e-SAJ asks for, which need a separately installed native component that is not available on every system (there is none for Apple Silicon Macs, for instance). *Jamegão* is Brazilian slang for someone's signature.

It is an independent project, not affiliated with the vendors of e-SAJ or of the official extensions, nor with the courts. A3 tokens and smart cards are not supported; for those, see the sister project [Tessera](https://github.com/pedrohqb/tessera).

**Works on** Linux, Windows, macOS, ChromeOS and even OpenBSD (e-SAJ login tested), with Firefox 128+ or Chromium-based browsers 121+, on the e-SAJ portals of TJSP, TJAL, TJMS, TJAC, TJCE and TJBA (tested so far on TJSP and TJAL).

**Install.** Firefox: download the Mozilla-signed `.xpi` from the [releases page](https://github.com/pedrohqb/jamegao/releases) and drag it into Firefox; then check in `about:addons` → Jamegão → Permissions that site access is on. Chromium browsers (Chrome, Edge, Brave): install from the [Chrome Web Store](https://chromewebstore.google.com/detail/pkmhmpmgojhgogcklacckpideochcggj). Disable the official signing extensions in that profile, or use the per-site "let the official extension answer" switch.

**Use.** Import your PFX once and set a vault password (8+ characters); the private key is stored encrypted in the browser profile. On e-SAJ, choose certificate login as usual. The first time on each court site, Jamegão asks whether the site may see your certificates; every signature, single or batch, needs your confirmation in Jamegão's own window, which shows how many documents will be signed. The vault locks after 30 minutes idle and when the browser closes.

**Privacy.** No server, no network connections, no data collection. Only the e-SAJ site you authorized receives, on request, your certificate's public data and the signatures you confirmed. See the [privacy policy](PRIVACIDADE.md) (in Portuguese).

**Development, support and license.** No build step; see [Desenvolvimento](#desenvolvimento) for the commands. Issues are welcome at [GitHub](https://github.com/pedrohqb/jamegao/issues). License: GPL-3.0.
