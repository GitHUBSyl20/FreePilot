/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * Synchronisation cloud : les deux variables sont absentes tant que le projet
 * Supabase n'est pas branché, et l'application reste alors purement locale.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
