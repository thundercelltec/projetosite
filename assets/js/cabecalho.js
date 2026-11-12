// ============================================================================
// cabecalho.js — cabeçalho compartilhado por todas as páginas públicas
// ----------------------------------------------------------------------------
// Sombra ao rolar, menu mobile e link ativo. Mora num módulo próprio para a
// home (main.js) e as páginas internas (pagina-simples.js) usarem exatamente o
// mesmo comportamento — o header é o mesmo HTML nas duas.
// ============================================================================

export function iniciarCabecalho() {
  const header = document.getElementById("header");
  const toggle = document.getElementById("navToggle");
  const menu = document.getElementById("navMobile");
  if (!header) return;

  const aoRolar = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  aoRolar();
  window.addEventListener("scroll", aoRolar, { passive: true });

  if (toggle && menu) {
    const fecharMenu = () => {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Abrir menu");
    };

    toggle.addEventListener("click", () => {
      const aberto = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(aberto));
      toggle.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
    });

    menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", fecharMenu));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fecharMenu();
    });
  }

  // Marca no menu a seção que está na tela. Só vale para links de âncora da
  // própria página ("#catalogo"); nas páginas internas os links apontam para
  // "index.html#..." e simplesmente não entram aqui.
  // `rootMargin` puxa a linha de detecção para a altura do header, senão a
  // seção "ativa" troca cedo demais.
  const links = [...document.querySelectorAll(".nav__link")].filter((link) =>
    (link.getAttribute("href") || "").startsWith("#")
  );
  const secoes = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if (secoes.length && "IntersectionObserver" in window) {
    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return;
          links.forEach((link) => {
            link.classList.toggle(
              "is-active",
              link.getAttribute("href") === `#${entrada.target.id}`
            );
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    secoes.forEach((s) => observador.observe(s));
  }
}
