export function normalizePhoneES(raw) {
  if (!raw) return null;

  // quitar todo lo que no sean dígitos
  let digits = String(raw).replace(/[^\d]/g, "");

  // si viene con 00 (0034...)
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // si viene con 34 delante
  if (digits.startsWith("34") && digits.length === 11) {
    digits = digits.slice(2);
  }

  // ahora debería ser 9 dígitos
  if (digits.length !== 9) {
    return null; // número inválido
  }

  return `+34${digits}`;
}
