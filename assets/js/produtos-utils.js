// ============================================================================
// produtos-utils.js — Thunder Cell
// ----------------------------------------------------------------------------
// Formato canônico de um produto e as funções que todo mundo usa em cima dele.
// Compartilhado entre o site público (main.js), o painel admin (admin.js) e o
// script de build (scripts/build-catalog.js) — assim card, modal, admin e SEO
// nunca discordam sobre o que é "o preço" ou "a foto principal".
// ============================================================================

import { otimizarUrl } from "./image-config.js";

export const CONDICOES = ["Boa", "Muito boa", "Excelente"];
export const STATUS = ["Seminovo", "Novo"];

// `categoria` é o que decide em qual seção do site o aparelho aparece.
// Na prática ela anda junto com o `status` — por isso o painel a preenche
// sozinho a partir dele, e esta função é a única fonte dessa regra.
export const CATEGORIAS = ["novo", "usado"];

/** Categoria correspondente a um status ("Novo" → "novo"). */
export function categoriaDoStatus(status) {
  return status === "Novo" ? "novo" : "usado";
}

const formatadorBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

/** R$ 3.599,00 */
export function formatarBRL(valor) {
  return formatadorBRL.format(Number(valor) || 0);
}

/** R$ 3.599 — versão curta usada no preço grande do card. */
export function formatarPrecoCurto(valor) {
  const n = Number(valor) || 0;
  // Preços "redondos" ficam mais elegantes sem os centavos (R$ 3.599).
  if (Number.isInteger(n)) {
    return `R$ ${n.toLocaleString("pt-BR")}`;
  }
  return formatarBRL(n);
}

/** Escapa texto que vai para dentro de HTML gerado por template string. */
export function escapeHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------
// Dois formatos entram aqui e um só sai:
//   1. O registro do Firebase (modelo/capacidade/preco/fotos/...) — o formato
//      novo, gravado pelo painel admin.
//   2. O catálogo estático `data/produtos.json` (nome/selo/imagens/...) — o
//      formato antigo, que continua servindo de fallback enquanto o Firebase
//      não está configurado ou não responde.
// ---------------------------------------------------------------------------

/** Extrai "256GB" de uma lista de especificações do formato antigo. */
function capacidadeDasEspecificacoes(especificacoes) {
  if (!Array.isArray(especificacoes)) return "";
  const linha = especificacoes.find((e) => /\d+\s*(GB|TB)\s+de\s+Armazenamento/i.test(String(e)));
  if (!linha) return "";
  const match = String(linha).match(/(\d+\s*(?:GB|TB))/i);
  return match ? match[1].replace(/\s+/g, "") : "";
}

/** Aceita só porcentagem de bateria plausível (1-100); qualquer outra coisa vira null. */
function bateriaPorcentagem(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  if (n <= 0 || n > 100) return null;
  return Math.round(n);
}

/**
 * Converte qualquer um dos dois formatos no produto canônico.
 * @param {string} id  chave do Firebase (ou id numérico do JSON estático)
 */
