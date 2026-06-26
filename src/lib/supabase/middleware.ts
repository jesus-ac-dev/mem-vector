import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/chat', '/kanban', '/knowledge', '/daily', '/grupos'];

export function temCookieAuthSupabase(cookies: { name: string }[]): boolean {
    return cookies.some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
}

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;
    const isProtected = PROTECTED.some((p) => path.startsWith(p));
    const temAuthCookie = temCookieAuthSupabase(request.cookies.getAll());

    // Um redirect novo não herda os cookies que o getUser() acima possa ter
    // refrescado no `response`. Sem os copiar, o browser fica com o refresh token
    // já rodado → o pedido seguinte falha o getUser e a sessão "expira" (401).
    // Padrão oficial do Supabase SSR (#174).
    const redirecionar = (pathname: string) => {
        const url = request.nextUrl.clone();
        url.pathname = pathname;
        const r = NextResponse.redirect(url);
        response.cookies.getAll().forEach((c) => r.cookies.set(c));
        return r;
    };

    if (!user && isProtected) {
        // Se ainda há cookies de auth, não "kickar" para /login por uma falha
        // isolada de getUser/refresh em pedidos concorrentes. A RLS continua a
        // proteger dados; este log dá a causa sem expor valores de cookies.
        if (temAuthCookie) {
            console.warn('[auth/middleware] sem user em rota protegida com cookie auth', {
                path,
                getUserError: authError?.message ?? null,
            });
            return response;
        }
        return redirecionar('/login');
    }
    if (user && path === '/login') return redirecionar('/chat');

    return response;
}
