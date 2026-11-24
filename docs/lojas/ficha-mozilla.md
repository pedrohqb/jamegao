# Ficha do Jamegão em addons.mozilla.org (versão listada)

Campos na ordem em que a Mozilla pede. Os textos longos são os mesmos de
`descricao.md`, com o aviso sobre as extensões oficiais.

## Envio da versão

- Como distribuir: **Neste site**
- Arquivo: `jamegao-0.1.2.zip`
- Precisa enviar o código-fonte? **Não**

## Descrever a extensão

**Nome:** Jamegão

**URL da extensão (slug):** `jamegao` (o endereço fica
`https://addons.mozilla.org/firefox/addon/jamegao/`, que é o que o README usa)

**Resumo:**

Assinatura no e-SAJ com certificado A1, sem instalar programa.

**Descrição:**

O Jamegão permite entrar e assinar documentos no e-SAJ usando o seu certificado digital A1 (arquivo PFX), direto no navegador, sem instalar programa algum no computador.

Como funciona:
- Você importa o arquivo PFX do seu certificado A1 uma única vez e protege o cofre com uma senha.
- Quando o site do e-SAJ pede uma assinatura, o Jamegão mostra o que será assinado e pede a sua confirmação antes de cada lote de assinaturas.
- A assinatura é feita no seu computador, com a chave que está guardada no navegador.

Pontos importantes:
- Serve apenas para certificado A1 (arquivo). Não atende token nem cartão.
- Funciona em Linux, Windows, macOS e outros sistemas com Firefox.
- O Jamegão é para quem não usa as extensões oficiais de assinatura. Se uma delas estiver ativa, o Jamegão se desliga na página e quem responde é ela.
- As chaves ficam cifradas com a senha do cofre, no perfil do seu navegador.
- A extensão não tem servidor e não envia nada ao desenvolvedor nem a terceiros. Só o site do e-SAJ que você autorizou recebe, quando pede, os dados públicos do certificado e as assinaturas que você confirmou.
- Código aberto, licença GPL-3.0: https://github.com/pedrohqb/jamegao

Guarde sempre a cópia de segurança do seu arquivo PFX. Ao desinstalar a extensão, os certificados guardados no navegador são apagados.

**Esta extensão é experimental?** Não

**Requer pagamento ou assinatura?** Não

**Categorias:** Outros (se puder marcar duas: Privacidade e segurança)

**Etiquetas:** assinatura digital, certificado digital, e-SAJ, ICP-Brasil, advocacia

## Detalhes adicionais

- **Página inicial:** `https://github.com/pedrohqb/jamegao`
- **Site de suporte:** `https://github.com/pedrohqb/jamegao/issues`
- **E-mail de suporte:** opcional; o mesmo de contato da Chrome Web Store, se quiser

## Licença e privacidade

- **Licença:** GNU General Public License v3.0
- **Acordo de licença (EULA):** desmarcado
- **Política de privacidade:** marcado, com:

> O Jamegão não coleta, não transmite e não vende dados. Não tem servidor próprio e não faz conexões de rede. O certificado importado e a chave privada, cifrada com a senha do cofre, ficam apenas no perfil do seu navegador. Só o site do e-SAJ que você autorizar recebe, quando pede, os dados públicos do certificado e as assinaturas que você confirmou.
>
> Texto completo: https://github.com/pedrohqb/jamegao/blob/main/PRIVACIDADE.md

## Mídia

- **Ícone:** `ext/icons/icon-128.png`
- **Capturas de tela:** `capturas/1-assinatura.png` a `capturas/4-importar.png`, nessa ordem

## Notas para os revisores

> Extensão sem servidor próprio e sem conexões de rede: assina localmente com certificado A1 importado pelo usuário. Permissões: storage (sessão do cofre destravado) e alarms (bloqueio automático do cofre). Dados persistentes no IndexedDB da extensão. Script de conteúdo apenas nos portais e-SAJ de TJSP, TJAL, TJMS, TJAC, TJCE e TJBA; para testar sem certificado de produção, o e-SAJ do TJSP abre a tela de login por certificado em https://esaj.tjsp.jus.br/sajcas/login (aba "Certificado digital"). vendor/forge.min.js é o node-forge 1.4.3 sem alterações. Código: https://github.com/pedrohqb/jamegao
