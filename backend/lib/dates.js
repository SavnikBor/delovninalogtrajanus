'use strict';

function toYmd(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValidYmd(value) {
  const ymd = toYmd(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = new Date(`${ymd}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function toHm(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function isValidMonthStr(s) {
  if (!s || typeof s !== 'string') return false;
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return false;
  const mm = parseInt(m[2], 10);
  return mm >= 1 && mm <= 12;
}

function monthStrToDateStart(s) {
  const [y, m] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

function dateToMonthStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

module.exports = {
  toYmd,
  isValidYmd,
  toHm,
  isValidMonthStr,
  monthStrToDateStart,
  dateToMonthStr,
  isValidDateStr,
};
