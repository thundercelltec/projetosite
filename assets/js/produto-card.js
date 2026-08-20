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

import { siteConfig, linkWhatsapp, mensagemInteresse, garantiaDoStatus } from "./site-config.js";
import {
  escapeHtml,
  formatarPrecoCurto,
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

export function cardHtml(produto, indice = 0) {
  const selo = seloDoProduto(produto);
  const frente = fotoPrincipal(produto);
  const verso = fotoVerso(produto);
  const titulo = escapeHtml(produto.titulo);
  const parcelamento = produto.parcelamento || siteConfig.parcelamentoPadrao;
  const wa = linkWhatsapp(mensagemInteresse(produto.titulo));

  const midia = frente
    ? `<div class="product-card__media">
    <img class="product-card__img product-card__img--front" src="${escapeHtml(frente)}" alt="${titulo}" loading="lazy" decoding="async" width="600" height="450" />
    ${verso ? `<img class="product-card__img product-card__img--back" src="${escapeHtml(verso)}" alt="${titulo} — parte de trás" loading="lazy" decoding="async" width="600" height="450" />` : ""}
    ${seloHtml(selo)}
  </div>`
    : `<div class="product-card__media product-card__media--sem-foto">
    ${icone("image")}<span>Foto em breve</span>${seloHtml(selo)}
  </div>`;

  return `<article class="product-card reveal${produto.destaque ? " product-card--destaque" : ""}" style="--delay: ${Math.min(indice, 8) * 60}ms" data-id="${escapeHtml(produto.id)}">
  ${midia}
  <div class="product-card__body">
    <h3 class="product-card__name">${escapeHtml(produto.modelo)}${produto.capacidade ? ` <span>${escapeHtml(produto.capacidade)}</span>` : ""}</h3>
    <div>
      <p class="product-card__price">${formatarPrecoCurto(produto.preco)}</p>
      ${parcelamento ? `<p class="product-card__parcelamento">${escapeHtml(parcelamento)}</p>` : ""}
    </div>
    ${specRowHtml(produto)}
    ${produto.descricao ? `<p class="product-card__desc">${escapeHtml(produto.descricao)}</p>` : ""}
    <div class="product-card__actions">
      <button class="btn btn--ghost btn--sm" type="button" data-detalhes="${escapeHtml(produto.id)}">Ver detalhes</button>
      <a class="btn btn--whatsapp btn--sm" data-wa data-wa-message="${escapeHtml(mensagemInteresse(produto.titulo))}" href="${escapeHtml(wa)}" target="_blank" rel="noopener noreferrer">${icone("whatsapp")}Tenho interesse</a>
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
export const GRUPOS = [
  { categoria: "novo", titulo: "Aparelhos novos", icone: "star", garantiaDe: "Novo" },
  { categoria: "usado", titulo: "Aparelhos seminovos", icone: "refresh", garantiaDe: "Seminovo" },
];

function grupoHtml(grupo, produtos) {
  const garantia = garantiaDoStatus(grupo.garantiaDe);
  const quantidade = produtos.length === 1 ? "1 aparelho" : `${produtos.length} aparelhos`;

  return `<section class="catalog-group" data-grupo="${grupo.categoria}">
  <header class="catalog-group__head">
    <h3 class="catalog-group__title">${icone(grupo.icone)}${grupo.titulo}</h3>
    <span class="catalog-group__count">${quantidade}</span>
    <p class="catalog-group__sub">Garantia de <strong>${escapeHtml(garantia.texto)}</strong> ${escapeHtml(garantia.detalhe)}.</p>
  </header>
  <div class="product-grid">
${produtos.map((p, i) => cardHtml(p, i)).join("\n")}
  </div>
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
