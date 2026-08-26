// ============================================================================
// main.js — site público da Thunder Cell
// ----------------------------------------------------------------------------
// De onde vêm os produtos:
//   1. Firebase Realtime Database (fonte da verdade). O painel admin grava lá
//      e o site atualiza sozinho, sem redeploy.
//   2. `#produtosFallback` — cópia embutida no HTML durante o deploy pelo
//      scripts/build-catalog.js. Serve de primeira pintura, de conteúdo para
//      o Google e de rede de segurança se o banco não responder.
//
// Enquanto (1) não chega, a grade mostra o skeleton de carregamento.
// ============================================================================

import {
  siteConfig,
  linkWhatsapp,
  mensagemInteresse,
  mensagemAvisoRetorno,
  garantiaDoStatus,
} from "./site-config.js";
import { firebaseConfig, DB_PATHS, firebaseConfigurado } from "./firebase-config.js";
import { otimizarUrl } from "./image-config.js";
import { listarProdutos, formatarBRL, escapeHtml } from "./produtos-utils.js";
// O mesmo módulo que o build usa para pré-renderizar o catálogo — card do
// navegador e card do HTML estático nunca saem diferentes.
import { catalogoHtml, specRowHtml } from "./produto-card.js";

// ---------------------------------------------------------------------------
// Identidade da loja aplicada ao HTML estático
// ---------------------------------------------------------------------------
// Assim o telefone e o prazo de garantia moram só no site-config.js: trocar
// lá atualiza o header, o botão flutuante, o rodapé e a seção de garantia.
function aplicarConfig() {
  document.querySelectorAll("[data-wa]").forEach((el) => {
    const mensagem = el.dataset.waMessage || siteConfig.mensagemPadrao;
    el.href = linkWhatsapp(mensagem);
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  });

  // `data-garantia="Novo"` / `data-garantia="Seminovo"` recebem o prazo certo
  // do site-config.js, então mudar a política não exige mexer no HTML.
  document.querySelectorAll("[data-garantia]").forEach((el) => {
    el.textContent = garantiaDoStatus(el.dataset.garantia).texto;
  });
}

