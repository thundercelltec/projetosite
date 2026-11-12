// ============================================================================
// pagina-simples.js — páginas internas (ex.: garantia.html)
// ----------------------------------------------------------------------------
// Faz só o mínimo que toda página precisa: o cabeçalho (menu mobile, sombra
// ao rolar), os links de WhatsApp montados a partir do site-config.js e o
// prazo de garantia. Sem catálogo, sem Firebase — por isso não vale a pena
// carregar o main.js aqui.
// ============================================================================

import { siteConfig, linkWhatsapp, garantiaDoStatus } from "./site-config.js";
import { iniciarCabecalho } from "./cabecalho.js";

iniciarCabecalho();

document.querySelectorAll("[data-wa]").forEach((el) => {
  el.href = linkWhatsapp(el.dataset.waMessage || siteConfig.mensagemPadrao);
  el.target = "_blank";
  el.rel = "noopener noreferrer";
});

document.querySelectorAll("[data-garantia]").forEach((el) => {
  el.textContent = garantiaDoStatus(el.dataset.garantia).texto;
});

document.querySelectorAll("[data-whatsapp-exibicao]").forEach((el) => {
  el.textContent = siteConfig.whatsappExibicao;
});
