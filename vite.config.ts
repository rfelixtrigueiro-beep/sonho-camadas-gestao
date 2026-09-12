import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const githubPagesBase = process.env.GITHUB_PAGES === 'true' && repositoryName && !repositoryName.endsWith('.github.io')
  ? `/${repositoryName}/`
  : '/';

export default defineConfig({base:githubPagesBase,css:{postcss:{plugins:[tailwindcss()]}},plugins:[vinext()]});
