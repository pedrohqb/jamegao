// Aviso de validade do certificado: "vencido" ou "vence em N dias" (até 30).
export const LIMITE_AVISO_DIAS = 30;
const DIA_MS = 86400000;

export function avisoValidade(validityEnd, now = Date.now()) {
  const fim = Date.parse(validityEnd);
  if (!Number.isFinite(fim)) return null;
  const data = new Date(fim).toLocaleDateString('pt-BR');
  if (fim < now) return { tipo: 'vencido', texto: `Certificado vencido em ${data}.` };
  const dias = Math.ceil((fim - now) / DIA_MS);
  if (dias > LIMITE_AVISO_DIAS) return null;
  return { tipo: 'vence-logo', texto: `Certificado vence em ${dias} ${dias === 1 ? 'dia' : 'dias'} (${data}).` };
}
