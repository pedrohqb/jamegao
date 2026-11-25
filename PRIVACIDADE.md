# Política de privacidade do Jamegão

O Jamegão não tem servidor e não envia dado algum ao desenvolvedor nem a terceiros: não coleta, não usa serviço de análise de uso e não envia telemetria. A extensão não faz conexão de rede alguma e só entrega dados ao site do e-SAJ ou do PJe que você autorizou, quando esse site os pede (veja abaixo).

## O que fica no seu navegador

- Os certificados A1 que você importa ficam guardados apenas no perfil do seu navegador. A chave privada é cifrada com a senha do cofre, que só você conhece. O certificado público e os dados usados para exibi-lo (nome, CPF e demais campos) ficam no perfil sem cifra.
- As configurações da extensão ficam no mesmo perfil: os sites autorizados ou bloqueados, se o PJe está ligado e, no PJe, o último certificado escolhido em cada site.
- Enquanto o navegador está aberto, a extensão anota as operações do PJe que ainda não atende (o nome da operação e o site), para mostrá-las no ícone. A anotação some quando o navegador fecha.
- A assinatura é feita localmente, no seu computador. Depois que você autoriza um site do e-SAJ ou do PJe e quando ele pede, a página recebe os dados públicos do certificado (nome, CPF, data de nascimento e outros campos do padrão ICP-Brasil, além do próprio certificado e, no PJe, a cadeia de certificados das autoridades certificadoras) e as assinaturas que você confirmou. Nada disso vai para outro destino.

## PJe

O PJe vem desligado. Se você o ligar, o navegador dá à extensão acesso aos sites `https://*.jus.br/*`, onde o PJe está. Nesses sites, o Jamegão só age quando a página chama o programa assinador do PJe; dela, só chega à extensão o que será assinado (a mensagem do login ou os resumos dos documentos), e nunca os cookies ou outros dados da sua sessão. Quem envia as assinaturas ao servidor do PJe é a própria página, para o mesmo site em que você está, como faria com o programa instalado. Assinatura destinada a outro site é recusada antes de assinar.

## Remoção

Ao desinstalar a extensão, o navegador apaga os certificados, a chave cifrada e as configurações. Mantenha sempre a cópia de segurança do seu arquivo PFX.

## Alterações e contato

Se esta política mudar, a nova versão será publicada neste repositório. Dúvidas ou comunicações: abra uma issue em https://github.com/pedrohqb/jamegao/issues
