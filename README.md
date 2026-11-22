# Jamegão

Extensão para Chromium (Chrome, Edge, Brave) e Firefox que permite assinar documentos nos sites do e-SAJ com certificado digital A1 (arquivo PFX), sem instalar nenhum programa no computador.

## Para quem é

Advogados e escritórios que usam certificado A1 e trabalham em Linux, Windows, macOS ou ChromeOS. Certificados em token ou cartão (A3) não são atendidos.

## Instalar para teste

- Chromium: abra `chrome://extensions`, ative o modo do desenvolvedor, clique em "Carregar sem compactação" e escolha a pasta `ext/`.
- Firefox: abra `about:debugging#/runtime/this-firefox`, clique em "Carregar extensão temporária" e escolha `ext/manifest.json`.

## Testes

```
npm run preparar          # baixa os SDKs usados nos testes e instala as dependências
npm run unit
BROWSER=chrome npm run e2e
```

## Testar no Firefox

Os testes de ponta a ponta também rodam no Firefox (128 ou mais novo), por WebDriver BiDi, com a extensão instalada como temporária:

```
BROWSER=firefox FIREFOX_BIN=/caminho/do/firefox npm run e2e
```

`FIREFOX_BIN` é obrigatório. Para ver a janela, acrescente `HEADFUL=1`. O teste "fundo encerrado no meio do lote" só existe no Chrome (usa o protocolo CDP para parar o service worker) e é pulado no Firefox, onde o fundo é uma página de eventos; o ensaio de rede do fundo também é pulado (as páginas da extensão continuam testadas).

## Empacotar

```
npm run empacotar
```

Gera `dist/jamegao-<versão>.zip`, o mesmo arquivo para as duas lojas. O passo a passo de envio está em `docs/lojas/roteiro-de-envio.md`.

## Privacidade

A extensão não coleta nem transmite dado algum. Veja `PRIVACIDADE.md`.

## Desenho

O desenho da extensão está em `docs/superpowers/specs/`.

## Licença

GPL-3.0. Veja `LICENSE`.
