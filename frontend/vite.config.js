import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import obfuscator from 'vite-plugin-javascript-obfuscator'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Apply obfuscation only during the build process
    command === 'build' && obfuscator({
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      numbersToExpressions: false,
      simplify: false,
      stringArray: true,
      stringArrayThreshold: 0.75,
      splitStrings: true,
      unicodeEscapeSequence: false
    })
  ].filter(Boolean),
  build: {
    // Output to frontend/dist – Flask serves this via static_folder
    outDir: 'dist',
    sourcemap: false, // Disable source maps for production
  },
}))
