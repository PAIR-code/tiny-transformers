// vite.config.js
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        '00-train-ab': resolve(__dirname, '00-train-ab/index.html'),
        '01-train-ab-accuracy': resolve(__dirname, '01-train-ab-accuracy/index.html'),
        '02-dead-relu': resolve(__dirname, '02-dead-relu/index.html'),
        '03-one-input': resolve(__dirname, '03-one-input/index.html'),
        '04-pos-encoding': resolve(__dirname, '04-pos-encoding/index.html'),
      }
    }
  }
})
