import terser from '@rollup/plugin-terser';

export default {
  input: 'src/core/main.js',
  external: [
    'qjs:std',
    'qjs:os',
    'cctmc:sources',
    'cctmc:winproc',
    'cctmc:mininet'
  ],

  output: {
    file: 'dist/core.js',
    format: 'esm',
    sourcemap: false,
  },

  plugins: [
    terser({
      ecma: 2020,
      module: true,
      toplevel: true,
      compress: {
        passes: 3,
        dead_code: true,
        unsafe_arrows: true
      },
      output: {
        comments: false 
      }
    }),
  ],
};