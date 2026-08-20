/* =========================================================================
   THUNDER CELL — gerar-importacao-firebase.js

   Converte o catálogo antigo (data/produtos.json) para o formato novo do
   Realtime Database e grava em data/importar-no-firebase.json.

   Esse arquivo é feito para ser carregado no Console do Firebase:
     Realtime Database > (menu ⋮ ao lado do nó raiz) > Importar JSON

   É um passo de mão única, para não começar com o catálogo vazio. Depois
   disso, quem manda no estoque é o painel admin — este script não precisa
   rodar de novo.

   Uso:  node scripts/gerar-importacao-firebase.js
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const ENTRADA = path.join(ROOT, 'data', 'produtos.json');
const SAIDA = path.join(ROOT, 'data', 'importar-no-firebase.json');

async function principal() {
    const { normalizarProduto, categoriaDoStatus } = await import(
        pathToFileURL(path.join(ROOT, 'assets', 'js', 'produtos-utils.js')).href
    );

    const antigos = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));

    // O Realtime Database guarda os produtos como um objeto, não como lista.
    // Usamos chaves legíveis derivadas do id antigo; o painel cria as novas
    // com push(), então não há risco de colisão depois.
    const produtos = {};
    let ordem = antigos.length;

    for (const antigo of antigos) {
        const p = normalizarProduto(antigo.id, antigo);
        if (!p) continue;

        produtos[`legado-${antigo.id}`] = {
            modelo: p.modelo,
            capacidade: p.capacidade,
            preco: p.preco,
            parcelamento: p.parcelamento,
            // O catálogo antigo não registrava bateria nem condição: fica em
            // branco para a loja preencher ao revisar cada aparelho.
            bateria: null,
            condicao: '',
            status: p.status,
            // Define em qual seção do site o aparelho entra.
            categoria: categoriaDoStatus(p.status),
            destaque: false,
            ativo: p.ativo,
            fotos: p.fotos,
            descricao: p.descricao,
            observacoes: 'Importado do catálogo antigo — conferir bateria e condição.',
            // `criadoEm` define a ordem no site; preserva a ordem do arquivo.
            criadoEm: ordem--,
            atualizadoEm: 0,
        };
    }

    fs.writeFileSync(SAIDA, JSON.stringify({ produtos }, null, 2), 'utf8');

    console.log(`✓ ${Object.keys(produtos).length} produto(s) convertidos.`);
    console.log(`  Arquivo: data/importar-no-firebase.json`);
    console.log(`  Importe em: Console do Firebase > Realtime Database > ⋮ > Importar JSON`);
}

principal().catch((erro) => {
    console.error('Erro ao gerar a importação:', erro);
    process.exit(1);
});
