/*
 * @Author: 卓文理
 * @Email: 531840344@qq.com
 * @Date: 2018-05-23 14:49:30
 */


import babel from 'rollup-plugin-babel';
import replace from 'rollup-plugin-replace';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import copy from 'rollup-plugin-copy-assets';
import sass from 'rollup-plugin-sass';
import sourcemaps from 'rollup-plugin-sourcemaps';
import { uglify } from 'rollup-plugin-uglify';

console.log('isDev:', process.env.NODE_ENV === 'development');

export default {
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
    plugins: [
        resolve(),
        commonjs(),
        sass({
            insert: true
        }),
        babel({
            exclude: 'node_modules/**',
            externalHelpers: false,
            runtimeHelpers: true
        }),
        replace({
            PRODUCTION: process.env.NODE_ENV === 'production'
        }),
        process.env.NODE_ENV === 'production' ? uglify() : sourcemaps(),
        copy({
            assets: [
                './src/assets',
                './src/manifest.json',
                './src/jquery.js'
            ],
        }),
    ],
};

