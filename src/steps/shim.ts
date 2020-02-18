import { NexeCompiler } from '../compiler'
import { wrap } from '../util'

export default function(compiler: NexeCompiler, next: () => Promise<void>) {
  console.log("=================Compiler binary Config=================", compiler.binaryConfiguration)
  compiler.shims.push(
    wrap(
      `process.__nexe = ${JSON.stringify(compiler.binaryConfiguration)};\n` +
        '{{replace:lib/fs/patch.js}}' +
        '\nshimFs(process.__nexe)' +
        `\n${compiler.options.fs ? '' : 'restoreFs()'}`
      //TODO support only restoring specific methods
    )
  )
  compiler.shims.push(
    wrap(`
    if (process.argv[1] && process.env.NODE_UNIQUE_ID) {
      const cluster = require('cluster')
      cluster._setupWorker()
      delete process.env.NODE_UNIQUE_ID
    }
  `)
  )

  compiler.shims.push(
    wrap(`
      if (!process.send) {
        const path = require('path')
        const entry = path.resolve(path.dirname(process.execPath),${JSON.stringify(
          compiler.entrypoint
        )})
        process.argv.splice(1,0, entry)
      }
    `)
  )

  return next()
}
