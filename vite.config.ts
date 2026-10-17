import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed at indrekraag.github.io/byu/. The crew-station iPad Air 2 is capped
// at Safari 15.6, so output must not use newer JS or CSS syntax.
export default defineConfig({
  base: '/byu/',
  plugins: [react()],
  build: { target: ['safari15'], cssTarget: ['safari15'] },
})
