# Textos para as lojas

## Nome

Jamegão

## Resumo (até 132 caracteres)

Assinatura no e-SAJ e no PJe com certificado A1, sem instalar programa.

## Descrição longa

O Jamegão permite entrar e assinar documentos no e-SAJ e no PJe usando o seu certificado digital A1 (arquivo PFX), direto no navegador, sem instalar programa algum no computador.

Como funciona:
- Você importa o arquivo PFX do seu certificado A1 uma única vez e protege o cofre com uma senha.
- Quando o site do tribunal pede uma assinatura, o Jamegão mostra o que será assinado e pede a sua confirmação a cada login e a cada lote de assinaturas.
- A assinatura é feita no seu computador, com a chave que está guardada no navegador.

No PJe:
- O PJe vem desligado. Para usá-lo, marque "Usar também no PJe" no ícone do Jamegão (ou no fim da importação) e aceite a permissão para os sites do Judiciário (*.jus.br), pedida uma única vez.
- Certificados importados antes da versão 0.3.0 precisam ser importados de novo, porque o PJe exige a cadeia completa do certificado.
- Quem tem o programa assinador do PJe instalado pode continuar com ele: a janela do Jamegão oferece "Usar o programa instalado" a cada pedido, e "Bloquear este site" passa aquele site ao programa a partir do próximo pedido.
- Faz login e assinatura de documentos. Testados no PJe do TJDFT, no Firefox, na 0.3.0, e no PJe do TJMA (1º grau), no Brave, numa versão de teste anterior; os demais tribunais e o Android ainda não foram testados no PJe.

Pontos importantes:
- Serve apenas para certificado A1 (arquivo). Não atende token nem cartão.
- Funciona em Linux, Windows, macOS e ChromeOS.
- As chaves ficam cifradas com a senha do cofre, no perfil do seu navegador.
- A extensão não tem servidor, não faz conexões de rede e não envia nada ao desenvolvedor nem a terceiros. Só o site do e-SAJ ou do PJe que você autorizou recebe, quando pede, os dados públicos do certificado e as assinaturas que você confirmou.
- Código aberto, licença GPL-3.0: https://github.com/pedrohqb/jamegao

Guarde sempre a cópia de segurança do seu arquivo PFX. Ao desinstalar a extensão, os certificados guardados no navegador são apagados.
