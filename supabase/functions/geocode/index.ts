// Edge Function `geocode` — busca de endereço para origem/destino da rota (EP03).
//
// Por que passar por aqui em vez de o app chamar o Nominatim direto:
//
//  1. Política de uso. O Nominatim exige User-Agent identificável e limita a
//     1 req/s por cliente. Do app, cada celular seria um cliente anônimo
//     diferente — o jeito rápido de conseguir o IP do projeto bloqueado.
//  2. Cache. Numa turma inteira buscando os mesmos campi, a segunda busca por
//     "PUC Perdizes" não deveria sair da nossa infraestrutura.
//  3. Troca de provedor. Se a equipe migrar para Google/Mapbox depois, muda só
//     esta função: o contrato com o app continua o mesmo.
//
// Sobre autenticação: `verify_jwt = true` NÃO basta. Verificado contra o
// ambiente — o gateway aceita a publishable key sozinha no header `apikey`, e
// essa chave é pública, embutida no bundle do app. Qualquer um que a extraia
// teria um proxy aberto de geocodificação.
//
// Por isso a função valida o Bearer como JWT de usuário de verdade (abaixo,
// requireUser). Aí sim: só quem tem conta institucional confirmada busca
// endereço.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Exigido pela política do Nominatim: precisa identificar a aplicação e ter
// como entrar em contato. O contato vem do segredo GEOCODE_CONTACT (dashboard →
// Edge Functions → Secrets), para nenhum e-mail pessoal ficar no código nem no git.
const CONTACT = Deno.env.get("GEOCODE_CONTACT")?.trim();
const USER_AGENT = `UniRota/0.1 (projeto academico PUC-SP${CONTACT ? `; contato: ${CONTACT}` : ""})`;

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_TTL_DAYS = 30;
const MIN_QUERY_LENGTH = 3;
const MAX_RESULTS = 5;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type GeocodeResult = {
  label: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/** Normaliza para a chave de cache: minúsculo, sem espaços redundantes. */
function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Monta um rótulo curto a partir do endereço estruturado do Nominatim.
 * O `display_name` cru é longo demais para caber na tela ("Avenida Paulista,
 * 900, Bela Vista, São Paulo, Região Imediata de São Paulo, ...").
 */
function buildLabel(item: Record<string, unknown>): string {
  const address = (item.address ?? {}) as Record<string, string | undefined>;

  const street = address.road ?? address.pedestrian ?? address.footway;
  const number = address.house_number;
  const place = address.amenity ?? address.building ?? address.shop;
  const district = address.suburb ?? address.neighbourhood ?? address.city_district;
  const city = address.city ?? address.town ?? address.municipality ?? address.village;

  const head = place ?? (street ? (number ? `${street}, ${number}` : street) : null);

  const parts = [head, district, city].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");

  // Sem endereço estruturado utilizável: corta o display_name nos 3 primeiros
  // componentes, que é o que costuma identificar o lugar.
  return String(item.display_name ?? "").split(",").slice(0, 3).join(",").trim();
}

function toResults(raw: unknown): GeocodeResult[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      const address = (item.address ?? {}) as Record<string, string | undefined>;
      return {
        label: buildLabel(item),
        latitude,
        longitude,
        city: address.city ?? address.town ?? address.municipality ?? address.village ?? null,
        state: address.state ?? null,
      } satisfies GeocodeResult;
    })
    .filter((r): r is GeocodeResult => r !== null && r.label.length > 0);
}

/**
 * Plano B: Photon (komoot), também OpenStreetMap, gratuito e sem chave.
 *
 * Desde 28/10/2026 o Nominatim responde 403 às chamadas que saem da
 * infraestrutura da Supabase (do IP de casa, com o mesmo User-Agent, responde
 * 200): o bloqueio é por faixa de IP de nuvem, não por uso indevido nosso.
 * Quando o Nominatim falha, a busca tenta o Photon antes de desistir.
 */
const PHOTON_URL = "https://photon.komoot.io/api/";
// Caixa do Brasil (lon/lat): o Photon não tem `countrycodes`.
const BRAZIL_BBOX = "-74.0,-33.8,-34.7,5.3";

function photonLabel(p: Record<string, string | undefined>): string {
  const street = p.street;
  const streetWithNumber = street ? (p.housenumber ? `${street}, ${p.housenumber}` : street) : null;
  // `name` de um lugar (faculdade, praça); numa rua, o nome é a própria rua.
  const head = p.name && p.name !== street ? p.name : (streetWithNumber ?? p.name);
  const district = p.locality ?? p.district;
  const parts = [head, district, p.city].filter(Boolean);
  return parts.join(" · ");
}

