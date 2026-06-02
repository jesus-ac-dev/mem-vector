import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            // Supabase Storage (produção)
            { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/**' },
            // Supabase Storage (dev local — supabase start)
            { protocol: 'http', hostname: '127.0.0.1', pathname: '/storage/v1/object/**' },
            { protocol: 'http', hostname: 'localhost', pathname: '/storage/v1/object/**' },
        ],
    },
};

export default nextConfig;
