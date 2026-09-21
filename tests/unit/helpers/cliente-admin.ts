/**
 * CLIENTE DE SERVIÇO — a maquinaria de varredura, num lugar só.
 *
 * Dois testes fazem perguntas diferentes sobre o MESMO fato: "de onde veio este
 * cliente?" (`escrita-em-organizations-usa-cliente-admin`, que cobra o cliente
 * admin em `organizations`) e "esta cadeia filtra o tenant?"
 * (`admin-client-exige-filtro-de-tenant`, que cobra o filtro no caminho que a
 * RLS NÃO vê). Os dois precisam da mesma coisa: resolver o identificador-raiz de
 * uma cadeia `x.from(...).eq(...)` e saber quais nomes, NAQUELE arquivo, vieram
 * de `createAdminClient()`.
 *
 * Resolver o identificador é o ponto, e não um detalhe de estilo: procurar a
 * string "createAdminClient" no arquivo inteiro daria verde para um handler que
 * tem o cliente admin numa função e o de sessão na outra — a forma exata do
 * defeito que os dois medem.
 *
 * ═══ A TERCEIRA PERGUNTA: E QUANDO O CLIENTE CHEGA POR PARÂMETRO? ═══
 *
 * `nomesDoClienteAdmin` só enxerga o cliente CRIADO no arquivo. Um módulo que o
 * recebe (`p.admin`, com `admin: ReturnType<typeof createAdminClient>`) some
 * dessa conta — e a cerca de `organizations` acusava escrita irregular num
 * arquivo correto (PR #1017). `caminhosDoClienteAdmin` responde essa pergunta, e
 * responde pelo **TIPO**: o que autoriza é a anotação resolvida, nunca a
 * propriedade se chamar `admin`. Batizar de `admin` um cliente de sessão não
 * compra nada — é a diferença entre prova e senha.
 *
 * ═══ A QUARTA: E QUANDO O TIPO MORA NO ARQUIVO DO LADO? ═══
 *
 * Anotação que só o próprio arquivo explicava deixava de fora o que o `tsc`
 * aceita normalmente (issue #1157, os três itens): o alias IMPORTADO
 * (`import type { Admin } from "@/lib/waha/ingest"`, que já é exportado lá), o
 * membro que chega por `extends`, e o cliente passado de uma função para outra
 * sem anotação nenhuma no receptor. Os dois primeiros passaram a ser seguidos
 * até o módulo que declara o tipo (o salto de `escopoDoModulo`); o terceiro é
 * provado pela CHAMADA (`nomesProvadosPelaChamada`). Onde a cerca não consegue
 * provar, ela ACUSA — e o que continua fora está escrito no docstring de cada
 * uma das duas.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

import { RAIZ_DO_REPO } from "./varrer-codigo";

/**
 * O identificador-raiz de uma cadeia `x.from(...).eq(...)`; `null` quando a raiz
 * não é um nome (ex.: índice de array, chamada de outra coisa).
 *
 * `createAdminClient().from(...)` devolve `"createAdminClient"`: a fábrica
 * inline, sem variável pelo caminho.
 */
export function raizDaCadeia(no: ts.Expression): string | null {
  let atual: ts.Node = no;
  while (true) {
    if (ts.isIdentifier(atual)) return atual.text;
    if (ts.isCallExpression(atual)) {
      atual = atual.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(atual)) {
      atual = atual.expression;
      continue;
    }
    if (ts.isAwaitExpression(atual) || ts.isParenthesizedExpression(atual)) {
      atual = atual.expression;
      continue;
    }
    return null;
  }
}

/**
 * O CAMINHO escrito de uma cadeia — `"p.admin"` em `p.admin.from(...)`,
 * `"admin"` em `admin.from(...)`.
 *
 * Difere de `raizDaCadeia` em duas coisas, e as duas são o ponto: ela devolve só
 * a RAIZ (`"p"`, perdendo qual propriedade foi usada) e ATRAVESSA chamadas.
 * Aqui, chamada no meio do caminho devolve `null` — `f().admin` não é um caminho
 * nomeável, e um caminho que não é nomeável não pode ser conferido contra a
 * anotação de tipo de um parâmetro. `this.x`, índice de array e desestruturação
 * no meio caem no mesmo `null`.
 *
 * As duas convivem: a raiz basta para o cliente criado no arquivo (o nome é o
 * cliente); o caminho é o que permite perguntar "esta PROPRIEDADE é o cliente
 * admin?".
 */
