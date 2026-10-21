import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Guarda do tema: telas e componentes não inventam visual.
 *
 * Cor, fonte e tamanho de texto só existem em src/theme (ver
 * docs/identidade-visual.md). Se este teste falhar numa tela nova, use os
 * papéis de `colors` e os níveis de `typography` em vez de valores soltos.
 *
 * `Alert.alert` também é barrado: na web ele não faz nada, e a apresentação é
 * na web. Use `ConfirmDialog` (src/components/ConfirmDialog.tsx).
 */

const ROOT = path.resolve(__dirname, '..');
const SCANNED = ['app', 'src'];
const ALLOWED_DIR = path.join(ROOT, 'src', 'theme');

const RULES: { name: string; pattern: RegExp }[] = [
  { name: 'cor em hexadecimal', pattern: /['"`]#[0-9a-fA-F]{3,8}['"`]/ },
  { name: 'cor rgb()/rgba()', pattern: /\brgba?\(/ },
  { name: 'fontFamily fora do tema', pattern: /\bfontFamily\s*:/ },
  { name: 'fontWeight (use typography.*Strong ou fonts.medium)', pattern: /\bfontWeight\s*:/ },
  { name: 'fontSize fora do tema', pattern: /\bfontSize\s*:/ },
  { name: 'itálico (o manual só tem Regular e Medium)', pattern: /fontStyle\s*:\s*['"]italic['"]/ },
  { name: 'Alert.alert (não funciona na web)', pattern: /\bAlert\.alert\s*\(/ },
];

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full === ALLOWED_DIR ? [] : listFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** Remove comentários: explicar uma regra num comentário não é quebrá-la. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = SCANNED.flatMap((dir) => listFiles(path.join(ROOT, dir)));

describe('uso do tema', () => {
  it('encontra os arquivos de tela e componente', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(RULES)('nenhum arquivo fora de src/theme usa $name', ({ pattern }) => {
    const offenders = files.flatMap((file) => {
      const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
      return lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => pattern.test(line))
        .map(({ line, index }) => `${path.relative(ROOT, file)}:${index + 1}  ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });
});
