// ============================================================================
// firebase-config.js — Thunder Cell
// ----------------------------------------------------------------------------
// Configuração do Firebase Realtime Database (catálogo de produtos) e do
// Firebase Authentication (login do painel admin).
//
// >>> ATENÇÃO: este é um projeto Firebase NOVO, EXCLUSIVO da Thunder Cell.
//     NÃO reaproveite o projeto do site de leilão (Thunder Diecast). <<<
//
// Projeto: thundercell-49af1 (já configurado — veja o README, seção 2).
// Para trocar de projeto: Console do Firebase > Configurações do projeto >
// Geral > Seus apps > SDK, e cole o bloco novo abaixo.
//
// Estas chaves NÃO são segredo: qualquer site que usa Firebase as expõe no
// navegador, e o arquivo PRECISA ir para o repositório — o site é estático e
// a Netlify publica exatamente o que está versionado. Quem realmente protege
// os dados são as REGRAS do Realtime Database (leitura pública dos produtos,
// escrita só para quem está logado) — o texto das regras está no README.md,
// seção 4. Sem publicar aquelas regras, qualquer pessoa pode escrever no seu
// banco, por mais "escondido" que este arquivo esteja.
// ============================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyBuySQVAEu2zg6LX853diSsj3UJtU_3aA8",
  authDomain: "thundercell-49af1.firebaseapp.com",
  databaseURL: "https://thundercell-49af1-default-rtdb.firebaseio.com",
  projectId: "thundercell-49af1",
  storageBucket: "thundercell-49af1.firebasestorage.app",
  messagingSenderId: "883352344860",
  appId: "1:883352344860:web:ab1bb290f43db32df442d9",
};

// Caminhos (nós) usados dentro do Realtime Database. Não precisa mexer aqui.
export const DB_PATHS = {
  produtos: "produtos",
  // Fotos do banner da página inicial (array de URLs do Cloudinary).
  heroFotos: "config/heroFotos",
  // Fotos da seção "Acompanhe no Instagram" (mesma ideia, outra lista).
  instagram: "config/instagram",
};

/**
 * Diz se o firebaseConfig acima já foi realmente preenchido.
 * O site público usa isso para não tentar conectar (e cair direto no catálogo
 * estático de fallback); o painel admin usa para mostrar o aviso de setup.
 */
export function firebaseConfigurado() {
  const valores = [firebaseConfig.apiKey, firebaseConfig.databaseURL, firebaseConfig.projectId];
  return valores.every((v) => typeof v === "string" && v.trim() !== "" && !v.includes("COLE_AQUI"));
}