// ---------------------------------------------------------------------------
// Cabeçalho: sombra ao rolar, menu mobile e link ativo
// ---------------------------------------------------------------------------
function iniciarCabecalho() {
  const header = document.getElementById("header");
  const toggle = document.getElementById("navToggle");
  const menu = document.getElementById("navMobile");

  const aoRolar = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  aoRolar();
  window.addEventListener("scroll", aoRolar, { passive: true });

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

  // Marca no menu a seção que está na tela. `rootMargin` puxa a linha de
  // detecção para a altura do header, senão a seção "ativa" troca cedo demais.
  const links = [...document.querySelectorAll(".nav__link")];
  const secoes = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if (secoes.length) {
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

// ---------------------------------------------------------------------------
// Animação de entrada ao rolar
// ---------------------------------------------------------------------------
// Um observador só, reaproveitado: quem entrar na página depois (os cards
// gerados por JS) é registrado pela mesma instância via `observarReveal`.
let observadorReveal = null;

function iniciarReveal() {
  const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (semMovimento || !("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
    return;
  }

  observadorReveal = new IntersectionObserver(
    (entradas, obs) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add("is-visible");
        obs.unobserve(entrada.target); // anima uma vez só
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  observarReveal(document);
}

function observarReveal(raiz) {
  const alvos = raiz.querySelectorAll?.(".reveal:not(.is-visible)") ?? [];
  if (!observadorReveal) {
    alvos.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  alvos.forEach((el) => observadorReveal.observe(el));
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------
const area = document.getElementById("productsArea");
const resultsInfo = document.getElementById("resultsInfo");
const formFiltros = document.getElementById("filtros");
const inputBusca = document.getElementById("busca");
const selectPreco = document.getElementById("faixa-preco");
const selectCondicao = document.getElementById("condicao");
const elAbas = document.getElementById("tabs");
const aviso = document.getElementById("catalogNotice");

/** Lista canônica atual (já filtrada só pelos ativos). */
let produtos = [];
/** Aba selecionada: "" (todos), "Novo" ou "Seminovo". */
let tipoAtivo = "";
/** Vira true no primeiro lote de dados que chega — só então trocamos o HTML. */
let jaRenderizou = false;

function mostrarAviso(texto) {
  if (!aviso) return;
  aviso.querySelector("span").textContent = texto;
  aviso.classList.add("is-visible");
}

function esconderAviso() {
  aviso?.classList.remove("is-visible");
}


// ---- Filtros ---------------------------------------------------------------

/** Remove acentos e caixa para a busca casar "iphone" com "iPhone". */
function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function aplicarFiltros() {
  const termo = normalizarTexto(inputBusca?.value);
  const faixa = selectPreco?.value || "";
  const condicao = selectCondicao?.value || "";

  const [minStr, maxStr] = faixa.split("-");
  const min = minStr ? Number(minStr) : 0;
  const max = maxStr ? Number(maxStr) : Infinity;

  return produtos.filter((p) => {
    // Aba (novo / usado). "" mostra os dois grupos.
    if (tipoAtivo && p.categoria !== tipoAtivo) return false;
    if (termo && !normalizarTexto(`${p.modelo} ${p.capacidade}`).includes(termo)) return false;
    if (faixa && (p.preco < min || p.preco > max)) return false;
    // Estado de conservação: "Boa", "Muito boa" ou "Excelente".
    if (condicao && p.condicao !== condicao) return false;

    return true;
  });
}

function renderizar() {
  const lista = aplicarFiltros();

  if (lista.length === 0) {
    area.innerHTML = produtos.length === 0 ? estadoVazioSemProdutos() : estadoVazioSemResultado();
  } else {
    area.innerHTML = catalogoHtml(lista);
  }

  // Os cards recém-criados precisam do link de WhatsApp montado e de entrar
  // na fila da animação de entrada.
  aplicarConfig();
  observarReveal(area);
  restaurarGruposExpandidos();

  atualizarContagem(lista.length);
}

function atualizarContagem(exibidos) {
  if (!resultsInfo) return;
  if (produtos.length === 0) {
    resultsInfo.textContent = "";
    return;
  }
  // Contar esgotados como "disponíveis" seria uma promessa falsa: eles estão
  // no catálogo, mas não à venda. Por isso o aviso é separado.
  const lista = aplicarFiltros();
  const esgotados = lista.filter((p) => p.statusEstoque === "esgotado").length;
  const aviso =
    esgotados > 0
      ? ` · <strong>${esgotados}</strong> esgotado${esgotados > 1 ? "s" : ""}`
      : "";

  resultsInfo.innerHTML =
    (exibidos === produtos.length
      ? `<strong>${produtos.length}</strong> ${produtos.length === 1 ? "aparelho no catálogo" : "aparelhos no catálogo"}`
      : `<strong>${exibidos}</strong> de ${produtos.length} aparelhos`) + aviso;
}

function estadoVazioSemResultado() {
  return `<div class="empty-state">
            <svg class="icon" aria-hidden="true"><use href="#i-search-x"></use></svg>
            <h3>Nenhum aparelho com esses filtros</h3>
            <p>Tente outro modelo ou amplie a faixa de preço. Se procura algo específico, fale com a gente.</p>
          </div>`;
}

function estadoVazioSemProdutos() {
  return `<div class="empty-state">
            <svg class="icon" aria-hidden="true"><use href="#i-box"></use></svg>
            <h3>Estoque em atualização</h3>
            <p>Estamos cadastrando os aparelhos disponíveis. Chame no WhatsApp que a gente te conta o que tem em loja.</p>
          </div>`;
}

function iniciarFiltros() {
  if (!formFiltros) return;

  // `submit` só existiria se alguém apertasse Enter — filtramos ao digitar.
  formFiltros.addEventListener("submit", (e) => e.preventDefault());
  inputBusca?.addEventListener("input", renderizar);
  selectPreco?.addEventListener("change", renderizar);
  selectCondicao?.addEventListener("change", renderizar);

  // O reset limpa os campos só DEPOIS do evento; por isso o setTimeout(0).
  // As abas ficam fora do <form>, então voltam ao estado inicial na mão.
  formFiltros.addEventListener("reset", () => {
    selecionarAba("");
    setTimeout(renderizar, 0);
  });
}

/** Marca a aba ativa (sem redesenhar — quem chama decide quando renderizar). */
function selecionarAba(tipo) {
  tipoAtivo = tipo;
  elAbas?.querySelectorAll(".tab").forEach((botao) => {
    const ativo = botao.dataset.tipo === tipo;
    botao.classList.toggle("is-active", ativo);
    botao.setAttribute("aria-selected", String(ativo));
  });
}

function iniciarAbas() {
  if (!elAbas) return;
  elAbas.addEventListener("click", (e) => {
    const botao = e.target.closest(".tab");
    if (!botao) return;
    selecionarAba(botao.dataset.tipo);
    renderizar();
  });
}

// ---------------------------------------------------------------------------
// Modal de detalhes
// ---------------------------------------------------------------------------
const modal = document.getElementById("modalProduto");
const modalConteudo = document.getElementById("modalConteudo");
let ultimoFoco = null;

function abrirModal(produto) {
  if (!modal) return;
  ultimoFoco = document.activeElement;

  const parcelamento = produto.parcelamento || siteConfig.parcelamentoPadrao;
  const garantia = garantiaDoStatus(produto.status);
  const esgotado = produto.statusEstoque === "esgotado";
  const mensagem = esgotado
    ? mensagemAvisoRetorno(produto.titulo)
    : mensagemInteresse(produto.titulo);
  const galeria = produto.fotos.length
    ? `<div class="modal__gallery">
         ${produto.fotos
           .map(
             (url, i) =>
               `<img src="${escapeHtml(url)}" alt="${escapeHtml(produto.titulo)} — foto ${i + 1}" loading="lazy" />`
           )
           .join("")}
       </div>`
    : "";

  modalConteudo.innerHTML = `
    ${galeria}
    <div class="modal__body">
      <h2 class="modal__title" id="modalTitulo">${escapeHtml(produto.titulo)}</h2>
      ${specRowHtml(produto)}
      <div>
        <p class="modal__price">${formatarBRL(produto.preco)}</p>
        ${esgotado
          ? `<p class="retorna-breve"><svg class="icon" aria-hidden="true"><use href="#i-refresh"></use></svg>Retorna em breve</p>`
          : parcelamento ? `<p class="product-card__parcelamento">${escapeHtml(parcelamento)}</p>` : ""}
      </div>
      ${produto.descricao ? `<p class="modal__desc">${escapeHtml(produto.descricao)}</p>` : ""}
      <hr class="dotted-rule" />
      <p class="modal__desc">
        Aparelho testado e com IMEI verificado. Garantia de
        <strong>${escapeHtml(garantia.texto)}</strong> ${escapeHtml(garantia.detalhe)}.
      </p>
      <div class="modal__actions">
        <a class="btn ${esgotado ? "btn--aviso" : "btn--whatsapp"} btn--lg" data-wa data-wa-message="${escapeHtml(mensagem)}" href="#">
          <svg class="icon" aria-hidden="true"><use href="#i-${esgotado ? "bell" : "whatsapp"}"></use></svg>
          ${esgotado ? "Avise-me quando chegar" : "Tenho interesse"}
        </a>
        <button class="btn btn--ghost btn--lg" type="button" data-fechar-modal>Voltar ao catálogo</button>
      </div>
    </div>`;

  aplicarConfig();

  modal.hidden = false;
  // Um quadro de atraso para o navegador registrar o estado inicial e a
  // transição de entrada de fato acontecer.
  requestAnimationFrame(() => modal.classList.add("is-open"));
  document.body.style.overflow = "hidden";
  document.getElementById("modalFechar")?.focus();
}

function fecharModal() {
  if (!modal || modal.hidden) return;
  modal.classList.remove("is-open");
  document.body.style.overflow = "";
  // Espera a transição terminar antes de esconder de verdade.
  setTimeout(() => {
    modal.hidden = true;
    modalConteudo.innerHTML = "";
  }, 260);
  ultimoFoco?.focus();
}

function iniciarModal() {
  if (!modal) return;

  document.getElementById("modalFechar")?.addEventListener("click", fecharModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal();
    if (e.target.closest("[data-fechar-modal]")) fecharModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharModal();
  });

  // Delegação: os cards são recriados a cada filtro, então o clique é
  // escutado na grade e não em cada botão.
  area?.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-detalhes]");
    if (!botao) return;
    const produto = produtos.find((p) => p.id === botao.dataset.detalhes);
    if (produto) abrirModal(produto);
  });
}

// ---------------------------------------------------------------------------
// Fonte de dados
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Banner inicial (hero)
// ---------------------------------------------------------------------------
const heroGallery = document.getElementById("heroGallery");

/**
 * Desenha as fotos do topo. Sem foto cadastrada, mostra um espaço discreto —
 * nunca imagem quebrada nem um bloco desalinhado.
 */
function renderizarHero(fotos) {
  if (!heroGallery) return;

  const validas = (Array.isArray(fotos) ? fotos : [])
    .filter((url) => typeof url === "string" && url.trim() !== "")
    .slice(0, 3);

  if (validas.length === 0) {
    heroGallery.innerHTML = `<p class="hero__gallery-vazio">
        <svg class="icon" aria-hidden="true"><use href="#i-image"></use></svg>
        <span>Fotos do banner em breve</span>
      </p>`;
    return;
  }

  heroGallery.innerHTML = validas
    .map(
      (url, i) =>
        `<img class="hero__phone" src="${escapeHtml(otimizarUrl(url, 600))}" alt="" width="400" height="533"
              ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" />`
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Ver mais / Ver menos por grupo
// ---------------------------------------------------------------------------
// Cada grupo nasce recolhido (o limite vem do produto-card.js). A escolha do
// visitante fica guardada aqui e é reaplicada a cada redesenho — senão digitar
// na busca recolheria de novo o que a pessoa acabou de abrir.
const gruposExpandidos = new Set();

const semMovimento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function definirEstadoGrupo(grupo, expandido, { animar = false } = {}) {
  const botao = grupo.querySelector("[data-expandir]");
  if (!botao) return;

  grupo.classList.toggle("is-recolhido", !expandido);
  botao.setAttribute("aria-expanded", String(expandido));
  botao.querySelector(".grupo-mais__label").textContent = expandido
    ? botao.dataset.labelMenos
    : botao.dataset.labelMais;

  if (!expandido || !animar) return;

  // Os extras não têm a classe `reveal`, então já entram visíveis; a animação
  // é só o "fade + sobe" da aparição.
  grupo.classList.add("is-expandindo");
  setTimeout(() => grupo.classList.remove("is-expandindo"), 900);
}

/** Reaplica, depois de cada render, o que o visitante tinha aberto. */
function restaurarGruposExpandidos() {
  area.querySelectorAll(".catalog-group").forEach((grupo) => {
    if (gruposExpandidos.has(grupo.dataset.grupo)) definirEstadoGrupo(grupo, true);
  });
}

function iniciarVerMais() {
  area?.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-expandir]");
    if (!botao) return;

    const grupo = botao.closest(".catalog-group");
    const chave = botao.dataset.expandir;
    const vaiExpandir = grupo.classList.contains("is-recolhido");

    if (vaiExpandir) {
      gruposExpandidos.add(chave);
      definirEstadoGrupo(grupo, true, { animar: true });
      return;
    }

    gruposExpandidos.delete(chave);
    definirEstadoGrupo(grupo, false);
    // Recolher some com o conteúdo abaixo do dedo; voltar ao topo do grupo
    // evita o susto de "para onde a página pulou?".
    grupo.scrollIntoView({
      behavior: semMovimento() ? "auto" : "smooth",
      block: "start",
    });
  });
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------
// Não existe embed automático do Instagram que seja gratuito e funcione num
// site estático (a API oficial exige app + token do Facebook). Então a loja
// escolhe as fotos em /admin > Instagram, e elas ficam em config/instagram.
// Sem foto cadastrada, a grade some e sobra o convite — que já está no HTML.
const igGrid = document.getElementById("igGrid");

function renderizarInstagram(itens) {
  if (!igGrid) return;

  const fotos = (Array.isArray(itens) ? itens : [])
    .map((item) => (typeof item === "string" ? { url: item } : item))
    .filter((item) => item && typeof item.url === "string" && item.url.trim() !== "")
    .slice(0, 8);

  if (fotos.length === 0) {
    igGrid.hidden = true;
    igGrid.innerHTML = "";
    return;
  }

  igGrid.innerHTML = fotos
    .map(({ url, link }) => {
      // Sem link do post, o clique leva ao perfil — nunca a lugar nenhum.
      const destino = link && link.trim() ? link.trim() : siteConfig.instagram;
      return `<a class="ig-foto" href="${escapeHtml(destino)}" target="_blank" rel="noopener noreferrer"
                 aria-label="Ver publicação no Instagram">
                <img src="${escapeHtml(otimizarUrl(url, 500))}" alt="" loading="lazy" decoding="async" />
                <svg class="icon" aria-hidden="true"><use href="#i-instagram"></use></svg>
              </a>`;
    })
    .join("");
  igGrid.hidden = false;
}

// ---------------------------------------------------------------------------
// Perguntas frequentes
// ---------------------------------------------------------------------------
// O accordion é `<details name="faq">` puro: abre e fecha sem JavaScript. O
// atributo `name` (que fecha os irmãos) é recente; onde ele não existe, este
// trecho faz o mesmo trabalho na mão.
function iniciarFaq() {
  const itens = [...document.querySelectorAll('.faq__item[name="faq"]')];
  if (itens.length === 0) return;

  const suportaExclusivo = "name" in document.createElement("details");
  if (suportaExclusivo) return;

  itens.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      itens.forEach((outro) => {
        if (outro !== item) outro.open = false;
      });
    });
  });
}

