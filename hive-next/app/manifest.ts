import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hive — Creative Business OS',
    short_name: 'Hive',
    description: 'Business workspace for creative studios.',
    id: '/',
    start_url: '/studio',
    lang: 'de-CH',
    display: 'standalone',
    background_color: '#0d1424',
    theme_color: '#0d1424',
    orientation: 'any',
    scope: '/',
    categories: ['business', 'productivity'],
    icons: [
      {src:'/icons/hive-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/icons/hive-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/hive-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
