/*
 * @Author: 卓文理
 * @Email: 531840344@qq.com
 * @Date: 2018-05-23 14:49:30
 */


import babel from 'rollup-plugin-babel';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import copy from 'rollup-plugin-copy-assets';
import postcss from 'rollup-plugin-postcss';
import sourcemaps from 'rollup-plugin-sourcemaps';
import { uglify } from 'rollup-plugin-uglify';
import imageBase64 from 'rollup-plugin-image-base64';

console.log('isDev:', process.env.NODE_ENV === 'development');

const plugins = [
    resolve(),
    commonjs(),
    imageBase64(),
    postcss({
        extract: true,
        use: ['sass'],
    }),
    babel({
        exclude: 'node_modules/**',
        externalHelpers: false,
        runtimeHelpers: true
    }),
    copy({
        assets: [
            './src/assets',
            './src/manifest.json',
            './src/jquery.js'
        ],
    }),
    process.env.NODE_ENV === 'production' ? uglify() : sourcemaps(),
];

export default [
    {
        input: 'src/microhub.js',
        output: {
            format: 'es',
            file: 'dist/microhub.js',
            sourcemap: process.env.NODE_ENV === 'development',
        },
        watch: {
            include: 'src/**'
        },
        external: ['jquery'],
        plugins,
    },
    {
        input: 'src/clippy.js',
        output: {
            format: 'es',
            file: 'dist/clippy.js',
            sourcemap: process.env.NODE_ENV === 'development',
        },
        watch: {
            include: 'src/**'
        },
        external: ['jquery'],
        plugins,
    }
];

