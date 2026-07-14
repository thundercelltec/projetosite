/* =========================================================
   THUNDER CELL — build-catalog.js
   Pré-renderiza o catálogo no index.html a partir do
   data/produtos.json, para que o Google e os previews de
   link enxerguem os produtos sem depender de JavaScript.

   O script injeta três blocos, sempre entre marcadores
   (por isso pode ser executado quantas vezes for preciso):

   1. Cards de produto  → <!-- BUILD:PRODUCTS-START/END -->
   2. JSON-LD (Product) → <!-- BUILD:JSONLD-START/END -->
   3. Dados p/ o main.js → <!-- BUILD:DATA-START/END -->

   Uso:  node scripts/build-catalog.js
   (o netlify.toml roda este comando em todo deploy)
   ========================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PRODUTOS_PATH = path.join(ROOT, 'data', 'produtos.json');
const INDEX_PATH = path.join(ROOT, 'index.html');

const SITE_URL = 'https://thundercell.netlify.app';
const WHATSAPP_NUMBER = '5549998404821';

// Mesmas taxas do main.js: usadas para exibir a estimativa de 12x no card
const INSTALLMENT_RATE_12X = 13.67;

// Mesmos selos suportados pelo main.js (campo "selo" do produtos.json)
const BADGE_CLASSES = {
    'Novo': 'badge-novo',
    'Seminovo': 'badge-seminovo',
    'Oferta': 'badge-oferta',
    'Promoção': 'badge-promocao'
};

/* ---------- Utilitários ---------- */

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Mesma mensagem do whatsappLink() do main.js — manter em sincronia
function whatsappLink(productName) {
    const message = `Olá! Tenho interesse no ${productName}. Ele está disponível?`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// Substitui o conteúdo entre um par de marcadores, preservando os marcadores
function injectBetween(html, startMarker, endMarker, content) {
    const start = html.indexOf(startMarker);
    const end = html.indexOf(endMarker);
    if (start === -1 || end === -1 || end < start) {
        throw new Error(`Marcadores não encontrados no index.html: ${startMarker} / ${endMarker}`);
    }
    return html.slice(0, start + startMarker.length) + '\n' + content + '\n                    ' + html.slice(end);
}

/* ---------- Geração dos cards (espelho do createProductCard do main.js) ---------- */

function createProductCard(product, index) {
    const badge = product.selo
        ? `<span class="product-badge ${BADGE_CLASSES[product.selo] || 'badge-novo'}">${escapeHtml(product.selo)}</span>`
        : '';

    const parcela12 = (product.preco * (1 + INSTALLMENT_RATE_12X / 100)) / 12;
    const delay = Math.min(index * 80, 480);
    const nome = escapeHtml(product.nome);

    return `
        <article class="product-card" style="--delay: ${delay}ms" data-id="${product.id}" data-nome="${escapeHtml(product.nome.toLowerCase())}" data-categoria="${escapeHtml(product.categoria)}">
            <div class="product-image">
                ${badge}
                <img src="${product.imagens[0]}" alt="${nome}" loading="lazy" />
            </div>
            <div class="product-body">
                <div class="product-meta">
                    <span class="product-brand">${escapeHtml(product.marca)}</span>
                    <span class="product-category">${escapeHtml(product.categoria)}</span>
                </div>
                <h3>${nome}</h3>
                <p class="product-specs">${product.especificacoes.map(escapeHtml).join(' • ')}</p>
                <div class="product-price-box">
                    <p class="product-price">${formatCurrency(product.preco)}</p>
                    <p class="product-installment">ou 12x de ${formatCurrency(parcela12)} no cartão</p>
                </div>
                <div class="product-actions">
                    <button class="btn btn-small btn-outline btn-block open-modal" type="button" data-id="${product.id}">
                        <i class="fa-regular fa-eye"></i> Ver Detalhes
                    </button>
                    <a class="btn btn-small btn-whatsapp btn-block" href="${whatsappLink(product.nome)}" target="_blank" rel="noopener noreferrer">
                        <i class="fa-brands fa-whatsapp"></i> Comprar pelo WhatsApp
                    </a>
                </div>
            </div>
        </article>`;
}

/* ---------- JSON-LD de Product (SEO) ---------- */

function buildProductsJsonLd(produtos) {
    const itens = produtos.map((p) => ({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.nome,
        brand: { '@type': 'Brand', name: p.marca },
        description: p.descricao,
        image: p.imagens.map((img) => `${SITE_URL}/${img}`),
        offers: {
            '@type': 'Offer',
            price: p.preco.toFixed(2),
            priceCurrency: 'BRL',
            availability: 'https://schema.org/InStock',
            url: `${SITE_URL}/#catalogo`,
            seller: { '@type': 'Organization', name: 'Thunder Cell' }
        }
    }));
    return `<script type="application/ld+json">\n    ${JSON.stringify(itens, null, 4).replace(/\n/g, '\n    ')}\n    </script>`;
}

/* ---------- Execução ---------- */

function main() {
    const produtos = JSON.parse(fs.readFileSync(PRODUTOS_PATH, 'utf8'));
    let html = fs.readFileSync(INDEX_PATH, 'utf8');

    // 1. Cards pré-renderizados no grid do catálogo
    const cardsHtml = produtos.map(createProductCard).join('\n');
    html = injectBetween(html, '<!-- BUILD:PRODUCTS-START -->', '<!-- BUILD:PRODUCTS-END -->', cardsHtml);

    // 2. JSON-LD de Product no <head>
    html = injectBetween(html, '<!-- BUILD:JSONLD-START -->', '<!-- BUILD:JSONLD-END -->', '    ' + buildProductsJsonLd(produtos));

    // 3. Dados inline para o main.js (modal/filtros funcionam sem fetch).
    //    "</" é escapado para o JSON nunca fechar a tag <script> por acidente.
    const dataJson = JSON.stringify(produtos).replace(/<\//g, '<\\/');
    const dataTag = `    <script type="application/json" id="productsData">${dataJson}</script>`;
    html = injectBetween(html, '<!-- BUILD:DATA-START -->', '<!-- BUILD:DATA-END -->', dataTag);

    fs.writeFileSync(INDEX_PATH, html, 'utf8');
    console.log(`OK: ${produtos.length} produtos pré-renderizados no index.html (cards + JSON-LD + dados inline).`);
}

main();
