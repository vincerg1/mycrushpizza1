function normalizePhoneES(input) {
  if (!input) return null;

  let raw = String(input).trim();

  // quitar todo lo que no sean números
  raw = raw.replace(/[^\d+]/g, '');

  // 0034 -> +34
  if (raw.startsWith('0034')) {
    raw = '+34' + raw.slice(4);
  }

  // 34XXXXXXXXX -> +34XXXXXXXXX
  if (raw.startsWith('34') && raw.length === 11) {
    raw = '+34' + raw.slice(2);
  }

  // 6XXXXXXXX o 7XXXXXXXX o 9XXXXXXXX → España
  if (/^[679]\d{8}$/.test(raw)) {
    raw = '+34' + raw;
  }

  // +34XXXXXXXXX válido
  if (/^\+34\d{9}$/.test(raw)) {
    return raw;
  }

  return null;
}

module.exports = { normalizePhoneES };
