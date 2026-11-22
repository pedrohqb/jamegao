# Política de privacidade do Jamegão

O Jamegão não tem servidor e não envia dado algum ao desenvolvedor nem a terceiros: não coleta, não usa serviço de análise de uso e não envia telemetria. A extensão só entrega dados ao site do e-SAJ que você autorizou, quando esse site os pede (veja abaixo).

## O que fica no seu navegador

- Os certificados A1 que você importa ficam guardados apenas no perfil do seu navegador. A chave privada é cifrada com a senha do cofre, que só você conhece. O certificado público e os dados usados para exibi-lo (nome, CPF e demais campos) ficam no perfil sem cifra.
- As configurações da extensão ficam no mesmo perfil.
- A assinatura é feita localmente, no seu computador. Depois que você autoriza um site do e-SAJ e quando ele pede, a página recebe os dados públicos do certificado (nome, CPF, data de nascimento e outros campos do padrão ICP-Brasil, além do próprio certificado) e as assinaturas que você confirmou. Nada disso vai para outro destino.

## Remoção

Ao desinstalar a extensão, o navegador apaga os certificados, a chave cifrada e as configurações. Mantenha sempre a cópia de segurança do seu arquivo PFX.

## Alterações e contato

Se esta política mudar, a nova versão será publicada neste repositório. Dúvidas ou comunicações: abra uma issue em https://github.com/pedrohqb/jamegao/issues