export function caminhoDaCadeia(no: ts.Expression): string | null {
  const partes: string[] = [];
  let atual: ts.Node = no;
  for (;;) {
    if (ts.isIdentifier(atual)) {
      partes.push(atual.text);
      return partes.reverse().join(".");
    }
    if (ts.isPropertyAccessExpression(atual)) {
      partes.push(atual.name.text);
      atual = atual.expression;
      continue;
    }
    if (ts.isParenthesizedExpression(atual)) {
      atual = atual.expression;
      continue;
    }
    return null;
  }
}

/**
 * Os nomes que, NAQUELE arquivo, foram declarados a partir de
 * `createAdminClient()` — `const admin = await createAdminClient()`.
 */
export function nomesDoClienteAdmin(fonte: ts.SourceFile): Set<string> {
  const nomes = new Set<string>();
  const visitar = (no: ts.Node): void => {
    if (ts.isVariableDeclaration(no) && no.initializer && ts.isIdentifier(no.name)) {
      let init: ts.Node = no.initializer;
      if (ts.isAwaitExpression(init)) init = init.expression;
      if (
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === "createAdminClient"
      ) {
        nomes.add(no.name.text);
      }
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return nomes;
}

/** O módulo que exporta a fábrica, e o nome exportado. */
const MODULO_DA_FABRICA = "supabase/admin";
const NOME_EXPORTADO_DA_FABRICA = "createAdminClient";

/**
 * O nome LOCAL ligado à fábrica do cliente admin naquele arquivo — normalmente
 * `createAdminClient`, mas `import { createAdminClient as servico }` também
 * conta. `null` quando o arquivo não importa a fábrica de `lib/supabase/admin`.
 *
 * É daqui que sai a ancoragem da prova de tipo: sem o vínculo com ESTE módulo,
 * `ReturnType<typeof createAdminClient>` seria só um texto que qualquer arquivo
 * poderia escrever declarando uma função homônima.
 */
function nomeLocalDaFabrica(fonte: ts.SourceFile): string | null {
  let local: string | null = null;
  for (const decl of fonte.statements) {
    if (!ts.isImportDeclaration(decl) || !ts.isStringLiteral(decl.moduleSpecifier)) continue;
    if (!decl.moduleSpecifier.text.endsWith(MODULO_DA_FABRICA)) continue;
    const ligacoes = decl.importClause?.namedBindings;
    if (ligacoes === undefined || !ts.isNamedImports(ligacoes)) continue;
    for (const elemento of ligacoes.elements) {
      const exportado = elemento.propertyName?.text ?? elemento.name.text;
      if (exportado === NOME_EXPORTADO_DA_FABRICA) local = elemento.name.text;
    }
  }
  return local;
}

/** Uma `interface` declarada no arquivo — os membros e as bases do `extends`. */
interface DeclaracaoDeInterface {
  readonly membros: ts.NodeArray<ts.TypeElement>;
  readonly estende: readonly string[];
}

/** Uma função declarada no arquivo — o que a prova por CHAMADA precisa dela. */
interface FuncaoLocal {
  readonly parametros: ts.NodeArray<ts.ParameterDeclaration>;
  readonly exportada: boolean;
}

/**
 * O que o arquivo declara de tipo E o que ele importa, para resolver
 * `admin: Admin` sem compilador.
 *
 * `arquivo` e `importados` são o que permite ATRAVESSAR a fronteira (issue
 * #1157): sem eles o tipo que mora no módulo do lado era só um nome, e a única
 * saída seria aceitar pelo nome — que é a senha que este resolvedor existe para
 * não ter.
 */
interface EscopoDeTipos {
  /** Caminho absoluto do arquivo, quando há um: é dele que sai um `./` import. */
  readonly arquivo: string | null;
  /** Nome LOCAL da fábrica do cliente admin, quando o arquivo a importa. */
  readonly fabrica: string | null;
  readonly aliases: ReadonlyMap<string, ts.TypeNode>;
  readonly interfaces: ReadonlyMap<string, DeclaracaoDeInterface>;
  readonly importados: ReadonlyMap<string, { readonly modulo: string; readonly exportado: string }>;
  readonly funcoes: ReadonlyMap<string, FuncaoLocal>;
}

/** O nome com que uma função é declarada; `null` para o que não tem nome (nem método). */
function nomeDeclarado(no: ts.Node): string | null {
  if (ts.isFunctionDeclaration(no) && no.name !== undefined) return no.name.text;
  if (ts.isFunctionExpression(no) || ts.isArrowFunction(no)) {
    const pai: ts.Node | undefined = no.parent;
    if (pai !== undefined && ts.isVariableDeclaration(pai) && ts.isIdentifier(pai.name)) {
      return pai.name.text;
    }
  }
  return null;
}

/** A função atravessa a fronteira do arquivo (`export`)? */
function ehExportado(no: ts.Node): boolean {
  let alvo: ts.Node | undefined = no;
  if (ts.isFunctionExpression(no) || ts.isArrowFunction(no)) alvo = no.parent;
  // a arrow ganha o modificador na DECLARAÇÃO: `export const f = async (…) => …`
  if (alvo !== undefined && ts.isVariableDeclaration(alvo)) alvo = alvo.parent.parent;
  if (alvo === undefined || !ts.canHaveModifiers(alvo)) return false;
  const modificadores = ts.getModifiers(alvo);
  return modificadores?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function escopoDeTipos(fonte: ts.SourceFile): EscopoDeTipos {
  const aliases = new Map<string, ts.TypeNode>();
  const interfaces = new Map<string, DeclaracaoDeInterface>();
  const importados = new Map<string, { modulo: string; exportado: string }>();
  const funcoes = new Map<string, FuncaoLocal>();

  const visitar = (no: ts.Node): void => {
    if (ts.isTypeAliasDeclaration(no)) aliases.set(no.name.text, no.type);
    if (ts.isInterfaceDeclaration(no)) {
      const estende: string[] = [];
      for (const clausula of no.heritageClauses ?? []) {
        // Só `extends Identificador`: `extends Algo<T>` e `extends f()` ficam de
        // fora, e o silêncio aqui erra para o lado da cerca (acusar).
        for (const base of clausula.types) {
          if (ts.isIdentifier(base.expression)) estende.push(base.expression.text);
        }
      }
      interfaces.set(no.name.text, { membros: no.members, estende });
    }
    const nome = nomeDeclarado(no);
    if (nome !== null && ts.isFunctionLike(no)) {
      funcoes.set(nome, { parametros: no.parameters, exportada: ehExportado(no) });
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);

  for (const decl of fonte.statements) {
    if (!ts.isImportDeclaration(decl) || !ts.isStringLiteral(decl.moduleSpecifier)) continue;
    const ligacoes = decl.importClause?.namedBindings;
    if (ligacoes === undefined || !ts.isNamedImports(ligacoes)) continue;
    for (const elemento of ligacoes.elements) {
      importados.set(elemento.name.text, {
        modulo: decl.moduleSpecifier.text,
        exportado: elemento.propertyName?.text ?? elemento.name.text,
      });
    }
  }

  return {
    arquivo: path.isAbsolute(fonte.fileName) ? fonte.fileName : null,
    fabrica: nomeLocalDaFabrica(fonte),
    aliases,
    interfaces,
    importados,
    funcoes,
  };
}

/** As extensões tentadas ao resolver um módulo, na ordem em que o bundler tenta. */
const EXTENSOES_DE_MODULO = [".ts", ".tsx", "/index.ts", "/index.tsx"] as const;

const escoposLidos = new Map<string, EscopoDeTipos | null>();

/**
 * O escopo do módulo apontado por um `import` — `@/x` a partir da raiz do repo
 * (o alias do `tsconfig`), `./x` a partir de quem importa.
 *
 * `null` quando o módulo não é um arquivo do repo: pacote de `node_modules`,
 * arquivo que não existe, caminho relativo de uma fonte sintética (os CONTROLES
 * vivem em memória, sem lugar no disco). Nenhum dos três é motivo para liberar:
 * sem escopo o nome importado não resolve em nada, e a cerca ACUSA.
 */
function escopoDoModulo(modulo: string, deOnde: string | null): EscopoDeTipos | null {
  const semAlias = modulo.startsWith("@/") ? path.join(RAIZ_DO_REPO, modulo.slice(2)) : null;
  const base =
    semAlias ?? (modulo.startsWith(".") && deOnde !== null ? path.resolve(path.dirname(deOnde), modulo) : null);
  if (base === null) return null;

  const emCache = escoposLidos.get(base);
  if (emCache !== undefined) return emCache;

  let escopo: EscopoDeTipos | null = null;
  for (const extensao of EXTENSOES_DE_MODULO) {
    const candidato = base + extensao;
    try {
      // `setParentNodes`: `nomeDeclarado` e `ehExportado` sobem por `.parent`.
      const texto = readFileSync(candidato, "utf8");
      escopo = escopoDeTipos(ts.createSourceFile(candidato, texto, ts.ScriptTarget.Latest, true));
      break;
    } catch {
      escopo = null; // não existe (ou não deu para ler) — tenta a extensão seguinte
    }
  }
  escoposLidos.set(base, escopo);
  return escopo;
}

/**
 * True quando a anotação É o tipo do cliente admin:
 * `ReturnType<typeof <fábrica>>`, direto, por um `type` do próprio arquivo que
 * resolva nisso (`type Admin = ReturnType<typeof createAdminClient>`, o padrão
 * de `lib/channels/pos-entrada.ts`) ou por um `type` IMPORTADO que resolva nisso
 * no módulo que o declara (`lib/waha/ingest.ts`, o item 1 da issue #1157).
 *
 * `vistos` impede laço: alias mutuamente recursivo, que o `tsc` recusaria mas
 * esta varredura leria sem parar, e módulo que importa de volta de quem o
 * importou.
 */
function ehTipoDoClienteAdmin(
  tipo: ts.TypeNode,
  escopo: EscopoDeTipos,
  vistos: ReadonlySet<string> = new Set(),
): boolean {
  if (!ts.isTypeReferenceNode(tipo) || !ts.isIdentifier(tipo.typeName)) return false;
  return ehNomeDoClienteAdmin(tipo.typeName.text, tipo, escopo, vistos);
}

/** A pergunta acima, pelo NOME do tipo — é o que o salto de arquivo precisa. */
function ehNomeDoClienteAdmin(
  nome: string,
  referencia: ts.TypeReferenceNode,
  escopo: EscopoDeTipos,
  vistos: ReadonlySet<string>,
): boolean {
  if (nome === "ReturnType") {
    const argumentos = referencia.typeArguments;
    if (argumentos === undefined || argumentos.length !== 1 || escopo.fabrica === null) return false;
    const unico = argumentos[0];
    return (
      unico !== undefined &&
      ts.isTypeQueryNode(unico) &&
      ts.isIdentifier(unico.exprName) &&
      unico.exprName.text === escopo.fabrica
    );
  }
  const chave = `${escopo.arquivo ?? ""}#${nome}`;
  if (vistos.has(chave)) return false;
  const proximos = new Set([...vistos, chave]);

  const alias = escopo.aliases.get(nome);
  if (alias !== undefined) return ehTipoDoClienteAdmin(alias, escopo, proximos);

  // ── o salto de arquivo: `import type { Admin } from "@/lib/waha/ingest"` ──
  const destino = escopo.importados.get(nome);
  if (destino === undefined) return false;
  const deLa = escopoDoModulo(destino.modulo, escopo.arquivo);
  if (deLa === null) return false;
  const aliasDeLa = deLa.aliases.get(destino.exportado);
  if (aliasDeLa === undefined) return false;
  return ehTipoDoClienteAdmin(aliasDeLa, deLa, proximos);
}

/**
 * As PROPRIEDADES tipadas como cliente admin de um tipo de objeto — o membro
 * `admin` de `interface PedidoDePadrao { admin: ReturnType<typeof createAdminClient> }`.
 *
 * Aceita o tipo literal inline, a `interface` (deste arquivo ou de outro módulo,
 * pelo salto de `escopoDoModulo`) e o `type` que resolve num dos dois. `extends`
 * É seguido (item 2 da issue #1157): a base entra como se os membros dela
 * estivessem escritos aqui — e o que a herança traz é provado pelo TIPO dela,
 * então `interface Pedido extends DaSessao` não libera nada. Base que não
 * resolve (classe, genérico, união, `extends` de chamada) devolve conjunto
 * vazio, e o silêncio erra para o lado da cerca (acusar).
 */
function propriedadesDoClienteAdmin(
  tipo: ts.TypeNode,
  escopo: EscopoDeTipos,
  vistos: ReadonlySet<string> = new Set(),
): Set<string> {
  if (ts.isTypeLiteralNode(tipo)) return membrosDoClienteAdmin(tipo.members, escopo, vistos);
  if (ts.isTypeReferenceNode(tipo) && ts.isIdentifier(tipo.typeName)) {
    return propriedadesDoNomeDaInterface(tipo.typeName.text, escopo, vistos);
  }
  return new Set();
}

/** A pergunta acima, pelo NOME do tipo — é o que o salto de arquivo precisa. */
function propriedadesDoNomeDaInterface(
  nome: string,
  escopo: EscopoDeTipos,
  vistos: ReadonlySet<string>,
): Set<string> {
  const chave = `${escopo.arquivo ?? ""}#${nome}`;
  if (vistos.has(chave)) return new Set();
  const proximos = new Set([...vistos, chave]);

  const local = escopo.interfaces.get(nome);
  if (local !== undefined) return membrosHerdadosDaInterface(local, escopo, proximos);

  const alias = escopo.aliases.get(nome);
  if (alias !== undefined) return propriedadesDoClienteAdmin(alias, escopo, proximos);

  // ── o salto de arquivo: `import type { Pedido } from "@/…"` ──
  const destino = escopo.importados.get(nome);
  if (destino === undefined) return new Set();
  const deLa = escopoDoModulo(destino.modulo, escopo.arquivo);
  if (deLa === null) return new Set();
  const interfaceDeLa = deLa.interfaces.get(destino.exportado);
  if (interfaceDeLa !== undefined) return membrosHerdadosDaInterface(interfaceDeLa, deLa, proximos);
  const aliasDeLa = deLa.aliases.get(destino.exportado);
  if (aliasDeLa !== undefined) return propriedadesDoClienteAdmin(aliasDeLa, deLa, proximos);
  return new Set();
}

/** Os membros da lista que são o cliente admin pelo TIPO, não pelo nome. */
function membrosDoClienteAdmin(
  membros: ts.NodeArray<ts.TypeElement>,
  escopo: EscopoDeTipos,
  vistos: ReadonlySet<string>,
): Set<string> {
  const nomes = new Set<string>();
  for (const membro of membros) {
    if (
      ts.isPropertySignature(membro) &&
      membro.type !== undefined &&
      ts.isIdentifier(membro.name) &&
      ehTipoDoClienteAdmin(membro.type, escopo, vistos)
    ) {
      nomes.add(membro.name.text);
    }
  }
  return nomes;
}

/** Os membros de uma `interface` MAIS os que ela herda por `extends`. */
function membrosHerdadosDaInterface(
  declaracao: DeclaracaoDeInterface,
  escopo: EscopoDeTipos,
  vistos: ReadonlySet<string>,
): Set<string> {
  const nomes = membrosDoClienteAdmin(declaracao.membros, escopo, vistos);
  for (const base of declaracao.estende) {
    for (const nome of propriedadesDoNomeDaInterface(base, escopo, vistos)) nomes.add(nome);
  }
  return nomes;
}

/**
 * Os CAMINHOS que, NAQUELE arquivo, chegam ao cliente admin por PARÂMETRO —
 * `"p.admin"` para `definirPadraoDeIaDaOrganizacao(p: PedidoDePadrao)`,
 * `"admin"` para `f(admin: ReturnType<typeof createAdminClient>)` e para
 * `f({ admin }: { admin: ReturnType<typeof createAdminClient> })`.
 *
 * ═══ A PROVA É DE TIPO, NUNCA DE NOME ═══
 *
 * Só entra aqui o parâmetro cuja ANOTAÇÃO resolve em
 * `ReturnType<typeof <fábrica importada de lib/supabase/admin>>` — ou cuja
 * CHAMADA entrega um cliente admin provado (a forma 3 abaixo). Aceitar qualquer
 * `x.admin` seria dar à cerca uma senha em vez de uma prova: bastaria batizar de
 * `admin` um parâmetro tipado com o cliente de SESSÃO (ou não tipar nada) para
 * escrever em `organizations` por baixo dela — e o modo de falha que a cerca
 * existe para pegar devolve SUCESSO com zero linhas, então ninguém descobriria
 * pelo sintoma.
 *
 * ═══ AS TRÊS FORMAS QUE PROVAM O PARÂMETRO (issue #1157) ═══
 *
 * 1. **a anotação escrita aqui** — o que sempre houve;
 * 2. **a anotação resolvida em OUTRO arquivo** — `import type { Admin } from
 *    "@/lib/waha/ingest"` (o alias que já é exportado lá) ou o membro herdado
 *    por `extends`: o resolvedor segue o `import` até o módulo que declara o
 *    tipo (itens 1 e 2 da issue);
 * 3. **a CHAMADA**, para o parâmetro SEM anotação nenhuma — o cliente criado
 *    numa função e passado a outra (`f(admin)`), provado por
 *    `nomesProvadosPelaChamada` (item 3).
 *
 * ═══ POR QUE SÓ PARÂMETRO ═══
 *
 * Variável anotada (`const admin: Admin = ...`) fica de fora de propósito. O
 * cliente criado no arquivo já é medido por `nomesDoClienteAdmin`, que lê a
 * ORIGEM (`createAdminClient()`); aceitar a anotação de uma variável trocaria
 * essa origem por uma promessa que um cast desfaz em silêncio. Parâmetro não tem
 * essa saída: quem o preenche está em outro arquivo, e lá a anotação é o
 * contrato que o `tsc` cobra.
 */
export function caminhosDoClienteAdmin(fonte: ts.SourceFile): Set<string> {
  const escopo = escopoDeTipos(fonte);
  const caminhos = new Set<string>();

  const visitar = (no: ts.Node): void => {
    if (ts.isParameter(no) && no.type !== undefined) {
      if (ts.isIdentifier(no.name)) {
        if (ehTipoDoClienteAdmin(no.type, escopo)) {
          caminhos.add(no.name.text);
        } else {
          for (const propriedade of propriedadesDoClienteAdmin(no.type, escopo)) {
            caminhos.add(`${no.name.text}.${propriedade}`);
          }
        }
      } else if (ts.isObjectBindingPattern(no.name)) {
        const admins = propriedadesDoClienteAdmin(no.type, escopo);
        for (const elemento of no.name.elements) {
          const origem = elemento.propertyName ?? elemento.name;
          if (
            ts.isIdentifier(origem) &&
            admins.has(origem.text) &&
            ts.isIdentifier(elemento.name)
          ) {
            caminhos.add(elemento.name.text);
          }
        }
      }
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);

  // 3. a prova por CHAMADA, para o parâmetro sem anotação nenhuma.
  for (const nome of nomesProvadosPelaChamada(fonte, escopo, caminhos)) caminhos.add(nome);

  return caminhos;
}

/**
 * Os nomes de parâmetro que só a CHAMADA prova — o item 3 da issue #1157: o
 * cliente criado numa função e passado a outra, cujo parâmetro não tem anotação
 * nenhuma (`f(admin)`), e por isso não era resolvido por tipo.
 *
 * ═══ A REGRA É `every`, E É CONSERVADORA DE PROPÓSITO ═══
 *
 * O CAMINHO é por ARQUIVO — é assim que a cerca pergunta (`caminho ∈ caminhos`)
 * —, então um nome só entra quando TODAS as funções deste arquivo que declaram
 * um parâmetro com esse nome o provam: por anotação ou por chamada. Uma única
 * que não prove derruba o nome inteiro e deixa o caminho fora. É de propósito:
 * acusar a mais é o erro barato (o autor anota o parâmetro e o verde volta, que
 * é o que a doutrina quer de qualquer jeito); liberar a menos é o defeito que a
 * cerca existe para pegar.
 *
 * A mesma assimetria vale dentro da função: se ela é chamada uma vez com o
 * cliente admin e outra com o de sessão, o parâmetro NÃO está provado
 * (`every`, e não `some`) — uma chamada correta não pode ser a senha das outras.
 *
 * ═══ O QUE FICA DE FORA, E PORTANTO CONTINUA ACUSADO ═══
 *
 * - função EXPORTADA: as chamadas deste arquivo não são todas as que existem, e
 *   quem chama de fora não está sob esta varredura;
 * - passagem de objeto (`f({ admin })`) e recepção por desestruturação: prova-se
 *   o parâmetro, posição por posição;
 * - parâmetro com anotação que não resolve em cliente admin: a anotação é
 *   autoridade, e uma chamada com cliente admin não a desmente.
 */
function nomesProvadosPelaChamada(
  fonte: ts.SourceFile,
  escopo: EscopoDeTipos,
  caminhos: ReadonlySet<string>,
): Set<string> {
  const admins = nomesDoClienteAdmin(fonte);
  const candidatos = new Set<string>();

  for (const funcao of escopo.funcoes.values()) {
    if (funcao.exportada) continue;
    for (const parametro of funcao.parametros) {
      if (parametro.type !== undefined || !ts.isIdentifier(parametro.name)) continue;
      const nome = parametro.name.text;
      if (candidatos.has(nome)) continue;
      if (parametroRecebeAdmin(parametro, nome, fonte, escopo, admins, caminhos, new Set())) {
        candidatos.add(nome);
      }
    }
  }

  const provados = new Set<string>();
  for (const nome of candidatos) {
    if (todasAsFuncoesProvam(nome, fonte, escopo, admins, caminhos)) provados.add(nome);
  }
  return provados;
}

/**
 * True quando o parâmetro `nome` da função que CONTÉM `no` recebe o cliente
 * admin — pela anotação dele ou por TODAS as chamadas visíveis a essa função
 * neste arquivo.
 */
function parametroRecebeAdmin(
  no: ts.Node,
  nome: string,
  fonte: ts.SourceFile,
  escopo: EscopoDeTipos,
  admins: ReadonlySet<string>,
  caminhos: ReadonlySet<string>,
  vistos: ReadonlySet<string>,
): boolean {
  for (const nomeFuncao of nomesDasFuncoesQueContem(no)) {
    const funcao = escopo.funcoes.get(nomeFuncao);
    // Função exportada fica de fora: as chamadas deste arquivo não são todas as
    // que existem, e o outro arquivo não está sob esta varredura.
    if (funcao === undefined || funcao.exportada) continue;
    const indice = funcao.parametros.findIndex((p) => ts.isIdentifier(p.name) && p.name.text === nome);
    if (indice < 0) continue;
    const parametro = funcao.parametros[indice];
    if (parametro === undefined) continue;
    // A anotação, quando existe, é autoridade: ou ela já provou o cliente admin,
    // ou ela diz que é outro cliente — e aí a chamada não desmente o `tsc`.
    if (parametro.type !== undefined) return ehTipoDoClienteAdmin(parametro.type, escopo, vistos);

    const chave = `${fonte.fileName}#${nomeFuncao}#${nome}`;
    if (vistos.has(chave)) return false;
    const chamadas = chamadasA(fonte, nomeFuncao);
    // Sem chamada neste arquivo não há prova: `não chamada aqui` não é o mesmo
    // que `chamada com o cliente admin`.
    if (chamadas.length === 0) return false;
    const proximos = new Set([...vistos, chave]);
    return chamadas.every((chamada) =>
      argumentoEntregaAdmin(chamada.arguments[indice], fonte, escopo, admins, caminhos, proximos),
    );
  }
  return false;
}

/** O argumento entregue na chamada é o cliente admin — por origem, anotação ou passagem? */
function argumentoEntregaAdmin(
  argumento: ts.Expression | undefined,
  fonte: ts.SourceFile,
  escopo: EscopoDeTipos,
  admins: ReadonlySet<string>,
  caminhos: ReadonlySet<string>,
  vistos: ReadonlySet<string>,
): boolean {
  if (argumento === undefined) return false;
  if (ehClienteDeServico(argumento, admins)) return true;
  const caminho = caminhoDaCadeia(argumento);
  if (caminho === null) return false;
  if (caminhos.has(caminho)) return true;
  // O argumento pode ser ele mesmo um parâmetro sem anotação — a passagem em
  // cadeia (`gravar` chama `aplicar`, que chama `executar`).
  return !caminho.includes(".") && parametroRecebeAdmin(argumento, caminho, fonte, escopo, admins, caminhos, vistos);
}

/** Todas as funções do arquivo que declaram um parâmetro com este nome o provam. */
function todasAsFuncoesProvam(
  nome: string,
  fonte: ts.SourceFile,
  escopo: EscopoDeTipos,
  admins: ReadonlySet<string>,
  caminhos: ReadonlySet<string>,
): boolean {
  const parametroComNome = (funcao: FuncaoLocal): ts.ParameterDeclaration | undefined =>
    funcao.parametros.find((p) => ts.isIdentifier(p.name) && p.name.text === nome);

  let declarantes = 0;
  for (const funcao of escopo.funcoes.values()) {
    const parametro = parametroComNome(funcao);
    if (parametro === undefined) continue;
    declarantes++;
    if (funcao.exportada) return false;
    if (parametro.type !== undefined) {
      if (!ehTipoDoClienteAdmin(parametro.type, escopo)) return false;
      continue;
    }
    if (!parametroRecebeAdmin(parametro, nome, fonte, escopo, admins, caminhos, new Set())) return false;
  }
  return declarantes > 0;
}

/** As funções que CONTÊM este nó, da mais interna para a mais externa. */
function nomesDasFuncoesQueContem(no: ts.Node): string[] {
  const nomes: string[] = [];
  let atual: ts.Node | undefined = no.parent;
  while (atual !== undefined) {
    // Método de classe: o parâmetro dele é `this`-bound e o nome não é o de uma
    // função declarada no arquivo — a busca para aqui, em vez de atribuir o nó
    // ao último nome visto.
    if (
      ts.isMethodDeclaration(atual) ||
      ts.isConstructorDeclaration(atual) ||
      ts.isGetAccessorDeclaration(atual) ||
      ts.isSetAccessorDeclaration(atual)
    ) {
      break;
    }
    const nome = nomeDeclarado(atual);
    if (nome !== null) nomes.push(nome);
    atual = atual.parent;
  }
  return nomes;
}

/** As chamadas a esta função no arquivo, FORA do corpo dela. */
function chamadasA(fonte: ts.SourceFile, nome: string): ts.CallExpression[] {
  const chamadas: ts.CallExpression[] = [];
  const visitar = (no: ts.Node, dentro: boolean): void => {
    if (!dentro && ts.isCallExpression(no) && ts.isIdentifier(no.expression) && no.expression.text === nome) {
      chamadas.push(no);
    }
    // Recursão não prova nada sobre o parâmetro: contá-la faria a função provar
    // a si mesma.
    const dentroAgora = dentro || nomeDeclarado(no) === nome;
    ts.forEachChild(no, (filho) => visitar(filho, dentroAgora));
  };
  visitar(fonte, false);
  return chamadas;
}

/**
 * True quando a raiz da cadeia é cliente de SERVIÇO: nome declarado de
 * `createAdminClient()` naquele arquivo, ou a própria fábrica inline.
 *
 * O que fica de fora DESTA função, de propósito: cliente admin recebido por
 * PARÂMETRO (o caminho de `lib/mcp/server.ts`, que entrega o cliente de serviço
 * ao handler). Quem responde por ele é `caminhosDoClienteAdmin`, pela anotação
 * de tipo — e quem consome as duas respostas hoje é só a cerca de
 * `organizations`. Somar as duas aqui mudaria o conjunto de cadeias que
 * `admin-client-exige-filtro-de-tenant` mede, e esse é outro veredito: lá o
 * recorte do parâmetro está declarado no docstring do próprio teste.
 */
export function ehClienteDeServico(raiz: ts.Expression, admins: ReadonlySet<string>): boolean {
  const nome = raizDaCadeia(raiz);
  if (nome === null) return false;
  return nome === "createAdminClient" || admins.has(nome);
}

/** Um passo da cadeia: o método chamado e a chamada que o aplica. */
export interface PassoDaCadeia {
  readonly metodo: string;
  readonly chamada: ts.CallExpression;
}

/**
 * Os passos `.metodo(...)` que CONTINUAM a cadeia a partir de `chamada`, de
 * dentro para fora: em `x.from("t").select("a").eq("b", c)`, a partir do
 * `from` devolve `select` e depois `eq`.
 *
 * Exige que a fonte tenha sido criada com `setParentNodes = true`.
 */
export function passosDaCadeia(chamada: ts.CallExpression): PassoDaCadeia[] {
  const passos: PassoDaCadeia[] = [];
  let atual: ts.Node = chamada;
  for (;;) {
    const acesso = atual.parent;
    if (acesso === undefined || !ts.isPropertyAccessExpression(acesso) || acesso.expression !== atual) {
      break;
    }
    const proxima = acesso.parent;
    if (proxima === undefined || !ts.isCallExpression(proxima) || proxima.expression !== acesso) {
      break;
    }
    passos.push({ metodo: acesso.name.text, chamada: proxima });
    atual = proxima;
  }
  return passos;
}
