/* =========================================================================
   THUNDER CELL — build-catalog.js
   Roda no deploy (netlify.toml) e pré-renderiza o catálogo dentro do
   index.html, para que o Google e os previews de link enxerguem os produtos
   sem depender de JavaScript.

   De onde vêm os dados, nesta ordem:
     1. Firebase Realtime Database, via REST (`/produtos.json`). É a mesma
        fonte que o site lê no navegador — a leitura é pública pelas regras.
     2. `data/produtos.json`, o catálogo estático versionado no repositório.
        Usado quando o Firebase ainda não foi configurado ou não respondeu.

   Como o site também busca os dados ao vivo no navegador, um deploy antigo
   nunca mostra preço velho para o visitante: o HTML pré-renderizado é só a
   primeira pintura e a rede de segurança.

   O script injeta três blocos, sempre entre marcadores (por isso pode rodar
   quantas vezes for preciso, sem duplicar nada):

     1. Cards de produto   → <!-- BUILD:PRODUCTS-START/END -->
     2. JSON-LD (Product)  → <!-- BUILD:JSONLD-START/END -->
     3. Dados p/ o main.js → <!-- BUILD:DATA-START/END -->

   Uso:  node scripts/build-catalog.js
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const PRODUTOS_PATH = path.join(ROOT, 'data', 'produtos.json');
const INDEX_PATH = path.join(ROOT, 'index.html');

const SITE_URL = 'https://thundercell.netlify.app';

// Tempo máximo esperando o Firebase antes de cair no catálogo local. Um build
// não pode ficar pendurado por causa de uma requisição lenta.
const TIMEOUT_MS = 10000;

/* ---------- Utilitários ---------- */

// Os módulos do site são ESM e ficam em assets/js. Importar por file:// URL é
// o que faz isso funcionar tanto no Windows quanto no Linux do Netlify.
function importarModulo(nomeArquivo) {
    return import(pathToFileURL(path.join(JS_DIR, nomeArquivo)).href);
}

function lerCatalogoLocal() {
    try {
        return JSON.parse(fs.readFileSync(PRODUTOS_PATH, 'utf8'));
    } catch (erro) {
        console.warn(`  ! Não foi possível ler data/produtos.json: ${erro.message}`);
        return [];
    }
}

/**
 * Lê o catálogo do Firebase.
 * @returns os dados, `"sem-config"` se o Firebase nem foi configurado ainda,
 *          ou `"indisponivel"` se ele está configurado mas não respondeu.
 */
async function lerCatalogoDoFirebase(firebaseConfig, firebaseConfigurado) {
    if (!firebaseConfigurado()) return 'sem-config';

    const url = `${firebaseConfig.databaseURL.replace(/\/$/, '')}/produtos.json`;

    try {
        const resposta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

        const dados = await resposta.json();
        if (!dados) {
            console.log('  · Firebase respondeu, mas o catálogo está vazio.');
            return {};
        }
        return dados;
    } catch (erro) {
        console.warn(`  ! Firebase indisponível (${erro.message}).`);
        return 'indisponivel';
    }
}

/**
 * Substitui o conteúdo entre <!-- BUILD:NOME-START --> e <!-- BUILD:NOME-END -->.
 * Se os marcadores não existirem, avisa e devolve o HTML intacto — melhor um
 * bloco desatualizado do que um index.html corrompido no deploy.
 */
function injetar(html, nome, conteudo) {
    const inicio = `<!-- BUILD:${nome}-START -->`;
    const fim = `<!-- BUILD:${nome}-END -->`;
    const padrao = new RegExp(`${inicio}[\\s\\S]*?${fim}`);

    if (!padrao.test(html)) {
        console.warn(`  ! Marcadores BUILD:${nome} não encontrados no index.html.`);
        return html;
    }
    return html.replace(padrao, `${inicio}\n${conteudo}\n${fim}`);
}

/* ---------- Blocos gerados ---------- */

