// Generates PNG icons from public/icon.svg. Run with: npm run icons
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const pub = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url))
const master = await readFile(pub('icon.svg'), 'utf8')
const fullBleed = master
  .replace('rx="113"', 'rx="0"')
  .replace('<g id="art">', '<g id="art" transform="translate(256 256) scale(0.8) translate(-256 -256)">')
const png = (svg, size) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png()

await png(master, 192).toFile(pub('icon-192.png'))
await png(master, 512).toFile(pub('icon-512.png'))
await png(master, 32).toFile(pub('favicon-32.png'))
await png(fullBleed, 512).toFile(pub('icon-maskable-512.png'))
await png(fullBleed, 180).flatten({ background: '#15803d' }).toFile(pub('apple-touch-icon.png'))
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><path d="M12 26h48l-6 30a6 6 0 0 1-6 5H24a6 6 0 0 1-6-5z" fill="#fff"/><path d="M22 26c0-12 6-19 14-19s14 7 14 19" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`
await png(badge, 72).toFile(pub('badge-72.png'))
console.log('icons written to public/')
