const { execSync } = require('node:child_process');
const pkg = require('./package.json');

let gitSha = '';
try {
  gitSha = execSync('git rev-parse --short HEAD', {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
} catch {
  // git 정보 못 읽으면 빈 문자열
}

/** @type {import('next').NextConfig} */
module.exports = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
};
