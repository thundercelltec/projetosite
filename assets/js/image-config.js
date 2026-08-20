// ============================================================================
// image-config.js — Thunder Cell
// ----------------------------------------------------------------------------
// Configuração do Cloudinary — usado pelo painel admin para enviar as fotos
// dos produtos direto do celular/navegador, sem servidor próprio.
//
// >>> ATENÇÃO: esta é uma conta Cloudinary NOVA, EXCLUSIVA da Thunder Cell.
//     NÃO reaproveite a conta do site de leilão (Thunder Diecast). <<<
//
// Conta: ecryyjxy, preset "thundercell" (já configurado — README, seção 3).
// O preset PRECISA estar com Signing Mode = "Unsigned" no painel do
// Cloudinary, senão o upload pelo admin volta com erro 401.
//
// O preset "unsigned" é seguro de expor no navegador: ele só permite enviar
// imagens para a pasta configurada, não dá acesso à sua conta.
// ============================================================================

export const imageConfig = {
  cloudName: "ecryyjxy",
  uploadPreset: "thundercell",
  // Pasta dentro do Cloudinary onde as imagens ficam organizadas (opcional).
  folder: "thundercell-produtos",

  // --- Remoção automática de fundo ----------------------------------------
  // Deixa o aparelho recortado, sem o fundo da foto tirada na loja.
  // Requer que a conta Cloudinary tenha a transformação de background removal
  // liberada (veja o README, seção "Fotos sem fundo").
  //
  // O painel NÃO confia cegamente nisso: ao enviar uma foto ele testa a URL
  // recortada e só guarda essa versão se o Cloudinary devolver a imagem de
  // verdade. Se a conta não tiver a cota, ele guarda a foto original e avisa
  // — nunca deixa o catálogo com imagem quebrada.
  removerFundo: true,
};

/** Diz se o Cloudinary já foi configurado de verdade. */
export function cloudinaryConfigurado() {
  const valores = [imageConfig.cloudName, imageConfig.uploadPreset];
  return valores.every((v) => typeof v === "string" && v.trim() !== "" && !v.includes("COLE_AQUI"));
}

// ---------------------------------------------------------------------------
// Otimização automática das imagens
// ---------------------------------------------------------------------------
// O Cloudinary entrega a imagem já redimensionada/comprimida quando pedimos
// via URL. Em vez de guardar a URL crua no banco, guardamos a URL otimizada:
// `f_auto` escolhe o melhor formato (WebP/AVIF), `q_auto` a melhor compressão
// e `w_...` limita a largura. Isso deixa o site público muito mais leve.
const LARGURA_MAXIMA = 1200;

// `e_background_removal` é uma transformação de ENTREGA: o Cloudinary recorta
// a imagem na primeira vez que a URL é pedida e guarda o resultado em cache.
// Duas coisas podem dar errado, e as duas são tratadas no painel (admin.js):
//   • 423 — ainda está processando (acontece só na primeira requisição);
//   • 403 — a conta não tem cota/plano para essa transformação.
// Por isso o painel testa a URL recortada antes de gravá-la no banco.
const RECORTE = "e_background_removal";

/** É uma URL de entrega do Cloudinary? */
export function ehUrlCloudinary(url) {
  return typeof url === "string" && url.includes("/upload/");
}

/** A URL já pede o recorte de fundo? */
export function temFundoRemovido(url) {
  return typeof url === "string" && url.includes(`/${RECORTE}/`);
}

/**
 * Quebra a URL em: tudo até `/upload/`, as transformações que já estão lá e o
 * public_id (com a versão `v123`, se houver).
 *
 * Reconstruir a URL do zero — em vez de ir costurando `replace()` em cima do
 * que já existe — é o que deixa estas funções idempotentes: aplicar duas vezes
 * dá o mesmo resultado, e trocar a largura não empilha transformação nova.
 */
function separar(url) {
  const marca = "/upload/";
  const i = url.indexOf(marca);
  if (i === -1) return null;

  const base = url.slice(0, i + marca.length);
  const segmentos = url.slice(i + marca.length).split("/");

  // Componentes de transformação vêm antes da versão/public_id e sempre
  // começam com um parâmetro conhecido (e_, f_, q_, c_, w_, h_).
  const transformacoes = [];
  while (segmentos.length > 1 && /^(e_|f_|q_|c_|w_|h_)/.test(segmentos[0])) {
    transformacoes.push(segmentos.shift());
  }

  return { base, transformacoes, publicId: segmentos.join("/") };
}

function montar(url, { recorte, largura }) {
  const partes = separar(url);
  if (!partes) return url;

  const etapas = [];
  // O recorte vem numa etapa própria e ANTES do redimensionamento: recortar
  // no tamanho original e só então encolher preserva melhor as bordas.
  if (recorte) etapas.push(RECORTE);
  etapas.push(`f_auto,q_auto,c_limit,w_${largura}`);

  return partes.base + etapas.join("/") + "/" + partes.publicId;
}

/**
 * URL otimizada (formato e compressão automáticos, largura limitada).
 * Se a URL já pedia o recorte de fundo, o recorte é preservado.
 */
export function otimizarUrl(url, largura = LARGURA_MAXIMA) {
  if (!ehUrlCloudinary(url)) return url;
  return montar(url, { recorte: temFundoRemovido(url), largura });
}

/** Mesma coisa, mas forçando o recorte de fundo. */
export function urlSemFundo(url, largura = LARGURA_MAXIMA) {
  if (!ehUrlCloudinary(url)) return url;
  return montar(url, { recorte: true, largura });
}

/** Versão miniatura (previews do admin e lista de produtos). */
export function miniaturaUrl(url, largura = 300) {
  return otimizarUrl(url, largura);
}
