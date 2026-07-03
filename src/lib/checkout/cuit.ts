// Validación de CUIT/CUIL: dígito verificador (mod 11) y cruce contra el DNI.
// Compartido entre el wizard (validación en el cliente) y el backend (re-validación).

/** Deja solo los dígitos */
export function cuitDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Formatea a XX-XXXXXXXX-X a medida que se tipea */
export function formatCuitInput(value: string): string {
  const d = cuitDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/** Verifica el dígito verificador del CUIT/CUIL (algoritmo mod 11) */
export function isValidCuit(value: string): boolean {
  const d = cuitDigits(value);
  if (d.length !== 11) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i], 10) * mult[i];
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false;
  return check === parseInt(d[10], 10);
}

/** Los 8 dígitos centrales del CUIT/CUIL deben coincidir con el DNI */
export function cuitMatchesDni(cuit: string, dni: string): boolean {
  const c = cuitDigits(cuit);
  const d = cuitDigits(dni);
  if (c.length !== 11 || d.length < 7 || d.length > 8) return false;
  return parseInt(c.slice(2, 10), 10) === parseInt(d, 10);
}
