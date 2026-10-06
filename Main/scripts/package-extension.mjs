import { readdir, readFile, copyFile, writeFile, mkdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { deflateRawSync } from 'node:zlib'

const root = process.cwd()
const dist = resolve(root, 'dist')
await copyFile(join(root, 'manifest.json'), join(dist, 'manifest.json'))
await copyFile(join(root, 'background.js'), join(dist, 'background.js'))
await mkdir(join(dist, 'views'), { recursive: true })
await copyFile(join(root, 'src/data/mind_palace.json'), join(dist, 'views/mind_palace.json'))
await copyFile(join(root, 'src/data/bug_bounty_mind_map.json'), join(dist, 'views/bug_bounty_mind_map.json'))
await mkdir(join(dist, 'icons'), { recursive: true })
for (const icon of ['icon16.png', 'icon18.png', 'icon128.png']) {
  await copyFile(join(root, 'public/icons', icon), join(dist, 'icons', icon))
}

const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'))
if (manifest.manifest_version !== 3 || !manifest.background?.scripts?.every((name) => name === 'background.js')) {
  throw new Error('The extension manifest is missing the Firefox MV3 background script.')
}
const iconPaths = [...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]
for (const asset of [...iconPaths, ...manifest.background.scripts, 'index.html', 'views/mind_palace.json', 'views/bug_bounty_mind_map.json']) {
  await readFile(join(dist, asset))
}
for (const [size, asset] of Object.entries(manifest.icons)) {
  const png = await readFile(join(dist, asset))
  if (png.toString('ascii', 1, 4) !== 'PNG' || png.readUInt32BE(16) !== Number(size) || png.readUInt32BE(20) !== Number(size)) {
    throw new Error(`Icon ${asset} must be a ${size}x${size} PNG.`)
  }
}

const files = []
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await collect(path)
    else files.push(path)
  }
}
await collect(dist)

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  crcTable[n] = c >>> 0
}
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const localParts = []
const centralParts = []
let offset = 0
for (const file of files) {
  const name = relative(dist, file).replaceAll('\\', '/')
  const nameBytes = Buffer.from(name, 'utf8')
  const data = await readFile(file)
  const compressed = deflateRawSync(data, { level: 9 })
  const checksum = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0800, 6)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(checksum, 14)
  local.writeUInt32LE(compressed.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBytes.length, 26)
  localParts.push(local, nameBytes, compressed)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(checksum, 16)
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBytes.length, 28)
  central.writeUInt32LE(offset, 42)
  centralParts.push(central, nameBytes)
  offset += local.length + nameBytes.length + compressed.length
}

const centralDirectory = Buffer.concat(centralParts)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralDirectory.length, 12)
end.writeUInt32LE(offset, 16)

const xpi = resolve(root, 'mind-palace.xpi')
await writeFile(xpi, Buffer.concat([...localParts, centralDirectory, end]))
console.log(`Packaged ${files.length} files into ${xpi}`)
