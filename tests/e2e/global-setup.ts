import { execSync } from 'node:child_process';
export default function buildProductionApp() {
  execSync('npm run build', { stdio: 'inherit' });
}
