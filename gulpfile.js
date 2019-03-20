const fs = require('fs');
const { Transform } = require('stream');
const gulp = require('gulp');
const rename = require('gulp-rename');
const uglify = require('gulp-uglify-es').default;
const source = require('vinyl-source-stream');
const sourcemaps = require('gulp-sourcemaps');
const buffer = require('vinyl-buffer');
const resolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');
const rollup = require('rollup-stream');
const browserify = require('browserify');
const tar = require('gulp-tar');
const log = require('gulplog');
const merge = require('merge-stream');

const removeUnnecessaryModuleExports = require('./gulp/rollup-plugin-remove-unnecessary-module-exports');

const metadata = (() => {
  try {
    return JSON.parse(fs.readFileSync('./src/manifest.json', { encoding: 'utf8' }));
  } catch (error) {
    log.error(`Couldn't read ./src/manifest.json.`);
    throw error;
  }
})();

const packageName = dev => metadata.version
  ? `${metadata.name}-${metadata.version}-${dev ? 'dev' : 'prod'}.tar`
  : `${metadata.name}-${dev ? 'dev' : 'prod'}.tar`;

const mainExists = (() => {
  try {
    fs.accessSync('./src/main', fs.constants.R_OK);
    return true;
  } catch (error) {
    log.warn(`Couldn't read ./src/main.`, error);
    return false;
  }
})();

const pagesNames = (() => {
  try {
    return fs.readdirSync('./src/pages', { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (error) {
    return [];
  }
})();

class TransformManifest extends Transform {
  constructor(options) {
    super({
      ...options,
      objectMode: true
    });
  }

  _transform(vinyl, encoding, cb) {
    const metadata = JSON.parse(vinyl.contents.toString());

    metadata.mainScript = 'main.js';

    metadata.pages = metadata.pages || {};
    for (const page of pagesNames) {
      metadata.pages[page] = {
        template: `pages/${page}.html`,
        scripts: [`pages/${page}.js`]
      };
    }

    const newVinyl = vinyl.clone({ contents: false });
    newVinyl.contents = Buffer.from(JSON.stringify(metadata, null, 2));
    cb(null, newVinyl);
  }
}

function task(options = {}) {
  const { dev = true } = options;

  return function () {
    const manifest = gulp.src('./src/manifest.json')
      .pipe(new TransformManifest)
      .pipe(rename('manifest.json'));

    const main = (() => {
      if (!mainExists) {
        return null;
      }

      let stream = rollup({
        input: './src/main/index.js',
        sourcemap: dev,
        format: 'cjs',
        plugins: [
          resolve(),
          commonjs({ ignore: ['events'] }),
          removeUnnecessaryModuleExports()
        ]
      })
      .pipe(source('main.js'))
      .pipe(buffer())
      .pipe(sourcemaps.init({ loadMaps: true }));

      if (!dev) {
        stream = stream.pipe(uglify());
      }

      return stream.pipe(sourcemaps.write());
    })();

    const pages = pagesNames.map(page => {
      const template = gulp
        .src(`./src/pages/${page}/index.html`)
        .pipe(rename(`pages/${page}.html`));

      const script = (() => {
        let stream = browserify({
          entries: `./src/pages/${page}/index.js`,
          debug: dev
        }).bundle()
        .pipe(source(`pages/${page}.js`))
        .pipe(buffer())
        .pipe(sourcemaps.init({ loadMaps: true }));

        if (!dev) {
          stream = stream.pipe(uglify());
        }

        return stream.pipe(sourcemaps.write());
      })();

      return [template, script];
    }).flat();

    return merge(
      manifest,
      ...main ? [main] : [],
      ...pages
    )
    .pipe(tar(packageName(dev)))
    .pipe(gulp.dest('./dist'));
  }
}

gulp.task('prod', task({ dev: false }));
gulp.task('dev', function () {
  gulp.watch('src/**/*', { ignoreInitial: false }, gulp.task('build:dev'));
});
gulp.task('build:dev', task({ dev: true }));