export function normalizarProduto(id, bruto) {
  if (!bruto || typeof bruto !== "object") return null;

  const modelo = String(bruto.modelo ?? bruto.nome ?? "").trim();
  if (!modelo) return null;

  const capacidade = String(
    bruto.capacidade ?? capacidadeDasEspecificacoes(bruto.especificacoes) ?? ""
  ).trim();

  // Fotos: campo novo `fotos`, campo antigo `imagens`. Sempre uma lista.
  const fotosBrutas = Array.isArray(bruto.fotos)
    ? bruto.fotos
    : Array.isArray(bruto.imagens)
      ? bruto.imagens
      : [];
  const fotos = fotosBrutas
    .filter((url) => typeof url === "string" && url.trim() !== "")
    .map((url) => otimizarUrl(url.trim()));

  // Status: campo novo `status`, campo antigo `selo` ("Novo"/"Seminovo"/...).
  const statusBruto = String(bruto.status ?? bruto.selo ?? "").trim();
  const status = STATUS.includes(statusBruto) ? statusBruto : "Seminovo";

  const condicaoBruta = String(bruto.condicao ?? "").trim();
  const condicao = CONDICOES.includes(condicaoBruta) ? condicaoBruta : "";

  // Registros antigos (e importados) não têm `categoria`: deriva do status,
  // assim nenhum produto fica de fora das duas seções do catálogo.
  const categoriaBruta = String(bruto.categoria ?? "").trim().toLowerCase();
  const categoria = CATEGORIAS.includes(categoriaBruta)
    ? categoriaBruta
    : categoriaDoStatus(status);

  // Ativo = aparece no site. Default: visível.
  const ativo = bruto.ativo !== false;

  // Em estoque = pode comprar agora. Um produto pode estar ativo e esgotado:
  // ele continua no catálogo, só marcado.
  // O catálogo antigo usava `disponivel: false` com esse mesmo sentido de
  // "acabou" — por isso ele cai aqui, e não em `ativo`.
  const emEstoque =
    bruto.emEstoque !== undefined ? bruto.emEstoque !== false : bruto.disponivel !== false;

  return {
    id: String(id),
    modelo,
    capacidade,
    // Título completo usado em cards, modal, WhatsApp e SEO.
    titulo: capacidade ? `${modelo} ${capacidade}` : modelo,
    preco: Number(bruto.preco) || 0,
    parcelamento: String(bruto.parcelamento ?? "").trim(),
    bateria: bateriaPorcentagem(bruto.bateria),
    condicao,
    status,
    categoria,
    destaque: bruto.destaque === true,
    ativo,
    emEstoque,
    fotos,
    descricao: String(bruto.descricao ?? "").trim(),
    // `observacoes` é interno: fica de fora do objeto canônico usado no site
    // público de propósito, para não vazar por descuido em nenhum template.
    criadoEm: Number(bruto.criadoEm) || 0,
    atualizadoEm: Number(bruto.atualizadoEm) || Number(bruto.criadoEm) || 0,
  };
}

/**
 * Converte o objeto `produtos` do Firebase (ou o array do JSON estático) numa
 * lista canônica, já ordenada: destaques primeiro, depois os mais recentes.
 */
export function listarProdutos(dados, { somenteAtivos = true } = {}) {
  if (!dados) return [];

  const entradas = Array.isArray(dados)
    ? dados.map((p, i) => [p?.id ?? i, p])
    : Object.entries(dados);

  const lista = entradas
    .map(([id, bruto]) => normalizarProduto(id, bruto))
    .filter(Boolean)
    .filter((p) => (somenteAtivos ? p.ativo : true));

  return ordenarProdutos(lista);
}

/**
 * Ordem do catálogo:
 *   1. quem está em estoque vem antes — um esgotado no topo da vitrine
 *      frustra quem está comprando, mesmo estando em destaque;
 *   2. depois os destaques;
 *   3. por fim o cadastrado mais recente.
 */
export function ordenarProdutos(lista) {
  return [...lista].sort((a, b) => {
    if (a.emEstoque !== b.emEstoque) return a.emEstoque ? -1 : 1;
    if (a.destaque !== b.destaque) return a.destaque ? -1 : 1;
    return (b.criadoEm || 0) - (a.criadoEm || 0);
  });
}

/** Foto principal (ou string vazia se o produto não tiver nenhuma). */
export function fotoPrincipal(produto) {
  return produto.fotos[0] || "";
}

/** Foto do verso — só existe quando o produto tem 2 ou mais fotos. */
export function fotoVerso(produto) {
  return produto.fotos[1] || "";
}

/**
 * Texto do selo em pílula do card.
 * Produtos marcados como destaque ganham o selo sólido "DESTAQUE".
 */
export function seloDoProduto(produto) {
  if (produto.destaque) return { texto: "DESTAQUE", tipo: "destaque" };
  if (produto.status === "Novo") return { texto: "NOVO", tipo: "novo" };
  return { texto: "SEMI NOVO", tipo: "seminovo" };
}
