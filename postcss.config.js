import { fileURLToPath } from 'url';
import path from 'path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Resolve o tailwind.config.js pelo caminho deste arquivo (independe do cwd).
const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: [
    tailwindcss(path.join(dir, 'tailwind.config.js')),
    autoprefixer,
  ],
};
