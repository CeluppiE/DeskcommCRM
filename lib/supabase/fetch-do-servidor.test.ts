/**
 * #1082 / PR #1786 — a URL-base do client é a origem dos LINKS que o servidor
 * entrega a terceiros, e não só o destino das requisições.
 *
 * Com `SUPABASE_SERVER_URL` preenchida (o caminho interno `http://kong:8000`),
 * o servidor tem de falar com o Supabase pelo endereço interno e AO MESMO TEMPO
 * entregar links na origem pública. É o que este arquivo fecha: "com a variável
 * preenchida, `createSignedUrl` e `signInWithOAuth` devolvem a origem pública".
 *
 * O teste roda nos clients REAIS (`lib/supabase/server.ts`), não numa cópia:
 * foi assim que o defeito chegou — nada quebrava no build, e mesmo assim mídia,
 * avatar, fotos de produto, PDF da LGPD e login com Google saíam apontando para
 * o Kong. Reverter `server.ts` para a base interna deixa o primeiro teste
 * vermelho.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminClient } from "./admin";
import { createClient as createClientDeServidor, createClientDeEntradaComGoogle } from "./server";

const V = vi.hoisted(() => ({
  PUBLICA: "https://abcxyz.supabase.co",
  INTERNA: "http://kong:8000",
  APP: "https://crm.exemplo.com",
}));

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: V.PUBLICA,
    SUPABASE_SERVER_URL: V.INTERNA,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-de-teste",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-de-teste",
    NEXT_PUBLIC_APP_URL: V.APP,
  },
}));

// O cookieStore real só existe dentro de um request; aqui o contrato inteiro é
// "sem sessão", que é o estado de quem clica no login com Google.
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {}, delete: () => {} }),
}));

/** Chamadas que o SDK fez — é por aqui que se vê PRA ONDE a requisição foi. */
const destinos: string[] = [];

const fetchFalso = vi.fn(async (input: RequestInfo | URL) => {
  destinos.push(String(input));
  // Forma que o storage-js lê (`result.ok` + `result.json()`), e o corpo que
  // devolve o endpoint de sign: um caminho RELATIVO, como o GoTrue faz.
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ signedURL: "/object/sign/b/p.png?token=Tok3n" }),
  } as unknown as Response;
});

beforeEach(() => {
  destinos.length = 0;
  fetchFalso.mockClear();
  vi.stubGlobal("fetch", fetchFalso);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("com SUPABASE_SERVER_URL preenchida, os LINKS continuam na origem pública", () => {
  it("createSignedUrl devolve a pública, e a requisição vai pelo caminho interno", async () => {
    const cliente = await createClientDeServidor();

    const { data, error } = await cliente.storage.from("b").createSignedUrl("p.png", 60);

    expect(error).toBeNull();
    expect(data?.signedUrl).toContain(V.PUBLICA);
    expect(data?.signedUrl).not.toContain("kong:8000");
    // O contraprova: o transporte é o interno, senão o teste passaria à toa.
    expect(destinos[0]).toContain(`${V.INTERNA}/storage/v1/object/sign/b/p.png`);
  });

  it("signInWithOAuth devolve data.url na pública (login com Google)", async () => {
    const servidor = await createClientDeEntradaComGoogle();

    const { data, error } = await servidor.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${V.APP}/auth/callback`, skipBrowserRedirect: true },
    });

    expect(error).toBeNull();
    expect(data?.url).toContain(V.PUBLICA);
    expect(data?.url).toContain("/auth/v1/authorize");
    expect(data?.url).not.toContain("kong:8000");
  });

  it("o client admin (service role) segue a mesma regra", async () => {
    const admin = createAdminClient();

    const { data, error } = await admin.storage.from("b").createSignedUrl("p.png", 60);

    expect(error).toBeNull();
    expect(data?.signedUrl).toContain(V.PUBLICA);
    expect(data?.signedUrl).not.toContain("kong:8000");
    expect(destinos.some((d) => d.startsWith(V.INTERNA))).toBe(true);
  });

  /**
   * Controle: é EXATAMENTE o que acontecia antes do conserto — a base no
   * endereço interno, e o link sai interno. Sem ele, os testes de cima
   * provariam pouco: qualquer "não kong" passaria.
   */
  it("controle — com a base na interna, o mesmo SDK entrega o link interno", async () => {
    const defeito = createClient(V.INTERNA, "anon-key-de-teste");

    const { data } = await defeito.storage.from("b").createSignedUrl("p.png", 60);

    expect(data?.signedUrl).toContain("kong:8000");
    expect(data?.signedUrl).not.toContain(V.PUBLICA);
  });

  /**
   * O middleware (`proxy.ts`) não gera link, mas tem de desviar o transporte
   * pelo mesmo resolvedor — um desenho só nos três clients. Não dá para
   * importá-lo aqui (ele roda em Edge e constrói `NextResponse`), então a
   * ligação é conferida na fonte, como o resto do repo faz.
   */
  it("proxy.ts liga o mesmo fetch de desvio", () => {
    const fonte = readFileSync(join(__dirname, "..", "..", "proxy.ts"), "utf8");

    expect(fonte).toContain("fetchDoServidor(");
    expect(fonte).toContain(
      "urlDoSupabaseNoServidor(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL)",
    );
    expect(fonte).toContain("env.NEXT_PUBLIC_SUPABASE_URL,");
  });
});
