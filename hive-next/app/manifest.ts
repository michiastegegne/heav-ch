import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hive — Creative Business OS',
    short_name: 'Hive',
    description: 'Business workspace for creative studios.',
    start_url: '/studio',
    display: 'standalone',
    background_color: '#101010',
    theme_color: '#101010',
    orientation: 'any',
    scope: '/',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
