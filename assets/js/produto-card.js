// ============================================================================
// produto-card.js — HTML de um card de produto
// ----------------------------------------------------------------------------
// Usado nos dois lugares que desenham um card:
//   • main.js, no navegador, com os dados vindos do Firebase;
//   • scripts/build-catalog.js, no deploy, para o card existir mesmo sem JS
//     (Google, preview de link, primeiro paint).
//
// Por isso o `href` do WhatsApp já sai pronto daqui: a versão pré-renderizada
// precisa funcionar com o JavaScript desligado. O `data-wa` continua no
// elemento para o main.js poder reescrever o link se o telefone mudar no
// site-config.js.
// ============================================================================

import {
  siteConfig,
  linkWhatsapp,
  mensagemInteresse,
  mensagemAvisoRetorno,
  garantiaDoStatus,
  boletoParcelasMax,
} from "./site-config.js";
import {
  escapeHtml,
  formatarBRL,
  fotoPrincipal,
  fotoVerso,
  seloDoProduto,
} from "./produtos-utils.js";

function icone(nome) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${nome}"></use></svg>`;
}

function seloHtml(selo) {
  return `<span class="pill pill--${selo.tipo}">${icone("star")}${selo.texto}</span>`;
}

/** Linha de badges: bateria, condição e status. Só mostra o que existe. */
export function specRowHtml(produto) {
  const badges = [];

  if (produto.bateria !== null && produto.bateria !== undefined) {
    badges.push(`<span class="spec">${icone("battery")}Bateria <strong>${produto.bateria}%</strong></span>`);
  }
  if (produto.condicao) {
    badges.push(`<span class="spec">${icone("shield")}<strong>${escapeHtml(produto.condicao)}</strong></span>`);
  }
  badges.push(`<span class="spec">${icone("star")}<strong>${escapeHtml(produto.status)}</strong></span>`);

  return `<div class="spec-row">${badges.join("")}</div>`;
}

/** O aparelho mostra a chamada do boleto? Só quem tem preço a prazo cadastrado. */
function temPrazo(produto) {
  return produto.statusEstoque !== "esgotado" && Boolean(produto.precoAPrazo) && produto.aceitaBoleto !== false;
}

/**
 * Bloco de preços, igual no card e no modal.
 *   À vista  R$ X          ← destaque
 *   A prazo no boleto R$ Y ← só quando cadastrado (sem linha vazia)
 *   [Parcelamos no boleto em até 24x]
 * Esgotado mostra só o à vista: não há oferta a prazo para anunciar.
 *
 * @param {string} classePreco  classe do valor em destaque (card ou modal)
 */
export function precosHtml(produto, classePreco = "product-card__price") {
  const prazo = temPrazo(produto);
  return `<p class="${classePreco}"><span class="preco-rot">À vista</span> ${formatarBRL(produto.precoAVista)}</p>
      ${prazo ? `<p class="preco-prazo">A prazo no boleto <strong>${formatarBRL(produto.precoAPrazo)}</strong></p>` : ""}`;
}

/** Selo "Parcelamos no boleto em até 24x" — leva para a seção #boleto. */
export function seloBoletoHtml(produto) {
  if (!temPrazo(produto)) return "";
  return `<a class="tag-boleto" href="#boleto">${icone("card")}Parcelamos no boleto em até ${boletoParcelasMax()}x</a>`;
}

/**
 * @param {object} produto
 * @param {number} indice   posição no grupo (usada no atraso da animação)
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.extra]  card além do limite inicial do grupo.
 *   Extras NÃO recebem a classe `reveal`: eles nascem escondidos por
 *   `display:none`, e um elemento nesse estado nunca dispara o
 *   IntersectionObserver — ficariam com opacidade 0 para sempre ao expandir.
 */
