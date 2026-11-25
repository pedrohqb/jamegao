# Notas da versão 0.3.0

Texto para a release `v0.3.0` do GitHub e para o campo de notas da versão
nas lojas.

## Versão completa (GitHub)

**PJe.** O Jamegão agora também entra e assina no PJe com certificado A1, no
lugar do programa assinador que o PJe manda instalar.

- **Vem desligado.** Para usar, abra o ícone do Jamegão e marque **Usar
  também no PJe** (o mesmo botão aparece no fim da importação do
  certificado). O navegador pede, uma única vez, permissão para os sites
  `https://*.jus.br/*`, onde o PJe está. Depois, recarregue as páginas do PJe
  que estiverem abertas. No Firefox, se o pedido de permissão aparecer atrás
  da janela do ícone, feche a janela do ícone e aceite: o PJe fica ligado do
  mesmo jeito.
- **Importe o certificado de novo.** O PJe exige a cadeia completa do
  certificado, que o Jamegão só passou a guardar nesta versão. Os
  certificados importados antes aparecem no ícone com o aviso "Importe de
  novo para usar no PJe.": importe o mesmo arquivo PFX, que substitui o
  registro antigo. No e-SAJ nada muda. Importe antes de usar o PJe: com
  um certificado antigo, a janela do Jamegão no PJe só mostra o aviso e
  "Fechar". Se o PFX não trouxer as autoridades
  certificadoras, o ícone avisa que o PJe pode recusá-lo.
- **Login e assinatura de documentos.** Cada login e cada lote de documentos
  pedem confirmação na janela do Jamegão, com o site e a quantidade. Com mais
  de um certificado, a janela deixa escolher. Quem envia as assinaturas ao
  servidor do PJe é a própria página; a extensão continua sem fazer conexão
  de rede alguma.
- **O programa instalado pode ficar.** Na janela do Jamegão no PJe, **Usar o
  programa instalado** manda só aquele pedido ao programa, e **Bloquear este
  site** recusa o pedido e passa aquele site ao programa a partir do
  próximo. Quem não liga o PJe no
  Jamegão continua exatamente como antes.
- **Ainda não faz** as outras operações que o PJe possa pedir: nesses casos,
  o Jamegão deixa o pedido seguir para o programa instalado, se houver, e o
  ícone mostra a operação e o site. Conte numa
  [issue](https://github.com/pedrohqb/jamegao/issues).
- **Tribunais ainda não testados.** Login e assinatura de documentos foram
  testados no PJe do TJMA (1º grau), no Brave, numa versão de teste anterior
  à 0.3.0. Os demais tribunais da lista do PJe mantida pelo CNJ devem
  funcionar, mas ainda não foram testados, nem o PJe no Firefox ou no
  Android: se usar um deles, conte como foi.

**Outras mudanças**

- A janela de confirmação ficou um pouco maior (440×620) e rola quando o
  conteúdo não cabe.
- Nova permissão `scripting`, sem aviso na instalação, usada só para pôr o
  Jamegão nas páginas do PJe quando você liga.
- No e-SAJ, nada muda.

## Versão curta (lojas)

PJe: entrar e assinar documentos com certificado A1, sem o programa
assinador. Vem desligado: marque "Usar também no PJe" no ícone e aceite a
permissão para os sites *.jus.br. Certificados importados antes desta versão
precisam ser importados de novo para o PJe. Quem tem o programa do PJe pode
continuar com ele ("Usar o programa instalado"). Testado no TJMA, no
Brave, numa versão de teste anterior à 0.3.0; outros tribunais ainda não. No e-SAJ, nada muda.