/** Cartões-fantasma exibidos enquanto o catálogo do banco não chega. */
function mostrarSkeletons(quantidade = 3) {
  const cartoes = Array.from(
    { length: quantidade },
    () => `<div class="skeleton-card" aria-hidden="true">
             <div class="skeleton-card__media shimmer"></div>
             <div class="skeleton-card__body">
               <div class="shimmer shimmer--chip"></div>
               <div class="shimmer shimmer--title"></div>
               <div class="shimmer shimmer--price"></div>
               <div class="shimmer shimmer--line"></div>
             </div>
           </div>`
  ).join("");
  area.innerHTML = `<div class="product-grid">${cartoes}</div>`;
  if (resultsInfo) resultsInfo.textContent = "Carregando o estoque…";
}

/** Lê a cópia embutida no HTML pelo build. */
function produtosDoFallback() {
  const tag = document.getElementById("produtosFallback");
  if (!tag) return [];
  try {
    return listarProdutos(JSON.parse(tag.textContent || "[]"));
  } catch (erro) {
    console.error("Catálogo de reserva inválido:", erro);
    return [];
  }
}

function usarProdutos(lista, { origem }) {
  produtos = lista;
  jaRenderizou = true;
  if (origem === "firebase") esconderAviso();
  renderizar();
}

