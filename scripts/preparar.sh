#!/bin/sh
# Baixa do npm as cópias do SDK Web PKI usadas pelos testes (não vão no pacote)
# e instala as dependências de desenvolvimento.
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
for v in 2.8.0 2.14.8 2.20.0; do
  mkdir "$tmp/$v"
  (cd "$tmp/$v" && npm pack "web-pki@$v" >/dev/null && tar xzf ./*.tgz)
done
mkdir -p test/www
cp "$tmp/2.20.0/package/lacuna-web-pki.js" test/www/lacuna-2.20.0.js
cp "$tmp/2.14.8/package/lacuna-web-pki.js" test/www/lacuna-2.14.8.js
# O SDK da Softplan é um derivado antigo do da Lacuna; o teste o emula
# trocando o prefixo dos eventos e os IDs de extensão.
sed -e 's/com\.lacunasoftware\.WebPKI/br.com.softplan.WebPKI/g' \
    -e 's/dcngeagmmhegagicpcmpinaoklddcgon/bbafmabaelnnkondpfpjmdklbmfnbmol/g' \
    -e 's/webpki@lacunasoftware\.com/websigner@softplan.com.br/g' \
    "$tmp/2.8.0/package/lacuna-web-pki.js" > test/www/softplan-emulado-2.8.0.js
rm -rf "$tmp"
npm install
echo "Pronto. Rode: npm run unit && npm run e2e"
