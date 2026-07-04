import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig, globalIgnores } from 'eslint/config';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const syntaxRules = [
  {
    selector: 'JSXOpeningElement[name.name="head"]',
    message:
      '禁止使用 head 标签，优先使用 metadata。三方 CSS、字体等资源可以在 globals.css 中顶部通过 @import 引入或者使用 next/font；preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入；json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld',
  },
];

const eslintConfig = defineConfig([
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'no-restricted-syntax': ['error', ...syntaxRules],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Build artifacts:
    'server.js',
    'dist/**',
    'output/**',
    '**/*.min.js',
    'playwright-report/**',
    'test-results/**',
    // Script files (CommonJS):
    'scripts/**/*.js',
  ]),
]);

export default eslintConfig;
