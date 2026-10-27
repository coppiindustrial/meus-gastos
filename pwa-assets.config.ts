import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // PNG com todas as cores: a compressão padrão (paleta reduzida) escurecia o degradê do fundo.
    png: { compressionLevel: 9 },
    // O icon.svg já tem o fundo e a margem certos (o logo cabe na área segura do Android).
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#000000' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#000000' } },
  },
  images: ['public/icon.svg'],
});