async function carregarCatalogo() {
  const reserva = produtosDoFallback();

  if (!firebaseConfigurado()) {
    // Setup ainda pendente: o site funciona normalmente com a cópia local.
    console.info(
      "Firebase ainda não configurado (assets/js/firebase-config.js). Usando o catálogo local."
    );
    usarProdutos(reserva, { origem: "fallback" });
    return;
  }

  // Sem cópia local (primeiro deploy, ou build sem produtos) a grade estaria
  // vazia enquanto o banco responde — aí sim vale mostrar o skeleton. Quando
  // existe HTML pré-renderizado, deixá-lo na tela é melhor: o visitante já vê
  // os aparelhos e a troca acontece sem piscar.
  if (reserva.length === 0) mostrarSkeletons();

  // Rede de segurança: se o banco não responder, mostramos a cópia local em
  // vez de deixar o visitante olhando o skeleton para sempre.
  const prazo = setTimeout(() => {
    if (jaRenderizou) return;
    usarProdutos(reserva, { origem: "fallback" });
    if (reserva.length) {
      mostrarAviso("Conexão lenta: mostrando a última versão salva do catálogo.");
    }
  }, 7000);

  try {
    const [{ initializeApp }, { getDatabase, ref, onValue }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js"),
    ]);

    const db = getDatabase(initializeApp(firebaseConfig));

    // `onValue` mantém a página sincronizada: o que a loja salvar no painel
    // aparece aqui sem ninguém precisar recarregar nada.
    onValue(
      ref(db, DB_PATHS.produtos),
      (snap) => {
        clearTimeout(prazo);
        usarProdutos(listarProdutos(snap.val()), { origem: "firebase" });
      },
      (erro) => {
        clearTimeout(prazo);
        console.error("Erro ao ler o catálogo do Firebase:", erro);
        if (!jaRenderizou) usarProdutos(reserva, { origem: "fallback" });
        if (reserva.length) {
          mostrarAviso("Não conseguimos atualizar o estoque agora. Confirme a disponibilidade pelo WhatsApp.");
        }
      }
    );

    // Fotos do Instagram. Sem elas a seção continua de pé (só o convite).
    onValue(
      ref(db, DB_PATHS.instagram),
      (snap) => renderizarInstagram(snap.val()),
      (erro) => console.warn("Fotos do Instagram não carregadas:", erro?.code || erro)
    );

    // Fotos do banner. Falha aqui não atrapalha o catálogo: o HTML já traz o
    // banner pré-renderizado do último deploy, e o hero tem estado vazio.
    onValue(
      ref(db, DB_PATHS.heroFotos),
      (snap) => renderizarHero(snap.val()),
      (erro) => {
        // Enquanto o nó `config` não estiver liberado nas regras do banco,
        // esta leitura volta como permission_denied. É esperado e não quebra
        // nada — o aviso abaixo diz exatamente o que fazer.
        const semPermissao = String(erro?.code || erro).includes("permission_denied");
        console.warn(
          semPermissao
            ? "Banner não carregado: falta liberar o nó `config` nas regras do Realtime Database (veja o README, seção 4)."
            : `Banner não carregado: ${erro}`
        );
      }
    );
  } catch (erro) {
    clearTimeout(prazo);
    console.error("Não foi possível carregar o Firebase:", erro);
    usarProdutos(reserva, { origem: "fallback" });
  }
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
aplicarConfig();
iniciarCabecalho();
// Se o build não pré-renderizou nenhuma foto de banner, já mostra o estado
// vazio — assim o hero nunca fica com um buraco no lugar das imagens.
if (heroGallery && heroGallery.children.length === 0) renderizarHero([]);
iniciarReveal();
iniciarAbas();
iniciarFiltros();
iniciarModal();
iniciarVerMais();
iniciarFaq();
carregarCatalogo();
