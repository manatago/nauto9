import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      '.smoke/**',
      '.dev-data/**',
      '.smoke-data/**',
      'scripts/**', // throwaway smoke scripts
      '*.config.*'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Advisory (perf hints), not bugs — keep visible but non-blocking.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn'
    }
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Full-width spaces are intentional in Japanese UI text.
      'no-irregular-whitespace': [
        'error',
        { skipStrings: true, skipTemplates: true, skipComments: true, skipJSXText: true }
      ],
      'preserve-caught-error': 'warn'
    }
  }
)
