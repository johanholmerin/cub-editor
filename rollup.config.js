import babel from 'rollup-plugin-babel';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import postcss from 'rollup-plugin-postcss';

export default {
  input: './test/main.js',
  output: {
    dir: 'build',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    resolve(),
    postcss({
      modules: true,
      extract: true
    }),
    babel({
      babelrc: false,
      plugins: [
        ['@babel/plugin-transform-react-jsx', {
          useBuiltIns: true
        }]
      ]
    }),
    commonjs()
  ]
};
