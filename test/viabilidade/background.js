// Registra, ao iniciar, um script no mundo da página nos sites .jus.br (menos o e-SAJ).
const SCRIPT = {
  id: 'v-main',
  matches: ['https://*.jus.br/*'],
  excludeMatches: ['https://esaj.tjsp.jus.br/*'],
  js: ['pagina.js'],
  runAt: 'document_start',
  allFrames: true,
  world: 'MAIN',
  persistAcrossSessions: true,
};

async function registrar() {
  const ja = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT.id] });
  if (ja.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT.id] });
  await chrome.scripting.registerContentScripts([SCRIPT]);
}

registrar().catch((e) => console.error('registro falhou:', e));
