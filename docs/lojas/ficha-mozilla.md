# Ficha do Jamegão em addons.mozilla.org (versão listada)

Campos na ordem em que a Mozilla pede. Os textos longos são os mesmos de
`descricao.md`, com o aviso sobre as extensões oficiais.

## Envio da versão

- Como distribuir: **Neste site**
- Arquivo: `jamegao-0.3.0.zip`
- Precisa enviar o código-fonte? **Não**

## Descrever a extensão

**Nome:** Jamegão

**URL da extensão (slug):** `jamegao` (o endereço fica
`https://addons.mozilla.org/firefox/addon/jamegao/`, que é o que o README usa)

**Resumo:**

Assinatura no e-SAJ e no PJe com certificado A1, sem instalar programa.

**Descrição:**

O Jamegão permite entrar e assinar documentos no e-SAJ e no PJe usando o seu certificado digital A1 (arquivo PFX), direto no navegador, sem instalar programa algum no computador.

Como funciona:
- Você importa o arquivo PFX do seu certificado A1 uma única vez e protege o cofre com uma senha.
- Quando o site do tribunal pede uma assinatura, o Jamegão mostra o que será assinado e pede a sua confirmação a cada login e a cada lote de assinaturas.
- A assinatura é feita no seu computador, com a chave que está guardada no navegador.

No PJe:
- O PJe vem desligado. Para usá-lo, marque "Usar também no PJe" no ícone do Jamegão (ou no fim da importação) e aceite a permissão para os sites do Judiciário (*.jus.br), pedida uma única vez.
- Certificados importados antes da versão 0.3.0 precisam ser importados de novo, porque o PJe exige a cadeia completa do certificado.
- Quem tem o programa assinador do PJe instalado pode continuar com ele: a janela do Jamegão oferece "Usar o programa instalado" a cada pedido, e "Bloquear este site" devolve um tribunal ao programa.
- Faz login e assinatura de documentos. Testado no PJe do TJMA; os demais tribunais ainda não foram testados.

Pontos importantes:
- Serve apenas para certificado A1 (arquivo). Não atende token nem cartão.
- Funciona em Linux, Windows, macOS e outros sistemas com Firefox, inclusive no Android.
- O Jamegão é para quem não usa as extensões oficiais de assinatura do e-SAJ. Se uma delas estiver ativa, o Jamegão se desliga na página e quem responde é ela.
- As chaves ficam cifradas com a senha do cofre, no perfil do seu navegador.
- A extensão não tem servidor, não faz conexões de rede e não envia nada ao desenvolvedor nem a terceiros. Só o site do e-SAJ ou do PJe que você autorizou recebe, quando pede, os dados públicos do certificado e as assinaturas que você confirmou.
- Código aberto, licença GPL-3.0: https://github.com/pedrohqb/jamegao

Guarde sempre a cópia de segurança do seu arquivo PFX. Ao desinstalar a extensão, os certificados guardados no navegador são apagados.

**Esta extensão é experimental?** Não

**Requer pagamento ou assinatura?** Não

**Categorias:** Outros (se puder marcar duas: Privacidade e segurança)

**Etiquetas:** assinatura digital, certificado digital, e-SAJ, PJe, ICP-Brasil, advocacia

## Detalhes adicionais

- **Página inicial:** `https://github.com/pedrohqb/jamegao`
- **Site de suporte:** `https://github.com/pedrohqb/jamegao/issues`
- **E-mail de suporte:** opcional; o mesmo de contato da Chrome Web Store, se quiser

## Licença e privacidade

- **Licença:** GNU General Public License v3.0
- **Acordo de licença (EULA):** desmarcado
- **Política de privacidade:** marcado, com:

> O Jamegão não coleta, não transmite e não vende dados. Não tem servidor próprio e não faz conexões de rede. O certificado importado e a chave privada, cifrada com a senha do cofre, ficam apenas no perfil do seu navegador. Só o site do e-SAJ ou do PJe que você autorizar recebe, quando pede, os dados públicos do certificado e as assinaturas que você confirmou; no PJe, quem as envia ao servidor do tribunal é a própria página.
>
> Texto completo: https://github.com/pedrohqb/jamegao/blob/main/PRIVACIDADE.md

## Mídia

- **Ícone:** `ext/icons/icon-128.png`
- **Capturas de tela:** `capturas/1-assinatura.png` a `capturas/4-importar.png`, nessa ordem

## Notas para os revisores

> Extensão sem servidor próprio e sem conexões de rede: assina localmente com certificado A1 importado pelo usuário. Permissões: storage (sessão do cofre destravado), alarms (bloqueio automático do cofre) e scripting (registro dos scripts do PJe, só quando o usuário liga o recurso). Dados persistentes no IndexedDB da extensão. Script de conteúdo fixo apenas nos portais e-SAJ de TJSP, TJAL, TJMS, TJAC, TJCE e TJBA; para testar sem certificado de produção, o e-SAJ do TJSP abre a tela de login por certificado em https://esaj.tjsp.jus.br/sajcas/login (aba "Certificado digital"). Permissão opcional https://*.jus.br/*: pedida (permissions.request) só quando o usuário marca "Usar também no PJe" no popup ou no fim da importação, porque o PJe está em dezenas de endereços sob .jus.br, sem padrão de nome. Com ela, a extensão registra (scripting.registerContentScripts) dois scripts em https://*.jus.br/*, excluídos os endereços do e-SAJ: protocolos/pje/pagina.js no mundo MAIN e protocolos/pje/conteudo.js no mundo isolado. O do mundo MAIN é necessário porque a página do PJe chama o assinador local pelo endereço de uma imagem (http://localhost:8800/...): o script trata só essas imagens, pede a assinatura à extensão, que pede a confirmação do usuário em janela própria, e a própria página envia o resultado ao seu servidor, na mesma origem. A extensão não faz requisição alguma, nem ao localhost; qualquer outra imagem passa intacta. vendor/forge.min.js é o node-forge 1.4.3 com uma única troca: new Function("return this")() por globalThis (o validador aponta o construtor Function; a linha não roda, porque ali this já é o objeto global). O aviso de que background.service_worker é ignorado pelo Firefox é esperado: o mesmo manifesto serve ao Chrome, que usa service_worker, e ao Firefox, que usa background.scripts. Código: https://github.com/pedrohqb/jamegao