export function cardHtml(produto, indice = 0, { extra = false } = {}) {
  const selo = seloDoProduto(produto);
  const frente = fotoPrincipal(produto);
  const verso = fotoVerso(produto);
  const titulo = escapeHtml(produto.titulo);
  const parcelamento = produto.parcelamento || siteConfig.parcelamentoPadrao;
  const esgotado = produto.statusEstoque === "esgotado";

  // Esgotado troca o convite de compra por um pedido de aviso — o link é o
  // mesmo WhatsApp, só muda a mensagem que já vai escrita.
  const mensagem = esgotado
    ? mensagemAvisoRetorno(produto.titulo)
    : mensagemInteresse(produto.titulo);
  const wa = linkWhatsapp(mensagem);

  // O cross-fade frente/verso do hover só pode acontecer quando existe verso —
  // sem essa marcação a frente sumiria e o card ficaria vazio.
  const classesMidia = [
    "product-card__media",
    verso ? "product-card__media--com-verso" : "",
    esgotado ? "product-card__media--esgotado" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const faixaEsgotado = esgotado ? `<span class="selo-esgotado">Esgotado</span>` : "";

  const midia = frente
    ? `<div class="${classesMidia}">
    <img class="product-card__img product-card__img--front" src="${escapeHtml(frente)}" alt="${titulo}" loading="lazy" decoding="async" width="600" height="450" />
    ${verso ? `<img class="product-card__img product-card__img--back" src="${escapeHtml(verso)}" alt="${titulo} — parte de trás" loading="lazy" decoding="async" width="600" height="450" />` : ""}
    ${seloHtml(selo)}${faixaEsgotado}
  </div>`
    : `<div class="${classesMidia} product-card__media--sem-foto">
    ${icone("image")}<span>Foto em breve</span>${seloHtml(selo)}${faixaEsgotado}
  </div>`;

  const classes = [
    "product-card",
    extra ? "product-card--extra" : "reveal",
    produto.destaque ? "product-card--destaque" : "",
    esgotado ? "product-card--esgotado" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // O card mostra só o essencial de comparação: foto, selo, modelo, preços
  // (à vista e, se houver, a prazo no boleto), parcelamento e os badges. A `descricao` fica de fora de propósito — na
  // prática ela repetia, produto a produto e com texto diferente em cada um,
  // o que as seções de garantia e de troca de usado já dizem uma vez só logo
  // abaixo. Ela continua inteira no banco e aparece em "Ver detalhes".
  return `<article class="${classes}" style="--delay: ${Math.min(indice, 8) * 60}ms" data-id="${escapeHtml(produto.id)}">
  ${midia}
  <div class="product-card__body">
    <h3 class="product-card__name">${escapeHtml(produto.modelo)}${produto.capacidade ? ` <span>${escapeHtml(produto.capacidade)}</span>` : ""}</h3>
    <div>
      ${precosHtml(produto)}
      ${esgotado
        ? `<p class="retorna-breve">${icone("refresh")}Retorna em breve</p>`
        : parcelamento ? `<p class="product-card__parcelamento">${escapeHtml(parcelamento)}</p>` : ""}
      ${seloBoletoHtml(produto)}
    </div>
    ${specRowHtml(produto)}
    <div class="product-card__actions">
      <button class="btn btn--ghost btn--sm" type="button" data-detalhes="${escapeHtml(produto.id)}">Ver detalhes</button>
      <a class="btn ${esgotado ? "btn--aviso" : "btn--whatsapp"} btn--sm" data-wa data-wa-message="${escapeHtml(mensagem)}" href="${escapeHtml(wa)}" target="_blank" rel="noopener noreferrer">${icone(esgotado ? "bell" : "whatsapp")}${esgotado ? "Avise-me quando chegar" : "Tenho interesse"}</a>
    </div>
  </div>
</article>`;
}

// ---------------------------------------------------------------------------
// Agrupamento por tipo de aparelho
// ---------------------------------------------------------------------------
// O catálogo é sempre exibido separado em "novos" e "seminovos" — as duas
// coisas têm preço, expectativa e prazo de garantia diferentes, e misturá-las
// numa grade só confunde quem está comparando.

// A divisão do catálogo segue o campo `categoria` do produto.
// `limite` = quantos cards aparecem antes de tocar em "Ver mais". No celular
// o catálogo inteiro vira uma rolagem longa demais; o resto fica a um toque.
export const GRUPOS = [
  { categoria: "novo", titulo: "Aparelhos novos", icone: "star", garantiaDe: "Novo", limite: 3 },
  { categoria: "usado", titulo: "Aparelhos seminovos", icone: "refresh", garantiaDe: "Seminovo", limite: 2 },
];

function grupoHtml(grupo, produtos) {
  const garantia = garantiaDoStatus(grupo.garantiaDe);
  const quantidade = produtos.length === 1 ? "1 aparelho" : `${produtos.length} aparelhos`;

  const escondidos = Math.max(0, produtos.length - grupo.limite);
  const rotuloMais =
    escondidos === 1 ? "Ver mais 1 aparelho" : `Ver mais ${escondidos} aparelhos`;

  // Todos os cards vão para o HTML — inclusive os que começam escondidos.
  // Esconder no CSS (e não na geração) mantém o catálogo inteiro visível para
  // o Google e para quem estiver sem JavaScript.
  const cards = produtos
    .map((p, i) => cardHtml(p, i, { extra: i >= grupo.limite }))
    .join("\n");

  const botao = escondidos
    ? `
  <div class="grupo-mais">
    <button class="btn btn--outline grupo-mais__btn" type="button"
            data-expandir="${grupo.categoria}" aria-expanded="false"
            aria-controls="grade-${grupo.categoria}"
            data-label-mais="${escapeHtml(rotuloMais)}" data-label-menos="Ver menos">
      <span class="grupo-mais__label">${escapeHtml(rotuloMais)}</span>
      ${icone("chevron")}
    </button>
  </div>`
    : "";

  return `<section class="catalog-group${escondidos ? " is-recolhido" : ""}" data-grupo="${grupo.categoria}">
  <header class="catalog-group__head">
    <h3 class="catalog-group__title">${icone(grupo.icone)}${grupo.titulo}</h3>
    <span class="catalog-group__count">${quantidade}</span>
    <p class="catalog-group__sub">Garantia de <strong>${escapeHtml(garantia.texto)}</strong> ${escapeHtml(garantia.detalhe)}.</p>
  </header>
  <div class="product-grid" id="grade-${grupo.categoria}">
${cards}
  </div>${botao}
</section>`;
}

/**
 * Catálogo inteiro, dividido em grupos. Grupo sem produto não é desenhado —
 * uma seção "Aparelhos novos" vazia passaria a impressão errada de que o site
 * está quebrado.
 */
export function catalogoHtml(produtos) {
  return GRUPOS.map((grupo) => {
    const doGrupo = produtos.filter((p) => p.categoria === grupo.categoria);
    return doGrupo.length ? grupoHtml(grupo, doGrupo) : "";
  })
    .filter(Boolean)
    .join("\n");
}
