import { describe, it, expect } from "vitest";
import { folioDe, fmtPesos, fmtTiempo, fmtMomentoCDMX } from "../src/lib/email";
import { recibosDe, momentoEnTransmision, type EventoDinero } from "../src/lib/recibos";

// 4 de octubre de 2026, 11:58:07 a.m. hora de Ciudad de México (UTC-6).
const AT = Date.UTC(2026, 9, 4, 17, 58, 7) / 1000;

function evento(extra: Partial<EventoDinero> = {}): EventoDinero {
  return {
    tipo: "entrada",
    id: "pass_cf7064a074284167806460b4971325c6",
    at: AT,
    amountCents: 5000,
    creatorCents: 3750,
    appUrl: "https://video.capitaltorreon.com",
    room: { slug: "ana-creadora", title: "Ana Creadora" },
    viewer: { name: "María Pérez", email: "maria@test.local", avatarUrl: null, balanceAfterCents: 15000 },
    creator: { name: "Ana Creadora", email: "ana@test.local", avatarUrl: null, creatorBalanceAfterCents: 34720 },
    session: { startedAt: AT - 754, endedAt: null },
    expiresAt: AT + 3600,
    ...extra,
  };
}

describe("recibos de dinero", () => {
  it("el folio sale del id, es legible y es estable", () => {
    expect(folioDe("pass_cf7064a074284167806460b4971325c6")).toBe("VR-CF70-64A0-7428");
    expect(folioDe("pass_cf7064a074284167806460b4971325c6")).toBe(folioDe("pass_cf7064a074284167806460b4971325c6"));
    expect(folioDe("tip_0a1b2c3d4e5f60718293a4b5c6d7e8f9")).not.toBe(folioDe("pass_cf7064a074284167806460b4971325c6"));
    expect(folioDe("tr_1Qx8Yz2eZvKYlo2C")).toBe("VR-1QX8-YZ2E-ZVKY");
  });

  it("los pesos llevan centavos exactos", () => {
    expect(fmtPesos(3750)).toBe("$37.50");
    expect(fmtPesos(5000)).toBe("$50.00");
    expect(fmtPesos(15920)).toBe("$159.20");
    expect(fmtPesos(199900)).toBe("$1,999.00");
  });

  it("la hora exacta va con segundos y en hora de Ciudad de México", () => {
    const m = fmtMomentoCDMX(AT);
    expect(m).toContain("4 de octubre de 2026");
    expect(m).toMatch(/11:58:07/);
    expect(m).toContain("hora de Ciudad de México");
  });

  it("el momento en la transmisión se cuenta desde que empezó", () => {
    expect(fmtTiempo(754)).toBe("12:34");
    expect(fmtTiempo(3725)).toBe("1:02:05");
    expect(momentoEnTransmision(evento())).toBe("Minuto 12:34 de la transmisión");
    expect(momentoEnTransmision(evento({ tipo: "despedida", session: { startedAt: AT - 4000, endedAt: AT - 300 } }))).toBe(
      "5 minutos después de que terminó la transmisión"
    );
    expect(momentoEnTransmision(evento({ session: null }))).toBe("Fuera de transmisión");
  });

  it("los dos recibos llevan el mismo folio, la misma hora y los mismos montos", () => {
    const { viewer, creator } = recibosDe(evento());
    for (const m of [viewer, creator]) {
      expect(m.subject).toContain("VR-CF70-64A0-7428");
      expect(m.html).toContain("VR-CF70-64A0-7428");
      expect(m.text).toContain("VR-CF70-64A0-7428");
      expect(m.html).toContain("11:58:07");
      expect(m.html).toContain("Minuto 12:34 de la transmisión");
      expect(m.html).toContain("$50.00");
      expect(m.html).toContain("$37.50");
      expect(m.html).toContain("$12.50");
    }
    // Quien ve sabe cuánto le queda; quien transmite sabe cuánto tiene ahora.
    expect(viewer.html).toContain("$150.00 MXN");
    expect(creator.html).toContain("$347.20 MXN");
    // Nada sin escapar: un nombre con < no rompe el correo.
    const { creator: c2 } = recibosDe(evento({ viewer: { name: "<b>x</b>", email: "x@test.local", avatarUrl: null, balanceAfterCents: 0 } }));
    expect(c2.html).not.toContain("<b>x</b>");
  });

  it("cada tipo tiene su propio asunto y los montos correctos", () => {
    const tip = recibosDe(evento({ tipo: "propina", id: "tip_0a1b2c3d4e5f60718293a4b5c6d7e8f9", amountCents: 10000, creatorCents: 9000, message: "Gracias por la clase", expiresAt: null }));
    expect(tip.viewer.subject).toContain("Le mandaste $100.00 MXN");
    expect(tip.creator.subject).toContain("+$90.00 para ti");
    expect(tip.creator.html).toContain("Gracias por la clase");
    expect(tip.viewer.html).toContain("$10.00 MXN"); // comisión
    const mem = recibosDe(evento({ tipo: "membresia", id: "mem_0a1b2c3d4e5f60718293a4b5c6d7e8f9", amountCents: 19900, creatorCents: 15920, session: null, expiresAt: AT + 30 * 86400 }));
    expect(mem.creator.subject).toContain("+$159.20 para ti");
    expect(mem.viewer.html).toContain("3 de noviembre de 2026");
  });
});

import { sePuedeEnviar } from "../src/lib/email";
describe("nunca se manda correo a direcciones de prueba", () => {
  it("rechaza dominios reservados y llaves que no son de Resend", () => {
    expect(sePuedeEnviar("re_abc", "usr_x@test.local")).toBe(false);
    expect(sePuedeEnviar("re_abc", "a@example.com")).toBe(false);
    expect(sePuedeEnviar("re_abc", "a@test.com")).toBe(false);
    expect(sePuedeEnviar("sin-envios-en-pruebas", "ricardo@superleads.mx")).toBe(false);
    expect(sePuedeEnviar("re_abc", "ricardo@superleads.mx")).toBe(true);
    expect(sePuedeEnviar("re_abc", "delivered@resend.dev")).toBe(true);
  });
});
