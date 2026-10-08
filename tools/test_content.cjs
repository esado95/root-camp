/* Standalone exercise wording: node tools/test_content.cjs */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'questions/manifest.json'), 'utf8'));
const forbidden = /\bTP\b|\b(?:le|du|au|notre|nos|son|ce|les)\s+cours\b|\b(?:notre|nos|votre|vos)\s+(?:formation|cours|promo)\b|lieu de formation|Formation[\\/]/iu;
const sourceReferences = JSON.parse(fs.readFileSync(path.join(root, 'docs/course-sources.json'), 'utf8'));
const sourceFiles = [...new Set(Object.values(sourceReferences).flatMap(s => s.split(' — ')[0].split(' ; ')))];
let count = 0;
function checkStrings(value, label) {
  if (typeof value === 'string') {
    assert.ok(!forbidden.test(value), label + ': ' + value);
    assert.ok(!sourceFiles.some(name => value.includes(name)), label + ' references a source course file');
  }
  else if (Array.isArray(value)) value.forEach((item, i) => checkStrings(item, label + '[' + i + ']'));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (!['id', 'type', 'niveau', 'answer', 'caseSensitive'].includes(key)) checkStrings(item, label + '.' + key);
    }
  }
}
for (const theme of manifest.themes) for (const mod of theme.modules) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'questions', mod.file), 'utf8'));
  for (const q of data.questions) {
    assert.ok(!Object.hasOwn(q, 'source'), q.id + ' embeds source course in application data');
    checkStrings(q, q.id);
    count++;
  }
}
console.log('PASS: ' + count + ' questions and nested exercise fields contain no references to source courses or training.');
