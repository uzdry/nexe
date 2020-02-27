import { statAsync } from '../util'

const fs = require('fs'),
  crypto = require('crypto'),
  fd = fs.openSync(process.execPath, 'r'),
  stat = fs.statSync(process.execPath),
  tailSize = Math.min(stat.size, 16000),
  tailWindow = Buffer.from(Array(tailSize))

fs.readSync(fd, tailWindow, 0, tailSize, stat.size - tailSize)

const footerPosition = tailWindow.indexOf('<nexe~~sentinel>')
if (footerPosition == -1) {
  throw 'Invalid Nexe binary'
}

const footer = tailWindow.slice(footerPosition, footerPosition + 64 + 16),
  contentSize = footer.readDoubleLE(16),
  resourceSize = footer.readDoubleLE(24),
  contentHash = footer.slice(32, 32 + 32),
  contentIV = footer.slice(64, 64 + 16),
  contentStart = stat.size - tailSize + footerPosition - resourceSize - contentSize,
  resourceStart = contentStart + contentSize

let resourceWindow = Buffer.from(Array(resourceSize))
fs.readSync(fd, resourceWindow, 0, resourceSize, resourceStart)

// Decrypt entire resources
let key = new Buffer('asdfasdfasdfasdfasdfasdfasdfasdf')
let cipher = crypto.createDecipheriv('aes-256-cbc', key, contentIV)
let decResource = Buffer.concat([cipher.update(resourceWindow), cipher.final()])

Object.defineProperty(
  process,
  '__nexe',
  (function() {
    let nexeHeader: any = null
    return {
      get: function() {
        return nexeHeader
      },
      set: function(value: any) {
        if (nexeHeader) {
          throw new Error('This property is readonly')
        }
        nexeHeader = Object.assign({}, value, {
          blobPath: process.execPath,
          resourceWindow: decResource,
          layout: {
            stat,
            contentSize,
            contentStart,
            resourceSize,
            resourceStart
          }
        })
        Object.freeze(nexeHeader)
      },
      enumerable: false,
      configurable: false
    }
  })()
)

const contentBuffer = Buffer.from(Array(contentSize)),
  Module = require('module')

fs.readSync(fd, contentBuffer, 0, contentSize, contentStart)
fs.closeSync(fd)

const hashedStartup = crypto
  .createHmac('sha256', '<<secret_key>>')
  .update(contentBuffer)
  .digest()

if (contentHash.compare(hashedStartup) !== 0) {
  console.error('Startup was changed!')
  process.exit()
}

new Module(process.execPath, null)._compile(contentBuffer.toString(), process.execPath)
