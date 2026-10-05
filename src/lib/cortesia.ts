// RLR · Cuentas de cortesía: la casa, la familia y los socios que ayudan a
// arrancar. A estas cuentas el sistema no les cobra en ningún sentido: sus
// salas son gratis para quien entre, y ellas entran gratis a cualquier sala.
// Lo que sí pueden es ganar (propinas, membresías que otros decidan pagar).
// Todo lo demás —para todas las demás cuentas— sigue exactamente igual.
// Para agregar una cuenta: una línea aquí y deploy.
export const CUENTAS_CORTESIA = new Set(
  [
    "akosta_33@hotmail.com",
    "eacosta@acorp.mx",
    "ana.acosta.lopez@gmail.com",
    "aacosta@institutosanford.edu.mx",
    "reyero.ricardo@gmail.com",
    "ricardo@superleads.mx",
    "yudiel@superleads.mx",
  ].map((e) => e.toLowerCase())
);

export function esCortesia(email: string | null | undefined): boolean {
  return !!email && CUENTAS_CORTESIA.has(email.trim().toLowerCase());
}

/** La entrada es gratis si la sala es de una cuenta de cortesía o si quien
 *  entra lo es. */
export function entradaGratis(ownerEmail: string | null | undefined, viewerEmail: string | null | undefined): boolean {
  return esCortesia(ownerEmail) || esCortesia(viewerEmail);
}
