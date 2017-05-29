<p align="center"><img src="https://cloud.githubusercontent.com/assets/2391349/23598327/a17bb68a-01ee-11e7-8f55-88a5fc96e997.png" /></p>

<p align="center">
  <a href="https://circleci.com/gh/jaredallard/nexe"><img src="https://img.shields.io/circleci/project/jaredallard/nexe.svg" alt="Build Status"></a>
  <a href="https://www.npmjs.com/package/nexe"><img src="https://img.shields.io/npm/dt/nexe.svg" alt="Downloads"></a>
  <a href="https://www.npmjs.com/package/nexe"><img src="https://img.shields.io/npm/v/nexe.svg" alt="Version"></a>
  <a href="https://www.npmjs.com/package/nexe"><img src="https://img.shields.io/npm/l/nexe.svg" alt="License"></a>
</p>

<p align="center"><code>npm i nexe -g</code></p>
<p align="center">Nexe is a command-line utility that compiles your Node.js application into a single executable file.</p>

<p align="center">
  <img src="https://cloud.githubusercontent.com/assets/5818726/26533446/ce19ee5a-43de-11e7-9540-caf7ebd93370.gif"/>
</p>

## Motivation and Features

- Supports production ready ([secure](#security)) builds
- Ability to run multiple applications with *different* node.js runtimes.
- Distribute binaries without needing node / npm.
- Idempotent builds
- Start and deploy faster.
- Lockdown specific application versions, and easily rollback.
- Flexible build pipeline
- Cross platform builds

## Usage

*Note: V2 API is still subject to change. * For v1 see [V1-EOL](https://github.com/nexe/nexe/tree/V1-EOL)

- Existing application bundle:

    `nexe -i ./my-app-bundle.js -o ./my-app.exe`

- Integrated webpack bundling:

  `nexe -i ./my-app.js -o ./my-app.exe --bundle`

  Alternatively a path to a webpack configuration file can be passed in the `--bundle` option

- stdin & stdout interfaces

  `rollup -c | nexe --resource ./public/**/* > my-app.exe`

For more CLI options see: `nexe --help`

## Including Additional Resources

Additional resources can be added to the binary by passing `-r glob/pattern/**/*`. These included files can be read in the application by using `fs.readFile` or `fs.readFileSync`

## Compiling Node

By default `nexe` will attempt to download a pre-built executable. However, some users may want to customize the way node is built, either by changing the flags, providing a different icon, or different executable details. These options are supported out of the box, and subsequent builds with compatible options will result in instant build times.

Nexe also exposes its patching pipeline to the user. This allows limitless and simple patching of node sources prior to compilation.

## Node.js API

Using Nexe Programatically

#### Example


```javascript
const nexe = require('nexe')

nexe.compile({
  input: './my-app-bundle.js'
  output: './my-app.exe'
  patches: [
    async (compiler, next) => {
      await compiler.setFileContentsAsync(
        'lib/new-native-module.js',
        'module.exports = 42'
      )
      return next()
    }
  ]
}).then(() => {
  console.log('success')
})
```

### `options`

 - `input: string`
    - Input bundle file path
    - default: stdin or the current directory's main file (package.json)
 - `output: string`
    - Output executable file path
    - default: same as `name` with an OS specific extension.
 - `target: string`
    - Dash seperated platform-architecture-version. eg. `'win32-ia32-6.10.3'`
    - default: `[process.platform, process.arch, process.version.slice(1)].join('-')`
 - `name: string`
    - Module friendly name of the application
    - default: basename of the input file, or `nexe_${Date.now()}`
 - `version: string`
    - The Node version you're building for
    - default: `process.version.slice(1)`
 - `python: string`
    - On Linux this is the path pointing to your python2 executable
    - On Windows this is the directory where `python` can be accessed
    - default: `null`
 - `flags: Array<string>`
    - Array of node runtime flags to build node with.
    - Example: `['--expose-gc']`
    - default: `[]`
 - `configure: Array<string>`
    - Array of arguments for the node build configure step
    - Example: `['--with-dtrace', '--dest-cpu=x64']`
    - default: `[]`
 - `make: Array<string>`
    - Array of arguments for the node build make step
    - default: `[]`
 - `vcBuild: Array<string>`
    - Array of arguments for the node build step on windows
    - default: `['nosign', 'release']`
 - `snapshot: string`
    - path to a file to be used as the warmup snapshot for the build
    - default: `null`
 - `resources: Array<string>`
    - Array of globs with files to include in the build
    - Example: `['./public/**/*']`
    - default: `[]`
 - `bundle: boolean | string | object`
    - `boolean`: indicating whether integrated bundling should be tried
    - `string`: filepath to user-written webpack configuration
    - `object`: user provided webpack configuration
    - Example: `'./webpack.config.js'`
    - default: `false`
 - `temp: string`
    - Path to use for storing nexe's build files
    - Override in the env with `NEXE_TEMP`
    - default: `./.nexe` in the cwd
 - `ico: string`
    - Path to a user provided icon to be used (Windows only).
 - `rc: object`
    - Settings for patching the noderc configuration file (Windows only).
    - Example: `{ CompanyName: "ACME Corp" }`
    - default: `{}`
 - `clean: boolean`
    - If included, nexe will remove temporary files for accompanying configuration and exit
 - `enableNodeCli: boolean`
    - Enable the original Node CLI (will prevent application cli from working)
    - default: `false`
 - `sourceUrl: string`
    - Provide an alternate url for the node source. Should be a `.tar.gz`
 - `loglevel: string`
    - Set the loglevel, info, silent, or verbose
    - default: `'info'`
 - `padding`
    - Advanced option for controlling the size available in the executable.
    - It must be larger than the bundle + resources in bytes
    - default: 3, 6, 9, 16, 25, or 40 MB sizes are selected automatically.
 - `patches: Array<NexePatch>`
    - Userland patches for patching or modifying node source
    - default: `[]`

### `NexePatch: (compiler: NexeCompiler, next: () => Promise<void>) => Promise<void>`

A patch is just a middleware function that takes two arguments, the `compiler`, and `next`. The compiler is described below, and `next` ensures that the pipeline continues. Its invocation should always be awaited or returned to ensure correct behavior.

### `NexeCompiler`

For examples, see the built in patches: [src/patches](src/patches)

 - `setFileContentsAsync(filename: string, contents: string): Promise<void>`
    - Quickly set a file's contents in node source
 - `replaceInFileAsync(filename: string, ...replaceArgs): Promise<void>`
    - Quickly preform a replace in a file, the rest arguments are passed along to `String.prototype.replace`
 - `readFileAsync (pathInSrc: string): Promise<SourceFile>`
    - Access (or create) a file in the downloaded source.
 - `files: Array<SourceFile>`
    - cache of currently read, modified, or created source files

#### `SourceFile`
  - `contents: string`
  - `filename: string`

## Security
A common use case for Nexe is production deployment. When distributing executables it is important to [sign](https://en.wikipedia.org/wiki/Code_signing) them before distributing. Nexe was designed specifically to not mangle the binary it produces, this allows the checksum and signature of the size and location offsets to be maintained through the code signing process.

## Maintainers

[![Jared Allard](https://avatars.githubusercontent.com/u/2391349?s=130)](https://jaredallard.me/) | [![Caleb Boyd](https://avatars.githubusercontent.com/u/5818726?s=130)](https://github.com/calebboyd) | [![Christopher Karper](https://avatars.githubusercontent.com/u/653156?s=130)](https://github.com/ckarper) | [![Dustin Greif](https://avatars.githubusercontent.com/u/3026298?s=130)](https://github.com/dgreif) |
---|---|---|---
[Jared Allard](https://github.com/jaredallard) | [Caleb Boyd](http://github.com/calebboyd) | [Christopher Karper](https://github.com/ckarper) | [Dustin Greif](https://github.com/dgreif) |

### Former

- [Craig Condon](http://crcn.codes/)
