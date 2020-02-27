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
  streams: (Readable | (() => Readable))[] = []
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
    this.buffers.push(content ? Buffer.from(content as Buffer) : readFileSync(absoluteFileName))
  }

  encryptedSize() {
    return Math.ceil(this.blobSize / 16) * 16
  }

  concat() {
    throw new Error('Not Implemented')
  }

  toStream() {
    let iv = crypto.randomBytes(16)
    let key = new Buffer('asdfasdfasdfasdfasdfasdfasdfasdf')
    let cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let encResource = Buffer.concat([cipher.update(Buffer.concat(this.buffers)), cipher.final()])

    return { stream: toStream(encResource), iv }
  }

  toJSON() {
    return this.index
  }
}
