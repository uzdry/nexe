import { stat as getStat, Stats, readFileSync } from 'fs'
import { relative } from 'path'
import { Readable } from 'stream'
import * as crypto from 'crypto'

const stat = (file: string): Promise<Stats> => {
  return new Promise((resolve, reject) => {
    getStat(file, (err, stats) => (err ? reject(err) : resolve(stats)))
  })
}

function makeRelative(cwd: string, path: string) {
  return './' + relative(cwd, path)
}

export function toStream(content: Buffer | string) {
  const readable = new Readable({ read() {} })
  readable.push(content)
  readable.push(null)
  return readable
}


export type File = { absPath: string; contents: string; deps: FileMap }
export type FileMap = { [absPath: string]: File | null }

export interface BundleOptions {
  entries: string[]
  cwd: string
  expand: boolean
  loadContent: boolean
  files: FileMap
}

export class Bundle {
  constructor({ cwd }: { cwd: string } = { cwd: process.cwd() }) {
    this.cwd = cwd
  }
  cwd: string
  blobSize: number = 0
  index: { [relativeFilePath: string]: [number, number] } = {}
  buffers: Buffer[] = []

  async addResource(absoluteFileName: string, content?: Buffer | string) {
    let length = 0
    if (content !== undefined) {
      length = Buffer.byteLength(content)
    } else {
      const stats = await stat(absoluteFileName)
      length = stats.size
    }

    const start = this.blobSize

    this.blobSize += length
    this.index[makeRelative(this.cwd, absoluteFileName)] = [start, length]
    this.buffers.push(content ? Buffer.from(content as any) :  readFileSync(absoluteFileName))
  }

  getEncryptedBlobSize() {
    return Math.ceil(this.blobSize / 16) * 16
  }

  concat() {
    throw new Error('Not Implemented')
  }

  toStream() {
    let encBuffer = Buffer.concat(this.buffers)
    const key = new Buffer([0x01, 0xde, 0x60, 0x7f, 0xd2, 0xcc, 0xfd, 0x1a, 0x8b, 0x8f, 0x33, 0x05, 0x4a, 0x8b, 0x74, 0xbf, 0x2d, 0xed, 0x81, 0x24, 0xd3, 0x85, 0xd3, 0xbf, 0x04, 0xf1, 0x01, 0xaf, 0x3f, 0x10, 0xbb, 0xd1]);
    const iv = crypto.randomBytes(16);
    const ciph = crypto.createCipheriv('aes-256-cbc', key, iv)
    encBuffer = ciph.update(encBuffer);

    return toStream(encBuffer)
  }

  toJSON() {
    return this.index
  }
}
