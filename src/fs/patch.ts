import { Stats } from 'fs'
import { Readable } from 'stream'

export interface NexeBinary {
  blobPath: string
  resources: { [key: string]: number[] }
  resourceWindow: Buffer,
  layout: {
    stat: Stats
    resourceStart: number
    contentSize?: number
    contentStart?: number
    resourceSize?: number
  }
}

let originalFsMethods: any = null
let lazyRestoreFs = () => {}

export function toStream(content: Buffer | string) {
  const readable = new Readable({ read() {} })
  readable.push(content)
  readable.push(null)
  return readable
}

function shimFs(binary: NexeBinary, fs: any = require('fs')) {
  if (originalFsMethods !== null) {
    return
  }
  originalFsMethods = Object.assign({}, fs)
  const { blobPath, resources: manifest, resourceWindow } = binary,
    { resourceStart, stat } = binary.layout,
    directories: { [key: string]: { [key: string]: boolean } } = {},
    notAFile = '!@#$%^&*',
    isWin = process.platform.startsWith('win'),
    isString = (x: any): x is string => typeof x === 'string' || x instanceof String,
    noop = () => {},
    path = require('path'),
    baseDir = path.dirname(process.execPath)

  let log = (_: string) => true
  if ((process.env.DEBUG || '').toLowerCase().includes('nexe:require')) {
    log = (text: string) => process.stderr.write('[nexe] - ' + text + '\n')
  }

  const winPath = (key: string) => {
    if (isWin && key.substr(1, 2) === ':\\') {
      key = key[0].toUpperCase() + key.substr(1)
    }
    return key
  }

  const getKey = function getKey(filepath: string | Buffer | null): string {
    if (Buffer.isBuffer(filepath)) {
      filepath = filepath.toString()
    }
    if (!isString(filepath)) {
      return notAFile
    }
    let key = path.resolve(baseDir, filepath)

    return winPath(key)
  }

  const statTime = function() {
    return {
      dev: 0,
      ino: 0,
      nlink: 0,
      rdev: 0,
      uid: 123,
      gid: 500,
      blksize: 4096,
      blocks: 0,
      atime: new Date(stat.atime),
      atimeMs: stat.atime.getTime(),
      mtime: new Date(stat.mtime),
      mtimeMs: stat.mtime.getTime(),
      ctime: new Date(stat.ctime),
      ctimMs: stat.ctime.getTime(),
      birthtime: new Date(stat.birthtime),
      birthtimeMs: stat.birthtime.getTime()
    }
  }

  const createStat = function(extensions: any) {
    return Object.assign(new fs.Stats(), binary.layout.stat, statTime(), extensions)
  }

  const ownStat = function(filepath: any) {
    setupManifest()
    const key = getKey(filepath)
    if (directories[key]) {
      let mode = binary.layout.stat.mode
      mode |= fs.constants.S_IFDIR
      mode &= ~fs.constants.S_IFREG
      return createStat({ mode, size: 0 })
    }
    if (manifest[key]) {
      return createStat({ size: manifest[key][1] })
    }
  }

  function makeLong(filepath: string) {
    return (path as any)._makeLong && (path as any)._makeLong(filepath)
  }

  function fileOpts(options: any) {
    return !options ? {} : isString(options) ? { encoding: options } : options
  }

  let setupManifest = () => {
    Object.keys(manifest).forEach(filepath => {
      const entry = manifest[filepath]
      const absolutePath = getKey(filepath)
      const longPath = makeLong(absolutePath)
      const normalizedPath = winPath(path.normalize(filepath))

      if (!manifest[absolutePath]) {
        manifest[absolutePath] = entry
      }
      if (longPath && !manifest[longPath]) {
        manifest[longPath] = entry
      }
      if (!manifest[normalizedPath]) {
        manifest[normalizedPath] = manifest[filepath]
      }

      let currentDir = path.dirname(absolutePath)
      let prevDir = absolutePath

      while (currentDir !== prevDir) {
        directories[currentDir] = directories[currentDir] || {}
        directories[currentDir][path.basename(prevDir)] = true
        const longDir = makeLong(currentDir)
        if (longDir && !directories[longDir]) {
          directories[longDir] = directories[currentDir]
        }
        prevDir = currentDir
        currentDir = path.dirname(currentDir)
      }
    })
    ;(manifest[notAFile] as any) = false
    ;(directories[notAFile] as any) = false
    setupManifest = noop
  }

  //naive patches intended to work for most use cases
  const nfs: any = {
    existsSync: function existsSync(filepath: string) {
      setupManifest()
      const key = getKey(filepath)
      if (manifest[key] || directories[key]) {
        return true
      }
      return originalFsMethods.existsSync.apply(fs, arguments)
    },
    realpath: function realpath(filepath: any, options: any, cb: any): void {
      setupManifest()
      const key = getKey(filepath)
      if (isString(filepath) && (manifest[filepath] || manifest[key])) {
        return process.nextTick(() => cb(null, filepath))
      }
      return originalFsMethods.realpath.call(fs, filepath, options, cb)
    },
    realpathSync: function realpathSync(filepath: any, options: any) {
      setupManifest()
      const key = getKey(filepath)
      if (manifest[key]) {
        return filepath
      }
      return originalFsMethods.realpathSync.call(fs, filepath, options)
    },
    readdir: function readdir(filepath: string | Buffer, options: any, callback: any) {
      setupManifest()
      const dir = directories[getKey(filepath)]
      if (dir) {
        if ('function' === typeof options) {
          callback = options
          options = { encoding: 'utf8' }
        }
        process.nextTick(() => callback(null, Object.keys(dir)))
      } else {
        return originalFsMethods.readdir.apply(fs, arguments)
      }
    },
    readdirSync: function readdirSync(filepath: string | Buffer, options: any) {
      setupManifest()
      const dir = directories[getKey(filepath)]
      if (dir) {
        return Object.keys(dir)
      }
      return originalFsMethods.readdirSync.apply(fs, arguments)
    },

    readFile: function readFile(filepath: any, options: any, callback: any) {
      setupManifest()
      const entry = manifest[getKey(filepath)]
      if (!entry) {
        return originalFsMethods.readFile.apply(fs, arguments)
      }
      const [offset, length] = entry
      const resourceOffset = resourceStart + offset
      const encoding = fileOpts(options).encoding
      callback = typeof options === 'function' ? options : callback

      //TODO: Here all needs to be
      console.log("readFile", filepath, options, resourceWindow.slice(offset, length))
      return callback(null, resourceWindow.slice(offset, length))
      originalFsMethods.open(blobPath, 'r', function(err: Error, fd: number) {
        if (err) return callback(err, null)
        originalFsMethods.read(fd, Buffer.alloc(length), 0, length, resourceOffset, function(
          error: Error,
          bytesRead: number,
          result: Buffer
        ) {
          if (error) {
            return originalFsMethods.close(fd, function() {
              callback(error, null)
            })
          }
          originalFsMethods.close(fd, function(err: Error) {
            if (err) {
              return callback(err, result)
            }
            callback(err, encoding ? result.toString(encoding) : result)
          })
        })
      })
    },
    createReadStream: function createReadStream(filepath: any, options: any) {
      setupManifest()
      const entry = manifest[getKey(filepath)]
      if (!entry) {
        return originalFsMethods.createReadStream.apply(fs, arguments)
      }
      const [offset, length] = entry
      const resourceOffset = resourceStart + offset
      const opts = fileOpts(options)

      return toStream(resourceWindow.slice(offset, length))
      return originalFsMethods.createReadStream(
        blobPath,
        Object.assign({}, opts, {
          start: resourceOffset,
          end: resourceOffset + length - 1
        })
      )
    },
    readFileSync: function readFileSync(filepath: any, options: any) {
      setupManifest()
      const entry = manifest[getKey(filepath)]
      if (!entry) {
        return originalFsMethods.readFileSync.apply(fs, arguments)
      }
      const [offset, length] = entry
      const resourceOffset = resourceStart + offset
      const encoding = fileOpts(options).encoding
      const fd = originalFsMethods.openSync(process.execPath, 'r')
      const result = Buffer.alloc(length)
      originalFsMethods.readSync(fd, result, 0, length, resourceOffset)
      originalFsMethods.closeSync(fd)
      return encoding ? result.toString(encoding) : result
    },
    statSync: function statSync(filepath: string | Buffer) {
      const stat = ownStat(filepath)
      if (stat) {
        return stat
      }
      return originalFsMethods.statSync.apply(fs, arguments)
    },
    stat: function stat(filepath: string | Buffer, callback: any) {
      const stat = ownStat(filepath)
      if (stat) {
        process.nextTick(() => {
          callback(null, stat)
        })
      } else {
        return originalFsMethods.stat.apply(fs, arguments)
      }
    }
  }

  if (typeof fs.exists === 'function') {
    nfs.exists = function(filepath: string, cb: Function) {
      cb = cb || noop
      const exists = nfs.existsSync(filepath)
      process.nextTick(() => cb(exists))
    }
  }

  const patches = (process as any).nexe.patches || {}
  delete (process as any).nexe
  patches.internalModuleReadFile = function(this: any, original: any, ...args: any[]) {
    const [filepath] = args
    setupManifest()
    if (manifest[filepath]) {
      log('read     (hit)              ' + filepath)
      return nfs.readFileSync(filepath, 'utf-8')
    }
    log('read          (miss)       ' + filepath)
    return original.call(this, ...args)
  }
  patches.internalModuleReadJSON = patches.internalModuleReadFile
  patches.internalModuleStat = function(this: any, original: any, ...args: any[]) {
    setupManifest()
    const [filepath] = args
    if (manifest[filepath]) {
      log('stat     (hit)              ' + filepath + '   ' + 0)
      return 0
    }
    if (directories[filepath]) {
      log('stat dir (hit)              ' + filepath + '   ' + 1)
      return 1
    }
    const res = original.call(this, ...args)
    if (res === 0) {
      log('stat          (miss)        ' + filepath + '   ' + res)
    } else if (res === 1) {
      log('stat dir      (miss)        ' + filepath + '   ' + res)
    } else {
      log('stat                 (fail) ' + filepath + '   ' + res)
    }
    return res
  }

  if (typeof fs.exists === 'function') {
    nfs.exists = function(filepath: string, cb: Function) {
      cb = cb || noop
      const exists = nfs.existsSync(filepath)
      if (!exists) {
        return originalFsMethods.exists(filepath, cb)
      }
      process.nextTick(() => cb(exists))
    }
  }

  if (typeof fs.copyFile === 'function') {
    nfs.copyFile = function(filepath: string, dest: string, flags: number, callback: Function) {
      setupManifest()
      const entry = manifest[getKey(filepath)]
      if (!entry) {
        return originalFsMethods.copyFile.apply(fs, arguments)
      }
      if (typeof flags === 'function') {
        callback = flags
        flags = 0
      }
      nfs.readFile(filepath, (err: any, buffer: any) => {
        if (err) {
          return callback(err)
        }
        originalFsMethods.writeFile(dest, buffer, (err: any) => {
          if (err) {
            return callback(err)
          }
          callback(null)
        })
      })
    }
    nfs.copyFileSync = function(filepath: string, dest: string) {
      setupManifest()
      const entry = manifest[getKey(filepath)]
      if (!entry) {
        return originalFsMethods.copyFileSync.apply(fs, arguments)
      }
      return originalFsMethods.writeFileSync(dest, nfs.readFileSync(filepath))
    }
  }

  Object.assign(fs, nfs)

  lazyRestoreFs = () => {
    Object.keys(nfs).forEach(key => {
      fs[key] = originalFsMethods[key]
    })
    lazyRestoreFs = () => {}
  }
  return true
}

function restoreFs() {
  lazyRestoreFs()
}

export { shimFs, restoreFs }