function photonToResults(raw: unknown): GeocodeResult[] {
  const features = (raw as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];

  return features
    .map((entry) => {
      const feature = entry as { properties?: Record<string, string | undefined>; geometry?: { coordinates?: unknown[] } };
      const p = feature.properties ?? {};
      if (p.countrycode && p.countrycode.toUpperCase() !== "BR") return null;
      const [longitude, latitude] = (feature.geometry?.coordinates ?? []).map(Number);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        label: photonLabel(p),
        latitude,
        longitude,
        city: p.city ?? null,
        state: p.state ?? null,
      } satisfies GeocodeResult;
    })
    .filter((r): r is GeocodeResult => r !== null && r.label.length > 0);
}

async function searchNominatim(query: string): Promise<GeocodeResult[]> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(MAX_RESULTS));
  // Restringe ao Brasil: caronas intermunicipais para universitários daqui.
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("accept-language", "pt-BR");

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Nominatim respondeu ${response.status}`);
  return toResults(await response.json());
}

async function searchPhoton(query: string): Promise<GeocodeResult[]> {
  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(MAX_RESULTS));
  url.searchParams.set("bbox", BRAZIL_BBOX);

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Photon respondeu ${response.status}`);
  return photonToResults(await response.json());
}

/**
 * Exige um JWT de usuário no Authorization. A publishable key passa pelo
 * gateway mas não é um JWT de usuário: getUser a rejeita, que é o ponto.
 */
async function requireUser(req: Request): Promise<{ id: string } | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const user = await requireUser(req);
  if (!user) {
    return json(
      { error: "unauthorized", message: "Entre na sua conta para buscar endereços." },
      401,
    );
  }

  let query: string;
  try {
    const body = await req.json();
    query = normalizeQuery(String(body?.query ?? ""));
  } catch {
    return json({ error: "invalid_body", message: "Corpo da requisição inválido." }, 400);
  }

  if (query.length < MIN_QUERY_LENGTH) {
    // Não é erro: o app chama a cada tecla digitada. Devolver lista vazia é
    // mais simples para o cliente do que tratar um 400 a cada letra.
    return json({ results: [], source: "too_short" }, 200);
  }

  // 1) Cache ainda válido?
  const { data: cached, error: cacheError } = await admin
    .from("geocode_cache")
    .select("results, created_at")
    .eq("query", query)
    .maybeSingle();

  if (cacheError) {
    console.error("leitura do cache falhou", cacheError);
    // Segue para o Nominatim: cache indisponível não deve derrubar a busca.
  }

  if (cached) {
    const ageMs = Date.now() - new Date(cached.created_at as string).getTime();
    if (ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) {
      // Aguardado de propósito: promise solta pode ser cortada quando o
      // runtime encerra a invocação. É um UPDATE por índice primário, custa
      // pouco, e falha aqui não derruba a resposta.
      const { error: touchError } = await admin.rpc("touch_geocode_cache", { p_query: query });
      if (touchError) console.error("touch_geocode_cache falhou", touchError);

      return json({ results: cached.results, source: "cache" }, 200);
    }
  }

  // 2) Consulta o Nominatim; se ele recusar ou cair, o Photon.
  let results: GeocodeResult[];
  let source = "nominatim";
  try {
    results = await searchNominatim(query);
  } catch (nominatimError) {
    console.error("Nominatim falhou", String(nominatimError));
    try {
      results = await searchPhoton(query);
      source = "photon";
    } catch (photonError) {
      console.error("Photon falhou", String(photonError));
      return json(
        {
          error: "geocoder_unavailable",
          message: "A busca de endereços está indisponível. Tente novamente em instantes.",
        },
        502,
      );
    }
  }

  // 3) Grava no cache. Resultado vazio também é cacheado: repetir uma busca
  //    que não achou nada não deveria custar outra chamada externa.
  const { error: writeError } = await admin
    .from("geocode_cache")
    .upsert(
      { query, results, hit_count: 0, created_at: new Date().toISOString(), last_used_at: new Date().toISOString() },
      { onConflict: "query" },
    );

  if (writeError) console.error("escrita no cache falhou", writeError);

  return json({ results, source }, 200);
});
