const fs = require('fs'),
  crypto = require('crypto'),
  fd = fs.openSync(process.execPath, 'r'),
  stat = fs.statSync(process.execPath),
  tailSize = Math.min(stat.size, 16000)
let tailWindow = Buffer.from(Array(tailSize))

fs.readSync(fd, tailWindow, 0, tailSize, stat.size - tailSize)

const footerPosition = tailWindow.indexOf('<nexe~~sentinel>')
if (footerPosition == -1) {
  throw 'Invalid Nexe binary'
}

const footer = tailWindow.slice(footerPosition, footerPosition + 32),
  contentSize = footer.readDoubleLE(16),
  resourceSize = footer.readDoubleLE(24),
  contentStart = stat.size - tailSize + footerPosition - resourceSize - contentSize,
  resourceStart = contentStart + contentSize

const key = new Buffer([0x01, 0xde, 0x60, 0x7f, 0xd2, 0xcc, 0xfd, 0x1a, 0x8b, 0x8f, 0x33, 0x05, 0x4a, 0x8b, 0x74, 0xbf, 0x2d, 0xed, 0x81, 0x24, 0xd3, 0x85, 0xd3, 0xbf, 0x04, 0xf1, 0x01, 0xaf, 0x3f, 0x10, 0xbb, 0xd1]);
const iv = crypto.randomBytes(16);
const ciph = crypto.createDecipheriv('aes-256-cbc', key, iv)

let resourceWindow = Buffer.from(Array(resourceSize))
fs.readSync(fd, resourceWindow, 0, resourceSize, resourceStart)
resourceWindow = ciph.update(resourceWindow)

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
          resourceWindow,
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

let contentBuffer = Buffer.from(Array(contentSize))
const Module = require('module')

fs.readSync(fd, contentBuffer, 0, contentSize, contentStart)
fs.closeSync(fd)

contentBuffer = ciph.update(contentBuffer)

new Module(process.execPath, null)._compile(contentBuffer.toString(), process.execPath)
