# Thunder Cell — catálogo + painel administrativo

Site estático (HTML/CSS/JS puro, sem framework) publicado na Netlify, com
catálogo de aparelhos alimentado por um painel administrativo que a loja usa
pelo celular. Os produtos ficam no **Firebase Realtime Database** e as fotos
no **Cloudinary** — os dois no plano gratuito, sem servidor próprio.

Cadastrou no painel → aparece no site na hora, sem redeploy.

---

## Sumário

1. [Arquivos](#1-arquivos)
2. [Criar o projeto Firebase](#2-criar-o-projeto-firebase)
3. [Criar a conta Cloudinary](#3-criar-a-conta-cloudinary)
3.1. [Fotos sem fundo](#31-fotos-sem-fundo)
4. [Regras de segurança do banco](#4-regras-de-segurança-do-banco)
5. [Importar o catálogo antigo](#5-importar-o-catálogo-antigo-uma-vez-só)
6. [Ajustar os dados da loja](#6-ajustar-os-dados-da-loja)
7. [Rodar localmente](#7-rodar-localmente)
8. [Publicar na Netlify](#8-publicar-na-netlify)
9. [Usando o painel](#9-usando-o-painel)
10. [Como o catálogo chega na tela](#10-como-o-catálogo-chega-na-tela)
11. [Problemas comuns](#11-problemas-comuns)

---

## 1. Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Página pública (hero, catálogo, garantia, sobre, assistência, rodapé) |
| `garantia.html` | Política de garantia e trocas |
| `admin.html` | Painel administrativo, servido em `/admin` (login + cadastro) |
| `assets/css/style.css` | Design system do site (cores, cards, botões, seções) |
| `assets/css/admin.css` | Só o que é específico do painel |
| `assets/js/main.js` | Catálogo público: carrega do Firebase, filtra, abre o modal |
| `assets/js/admin.js` | Painel: login, lista, formulário, upload, exclusão |
| `assets/js/produtos-utils.js` | Formato canônico do produto (usado pelos três) |
| `assets/js/produto-card.js` | HTML de um card — compartilhado entre navegador e build |
| **`assets/js/firebase-config.js`** | **Chaves do Firebase — preencher** |
| **`assets/js/image-config.js`** | **Cloud name + upload preset do Cloudinary — preencher** |
| **`assets/js/site-config.js`** | **Telefone, endereços, horários, prazo de garantia** |
| `scripts/build-catalog.js` | Pré-renderiza o catálogo no deploy (SEO) |
| `scripts/gerar-importacao-firebase.js` | Converte o catálogo antigo para o formato novo |
| `data/produtos.json` | Catálogo antigo. **Não alimenta mais o site** — serve só de material para a importação inicial (seção 5) |

> **O estoque vem do Firebase, ponto.** O `data/produtos.json` só entra em cena
> se o Firebase ainda não estiver configurado. Com ele configurado (é o caso
> hoje), o site e o build leem exclusivamente do banco.

> As chaves do Firebase e o upload preset do Cloudinary **não são segredo** —
> qualquer site que usa esses serviços as expõe no navegador. Quem protege os
> dados são as regras do banco (seção 4).

---

## 2. Criar o projeto Firebase

✅ **Já configurado.** O projeto `thundercell-49af1` está preenchido em
`assets/js/firebase-config.js`. Este projeto é exclusivo da Thunder Cell,
separado do site de leilão (Thunder Diecast).

Falta um passo no Console (não dá para fazer pelo código):

1. **Criar o login do painel.** Console do Firebase → **Authentication** →
   **Vamos começar** → aba **Sign-in method** → ative **E-mail/senha**.
   Depois, aba **Users** → **Adicionar usuário** com o e-mail e a senha da loja.
   Sem isso, ninguém entra no `/admin`.
2. ✅ **Regras do banco** — já publicadas, incluindo o nó `config`. Nada a fazer;
   o texto está na seção 4 para referência.

> **Por que estas chaves estão no repositório?** Porque o site é estático: a
> Netlify publica exatamente o que está versionado, e o navegador precisa delas
> para se conectar. Chaves de cliente do Firebase são públicas por natureza —
> todo site que usa Firebase as expõe. Elas não dão acesso a nada sozinhas;
> quem controla o acesso são as regras da seção 4 e o login do Authentication.

---

## 3. Criar a conta Cloudinary

✅ **Já configurado.** Cloud name `ecryyjxy` e upload preset `thundercell`
estão em `assets/js/image-config.js`. Conta exclusiva da Thunder Cell.

Confira uma coisa no painel do Cloudinary (**Settings → Upload → Upload
presets → `thundercell`**):

- **Signing Mode** precisa estar em **`Unsigned`**. Se estiver `Signed`, o
  upload pelo painel falha com erro 401.
- **Folder**: `thundercell-produtos` (opcional, só organiza).

As fotos são salvas já com `f_auto,q_auto,c_limit,w_1200`: o Cloudinary entrega
WebP/AVIF comprimido e redimensionado, então o site fica leve mesmo com foto
tirada direto do celular.

### 3.1. Fotos sem fundo

O painel tenta recortar o fundo de toda foto nova automaticamente, deixando só
o aparelho — é a transformação `e_background_removal` do Cloudinary.

**Isso depende da sua conta ter essa transformação liberada.** Ela é cobrada
como transformação (não é mais um add-on separado) e contas criadas depois de
**1º de fevereiro de 2026** não conseguem assinar o add-on antigo. Confira em
**Settings → Add-ons** / no seu plano se o recurso está disponível.

Como o painel lida com isso — você não precisa fazer nada:

| Situação | O que acontece |
|---|---|
| Conta com o recurso liberado | A URL recortada é testada no upload e gravada no banco |
| Cloudinary ainda processando (HTTP 423) | O painel espera e tenta de novo (até 4 vezes) |
| Conta sem cota/plano (HTTP 403) | Grava a foto **original** e mostra o aviso "Recorte de fundo indisponível" |

Testar no upload tem dois motivos: o visitante nunca pega uma imagem a meio
processar, e uma conta sem o recurso **não** deixa o catálogo inteiro com foto
quebrada.

Para desligar o recorte, mude `removerFundo` para `false` em
`assets/js/image-config.js`. Fotos já cadastradas continuam como estão — para
recortá-las, reenvie a foto pelo painel.

> **Dica:** mesmo com o recorte automático, foto tirada sobre uma superfície
> lisa e bem iluminada gera um recorte bem melhor.

---

## 4. Regras de segurança do banco

> ✅ **Já publicadas.** Conferido no banco: a raiz responde 401 (fechada),
> `produtos` e `config/heroFotos` respondem 200 (leitura pública). Está do
> jeito certo. O texto abaixo fica de referência, para o caso de precisar
> republicar.

No Console do Firebase: **Realtime Database** → aba **Regras** → cole isto e
clique em **Publicar**.

```json
{
  "rules": {
    "produtos": {
      ".read": true,
      ".write": "auth != null"
    },
    "config": {
      ".read": true,
      ".write": "auth != null"
    },
    ".read": false,
    ".write": false
  }
}
```

O que isso faz:

- **Leitura pública** de `produtos` e `config` — é assim que o site (e o script
  de build) monta o catálogo e o banner sem ninguém precisar logar.
- **Escrita só para quem está autenticado** — sem login do Firebase, qualquer
  tentativa de gravar é recusada pelo servidor. O login do painel controla só a
  interface; a barreira de verdade é esta regra.
- **Raiz fechada** (`".read": false` / `".write": false`) — nada além de
  `produtos` e `config` fica exposto, hoje ou no futuro.

### Versão opcional, mais rígida

As regras acima já garantem o essencial. Se quiser que o Firebase também
recuse dados malformados (útil como rede de segurança contra um bug no
painel), use esta versão no lugar:

```json
{
  "rules": {
    "produtos": {
      ".read": true,
      ".write": "auth != null",
      "$produtoId": {
        ".validate": "newData.hasChildren(['modelo','preco','fotos'])",
        "modelo":    { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 120" },
        "preco":     { ".validate": "newData.isNumber() && newData.val() > 0" },
        "ativo":     { ".validate": "newData.isBoolean()" },
        "destaque":  { ".validate": "newData.isBoolean()" },
        "bateria":   { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100" },
        "condicao":  { ".validate": "newData.val() == '' || newData.val() == 'Boa' || newData.val() == 'Muito boa' || newData.val() == 'Excelente'" },
        "status":    { ".validate": "newData.val() == 'Seminovo' || newData.val() == 'Novo'" },
        "categoria": { ".validate": "newData.val() == 'novo' || newData.val() == 'usado'" },
        "fotos":     { ".validate": "newData.hasChildren()" }
      }
    },
    "config": {
      ".read": true,
      ".write": "auth != null"
    },
    ".read": false,
    ".write": false
  }
}
```

### Duas ressalvas honestas sobre a leitura pública

`".read": true` em `produtos` libera o nó inteiro. Isso significa que:

- **Produtos inativos também são legíveis** por quem consultar a API direto.
  O site esconde os inativos, mas eles não são secretos. O Realtime Database
  não consegue filtrar por campo na leitura de uma lista — para esconder de
  verdade, seria preciso separar em outro nó (`rascunhos/`), o que não vale a
  complexidade aqui.
- **`observacoes` fica acessível** pelo mesmo motivo. O campo não aparece em
  lugar nenhum do site (o `produtos-utils.js` nem o carrega para o objeto
  público), mas **não escreva ali nada sigiloso** — use para anotações
  operacionais, tipo "comprado do cliente X por Y".

---

## 5. Importar o catálogo antigo (uma vez só)

> ℹ️ **Hoje o banco está vazio** — o site mostra "Estoque em atualização" até
> existir algum produto. Você tem duas opções: importar o catálogo antigo
> (abaixo) ou cadastrar os aparelhos direto no `/admin`. Se o plano é começar
> só com o estoque atual da loja, pode pular esta seção inteira.

Para não começar com a loja vazia:

```bash
node scripts/gerar-importacao-firebase.js
```

Isso gera `data/importar-no-firebase.json`. No Console do Firebase:
**Realtime Database** → menu **⋮** ao lado do nó raiz → **Importar JSON** →
escolha o arquivo.

Depois disso, revise cada produto no painel para preencher **bateria** e
**condição** (o catálogo antigo não tinha esses campos).

---

## 6. Ajustar os dados da loja

Tudo o que muda com o tempo está em **`assets/js/site-config.js`**: telefone do
WhatsApp, prazos de garantia, texto padrão de parcelamento, endereços das duas
unidades, horários, Instagram e CNPJ. Alterou lá → o header, o botão flutuante,
a seção de garantia, o modal do produto, a política e o rodapé se atualizam
sozinhos.

**Prazos de garantia** ficam em `siteConfig.garantia` e são diferentes por tipo
de aparelho:

```js
garantia: {
  Novo:     { texto: "1 ano",   detalhe: "contra defeitos de fabricação" },
  Seminovo: { texto: "90 dias", detalhe: "sobre o funcionamento do aparelho" },
},
```

Todo lugar do site que cita um prazo lê daqui (o HTML usa
`data-garantia="Novo"` / `data-garantia="Seminovo"`), então mudar a política é
editar essas duas linhas.

### Paleta de cores

Fica no topo de `assets/css/style.css`, em `:root`. Trocar ali muda o site e o
painel de uma vez.

| Token | Cor | Onde aparece |
|---|---|---|
| `--brand` | `#184878` | Azul da logo: cabeçalho, botões, links, ícones, abas |
| `--brand-dark` | `#0F3C62` | Hover dos botões azuis |
| `--ouro` | `#D4AF37` | Dourado cheio: selo DESTAQUE (com texto escuro) |
| `--ouro-ink` | `#806215` | Dourado como **texto**: preços, selos, badges |
| `--muted` | `#4A4A4A` | Texto de apoio |
| `--bg` | `#F0F1F3` | Fundo cinza claro das seções |
| `--esgotado` | `#B3261E` | Faixa e avisos de produto esgotado |
| `--sombra-logo` | duas `drop-shadow` | Contorno escuro da logo (ela é prateada e sumia no fundo claro) |
| `--whatsapp` | `#25D366` | Verde oficial do WhatsApp, preservado |

Três armadilhas que já estão resolvidas — cuidado ao mexer:

- **`--ouro` e `--ouro-ink` não são intercambiáveis.** O dourado vivo tem só
  2:1 de contraste sobre branco; como texto ele reprova em AA. Por isso preço
  e selos usam `--ouro-ink` (5,06:1) e o `--ouro` fica só em preenchimento.
- **Texto branco sobre o verde do WhatsApp reprova** (1,98:1). Os botões usam
  `--whatsapp-ink` (verde-escuro, 6,31:1) sobre o verde vivo — assim a cor
  reconhecível é mantida e o texto fica legível.
- **O azul foi extraído da logo**, não escolhido de olho: `#184878` é um dos
  tons realmente presentes em `assets/img/logo.png`.

O favicon já é a logo azul, então não precisou mudar. O `theme-color` das
páginas públicas passou a ser o azul da marca.

---

## 7. Rodar localmente

O site usa módulos ES (`import`), que **não funcionam abrindo o arquivo com
duplo clique** (o navegador bloqueia por CORS). Suba um servidor local:

```bash
npx serve .
# ou
python -m http.server 8000
```

Depois abra <http://localhost:8000> (site) e
<http://localhost:8000/admin.html> (painel).

Para regenerar o HTML pré-renderizado:

```bash
node scripts/build-catalog.js
```

---

## 8. Publicar na Netlify

O `netlify.toml` já está pronto: build `node scripts/build-catalog.js`,
publish `.`. Basta conectar o repositório — cada `git push` gera um deploy.

Lembre-se: **cadastrar produto não precisa de deploy.** O deploy só atualiza o
HTML pré-renderizado (SEO) e o código.

---

## 9. Usando o painel

Endereço: `https://thundercell.netlify.app/admin`

- **Entrar** com o e-mail/senha criados no passo 2.4.
- **+ Novo produto** abre o formulário. Obrigatórios: **modelo**, **preço** e
  **ao menos uma foto**.
- **Fotos:** toque na área tracejada para escolher da galeria ou tirar na hora
  (ou arraste os arquivos, no computador). A **primeira foto é a capa** do card;
  use as setas `‹ ›` para reordenar e a lixeira para remover antes de salvar.
- **Status** decide em qual seção do site o produto entra: *Novo* vai para
  "Aparelhos novos", *Seminovo* para "Aparelhos seminovos". O selo do card e o
  prazo de garantia mostrado seguem esse campo.
- **Em estoque:** desligue quando o aparelho acabar. Ele **continua no site**,
  mas com faixa **ESGOTADO** sobre a foto, aviso "Retorna em breve", opacidade
  reduzida e o botão trocado por "Avise-me quando chegar" (mesmo WhatsApp, com
  outra mensagem já escrita). Esgotados também vão para o fim da sua seção.
  Quando voltar, é só religar — a loja decide a hora.
- **Destaque:** joga o produto para o topo do seu grupo, com selo dourado sólido.
- **Quantos aparecem no site:** cada seção mostra os primeiros — **3** em
  "Aparelhos novos" e **2** em "Aparelhos seminovos" — e o resto fica atrás de
  um botão "Ver mais". Os limites estão em `GRUPOS`, no
  `assets/js/produto-card.js`. Nada some: quem tem mais produtos ganha o botão
  automaticamente, quem tem menos que o limite nem mostra o botão.
- **Ativo:** desligado, o produto some do site mas continua no painel.
- Na lista, **Ativo** e **Destaque** também podem ser ligados/desligados com um
  toque, sem abrir o formulário.
- **Observações internas** nunca aparecem no site (leia a ressalva na seção 4).

Dica: salve o painel na tela inicial do celular (menu do navegador → "Adicionar
à tela de início") para abrir como se fosse um app.

### Banner inicial

A aba **Banner inicial** controla as três fotos do topo da página inicial.

- Toque num quadro vazio para enviar a foto (galeria ou câmera).
- As setas `‹ ›` reordenam; a lixeira remove.
- A **prévia** logo abaixo mostra exatamente como as fotos vão aparecer no site.
- **Salvar banner** grava em `config/heroFotos` e o site atualiza na hora.
  **Desfazer** volta para a última versão salva.
- Com zero fotos, o topo do site mostra um espaço discreto — nunca imagem
  quebrada.

> Precisa das regras com o nó `config` liberado (seção 4). Sem isso, salvar
> retorna "Sem permissão para salvar o banner".

### Instagram

A aba **Instagram** controla as fotos da seção "Acompanhe a loja no Instagram"
(até 8). Funciona igual ao Banner: toque num quadro, envie, reordene, salve.
Grava em `config/instagram`.

**Por que não é automático?** O Instagram não oferece feed gratuito para site
estático — a API oficial exige um app e um token do Facebook, que expiram e
precisam de manutenção. Widgets de terceiros resolveriam, mas colocariam um
script externo no site (mais lento e fora do seu controle). Escolher as fotos
aqui leva menos de um minuto, não quebra nunca e você decide o que aparece.

Fluxo sugerido: publique no Instagram, salve a imagem, envie aqui. Ao tocar
numa foto, o visitante vai para o perfil **@thundercelltec**.

Sem nenhuma foto cadastrada, a grade some e fica só o convite para seguir —
a seção nunca aparece quebrada.

---

## 10. Como o catálogo chega na tela

```
Painel admin ──grava──> Firebase Realtime Database
                              │
                              ├──> navegador do visitante (onValue, ao vivo)
                              │        └── é o que ele realmente vê
                              │
                              └──> build na Netlify (REST, no deploy)
                                       └── cards no index.html, para Google
                                           e para a primeira pintura
```

Se o Firebase não responder no navegador (internet ruim do visitante), o site
mostra a cópia embutida no HTML — que é um retrato do próprio banco, tirado no
último deploy — e avisa para confirmar a disponibilidade pelo WhatsApp. Nunca
uma tela vazia, e nunca o catálogo antigo.

Se o Firebase não responder **durante o build**, o script não sobrescreve nada:
mantém o último catálogo pré-renderizado e deixa o deploy passar. Assim uma
instabilidade do Firebase nunca coloca no ar aparelhos que já foram vendidos.

---

## 11. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Painel abre já mostrando avisos amarelos | `firebase-config.js` ou `image-config.js` ainda com `COLE_AQUI` |
| "E-mail ou senha incorretos" com a senha certa | O usuário não foi criado em *Authentication > Users*, ou o método E-mail/senha não está ativo |
| Salva e aparece "Sem permissão para salvar" | Regras do banco não publicadas (seção 4) |
| Foto não envia | Upload preset não está como **Unsigned**, ou o cloud name está errado |
| Produto salvo não aparece no site | O interruptor **Ativo** está desligado |
| Produto aparece com faixa ESGOTADO | O interruptor **Em estoque** está desligado |
| Aviso "Recorte de fundo indisponível" | A conta Cloudinary não tem essa transformação liberada (seção 3.1) — a foto é salva sem recorte |
| "Sem permissão para salvar o banner" | Falta o nó `config` nas regras do banco (seção 4) |
| Seção do Instagram só mostra o convite | Nenhuma foto cadastrada em **/admin > Instagram** |
| Produto cadastrado não aparece no catálogo | Pode estar além do limite da seção — toque em **"Ver mais"** |
| Mapa do rodapé não carrega | Bloqueador de anúncios ou rede sem acesso ao Google; o link "Como chegar" continua funcionando |
| Topo do site sem as fotos do banner | Nenhuma foto cadastrada em **Banner inicial**, ou o nó `config` não está liberado para leitura |
| Produto aparece no grupo errado | O campo **Status** (Novo/Seminovo) define em qual seção do catálogo ele entra |
| Site em branco e erro de CORS no console | Abriu o `index.html` por duplo clique — use um servidor local (seção 7) |
| Build do Netlify avisa "Firebase indisponível" | Normal antes de configurar; ele usa o `data/produtos.json` |
