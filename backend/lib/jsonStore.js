'use strict';

const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function safeReadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const txt = fs.readFileSync(file, 'utf8');
    if (!txt) return fallback;
    const obj = JSON.parse(txt);
    return obj ?? fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(file, obj) {
  try {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.warn('Opozorilo: zapis closed-tasks ni uspel:', e && e.message ? e.message : String(e));
  }
}

module.exports = {
  ensureDir,
  safeReadJson,
  safeWriteJson,
};
