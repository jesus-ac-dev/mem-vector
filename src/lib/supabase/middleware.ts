import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/chat', '/kanban', '/knowledge', '/daily', '/grupos'];

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
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;
    const isProtected = PROTECTED.some((p) => path.startsWith(p));

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

    if (!user && isProtected) return redirecionar('/login');
    if (user && path === '/login') return redirecionar('/chat');

    return response;
}
