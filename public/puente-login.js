// RLR · Puente entre el login de la casa (login.capitaltorreon.com) y la
// sesión de Video Room.
//
// La casa dice quién eres (pase en localStorage, lo maneja login.js). Video
// Room necesita su propia sesión (cookie HttpOnly) para cobrar y transmitir.
// Este puente las mantiene iguales, sin que la persona haga nada:
//  - hay pase de la casa y aquí no hay sesión → se la pide al servidor con el
//    pase (POST /auth/ct) y recarga; en el home, mejor: directo al monedero.
//  - la casa acaba de cerrar sesión (#salio=1) → aquí también se cierra.
//  - ya hay sesión y se entra al home sin ?ver=1 → al monedero: quien ya
//    entró no necesita que le expliquen qué es Video Room.
// Va ANTES de login.js (sin defer) para alcanzar a ver el #salio=1 en la
// URL antes de que login.js lo limpie.
(function () {
  "use strict";
  var _k = "eye", _rev = 181218;
  var salio = /salio=1/.test(location.hash);
  var params = new URLSearchParams(location.search);
  var esHome = location.pathname === "/";
  var tieneVr = function () { return /(?:^|; )vr_ok=1/.test(document.cookie); };
  var ocupado = false;

  function alMonedero(nuevo) {
    location.replace(nuevo ? "/app/bienvenida" : "/app/monedero");
  }

  async function sincronizar() {
    if (ocupado || !window.LoginCT) return;
    var pase = LoginCT.pase();
    if (pase && !tieneVr()) {
      ocupado = true;
      try {
        var r = await fetch("/auth/ct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pase: pase }) });
        if (r.ok) {
          var j = await r.json();
          if (esHome && !params.has("ver")) alMonedero(j.nuevo);
          else location.reload();
          return;
        }
      } catch (e) {}
      ocupado = false;
      return;
    }
    if (!pase && salio && tieneVr()) {
      ocupado = true;
      salio = false;
      try { await fetch("/auth/salir", { method: "POST" }); } catch (e) {}
      location.reload();
      return;
    }
    if (pase && tieneVr() && esHome && !params.has("ver")) alMonedero(false);
  }

  function listo() {
    if (!window.LoginCT) { setTimeout(listo, 60); return; }
    sincronizar();
    try { LoginCT.al(function () { sincronizar(); }); } catch (e) {}
  }
  if (document.readyState === "complete") listo(); else window.addEventListener("load", listo);

  // Entrar: siempre por la casa. Sin login.js (bloqueado, sin red), el
  // servidor manda allá igual desde /login.
  window.VRLogin = {
    entrar: function () { if (window.LoginCT) LoginCT.entrar(); else location.href = "/login"; },
  };
})();
