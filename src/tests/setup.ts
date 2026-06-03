import '@testing-library/jest-dom/vitest';

// Testes de integração (ex: RLS) precisam das env do Supabase local.
try {
    process.loadEnvFile('.env.local');
} catch {
    // sem .env.local (ex: CI) — os testes que dependem dela tratam disso.
}