function jsonLdDosProdutos(produtos, garantiaDoStatus) {
    if (produtos.length === 0) return '';

    const itens = produtos.map((p) => ({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.titulo,
        description:
            p.descricao ||
            `${p.titulo} ${p.status.toLowerCase()}, testado, com IMEI verificado e ${garantiaDoStatus(p.status).texto} de garantia na Thunder Cell.`,
        // O Cloudinary já devolve URL absoluta; as fotos locais precisam de prefixo.
        image: p.fotos.map((url) => (url.startsWith('http') ? url : `${SITE_URL}/${url.replace(/^\//, '')}`)),
        offers: {
            '@type': 'Offer',
            price: p.preco.toFixed(2),
            priceCurrency: 'BRL',
            availability: 'https://schema.org/InStock',
            itemCondition:
                p.status === 'Novo'
                    ? 'https://schema.org/NewCondition'
                    : 'https://schema.org/UsedCondition',
            url: `${SITE_URL}/#catalogo`,
            seller: { '@type': 'Store', name: 'Thunder Cell' },
        },
    }));

    return `    <script type="application/ld+json">\n${JSON.stringify(itens, null, 4)}\n    </script>`;
}

/**
 * Cópia enxuta do catálogo embutida no HTML. Guarda só o que o site público
 * usa — `observacoes` é interno e nunca sai daqui.
 */
function dadosDeReserva(produtos) {
    const enxuto = produtos.map((p) => ({
        id: p.id,
        modelo: p.modelo,
        capacidade: p.capacidade,
        preco: p.preco,
        parcelamento: p.parcelamento,
        bateria: p.bateria,
        condicao: p.condicao,
        status: p.status,
        destaque: p.destaque,
        ativo: true,
        fotos: p.fotos,
        descricao: p.descricao,
        criadoEm: p.criadoEm,
    }));

    return `<script type="application/json" id="produtosFallback">${JSON.stringify(enxuto)}</script>`;
}

/* ---------- Execução ---------- */

async function principal() {
    console.log('Thunder Cell — pré-renderizando o catálogo…');

    const [{ firebaseConfig, firebaseConfigurado }, { listarProdutos }, { catalogoHtml }, { garantiaDoStatus }] =
        await Promise.all([
            importarModulo('firebase-config.js'),
            importarModulo('produtos-utils.js'),
            importarModulo('produto-card.js'),
            importarModulo('site-config.js'),
        ]);

    const doFirebase = await lerCatalogoDoFirebase(firebaseConfig, firebaseConfigurado);

    // O Firebase é a fonte da verdade do estoque. Se ele está configurado mas
    // não respondeu, publicar o data/produtos.json seria pior do que não fazer
    // nada: colocaria no ar aparelhos que talvez já tenham sido vendidos. Nesse
    // caso preservamos o que já estava pré-renderizado (último catálogo bom) e
    // deixamos o deploy seguir — o navegador busca o estoque ao vivo de todo
    // jeito, então o visitante continua vendo o catálogo correto.
    if (doFirebase === 'indisponivel') {
        console.warn('  ! Catálogo do index.html mantido como estava — nada foi sobrescrito.');
        console.warn('    (o site continua lendo o estoque ao vivo no navegador)');
        return;
    }

    const semConfig = doFirebase === 'sem-config';
    if (semConfig) {
        console.log('  · Firebase ainda não configurado — usando data/produtos.json.');
    }

    const origem = semConfig ? 'data/produtos.json' : 'Firebase';
    const brutos = semConfig ? lerCatalogoLocal() : doFirebase;

    // `listarProdutos` já descarta os inativos e ordena (destaques primeiro).
    const produtos = listarProdutos(brutos);
    console.log(`  · ${produtos.length} produto(s) ativo(s) — origem: ${origem}`);

    let html = fs.readFileSync(INDEX_PATH, 'utf8');

    // `catalogoHtml` já separa em "Aparelhos novos" e "Aparelhos seminovos" —
    // o mesmo agrupamento que o navegador desenha depois.
    const cards =
        produtos.length > 0
            ? catalogoHtml(produtos)
            : `<div class="empty-state">
    <svg class="icon" aria-hidden="true"><use href="#i-box"></use></svg>
    <h3>Estoque em atualização</h3>
    <p>Estamos cadastrando os aparelhos disponíveis. Chame no WhatsApp que a gente te conta o que tem em loja.</p>
  </div>`;

    html = injetar(html, 'PRODUCTS', cards);
    html = injetar(html, 'JSONLD', jsonLdDosProdutos(produtos, garantiaDoStatus));
    html = injetar(html, 'DATA', dadosDeReserva(produtos));

    fs.writeFileSync(INDEX_PATH, html, 'utf8');
    console.log('  ✓ index.html atualizado.');
}

principal().catch((erro) => {
    // Falhar o build é melhor do que publicar um index.html quebrado.
    console.error('Erro ao gerar o catálogo:', erro);
    process.exit(1);
});
