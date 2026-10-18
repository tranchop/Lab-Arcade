// Cliente Supabase (somente front-end, via CDN). GitHub Pages não tem variáveis de ambiente:
// URL e chave anon do projeto 'lab-arcade' (para outro projeto, troque os dois valores). A chave "anon" é pública por design — o acesso é só pelas funções
// lab_get/lab_put (supabase/schema.sql), que exigem o código secreto do link.
const SUPABASE_URL = 'https://wyaheharcxagixcaaocz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5YWhlaGFyY3hhZ2l4Y2Fhb2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNDMwMDEsImV4cCI6MjEwNzkxOTAwMX0.zZNOHn_bNfIWPCMxFQj8cfTuvs9dW_GHwgb5rq8cmjw'; // anon (pública)

// Versão fixa do SDK. Import dinâmico: se a CDN estiver inacessível (lab sem internet),
// o app continua funcionando só com localStorage.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

export const isConfigured =
  !SUPABASE_URL.startsWith('YOUR_') && !SUPABASE_ANON_KEY.startsWith('YOUR_');

let clientPromise = null;

/** Retorna o cliente Supabase, ou null se não configurado / SDK indisponível. */
export function getClient() {
  if (!isConfigured) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import(SDK_URL)
      .then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          realtime: { params: { eventsPerSecond: 5 } },
        })
      )
      .catch((err) => {
        console.warn('[supabase] SDK indisponível, seguindo offline', err);
        clientPromise = null; // permite nova tentativa quando a rede voltar
        return null;
      });
  }
  return clientPromise;
}
