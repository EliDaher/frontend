const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/table-history.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
vm.runInNewContext(output, { exports: exportsObject, Intl, Date });
const { historyDay, historyZone, validHistoryDay, shiftHistoryDay, ordersForHistoryDay } = exportsObject;
assert.equal(historyDay('2026-10-18T21:30:00Z', 'Asia/Damascus'), '2026-10-19');
assert.equal(historyDay('2026-10-18T20:59:59Z', 'Asia/Damascus'), '2026-10-18');
assert.equal(historyZone('invalid'), 'Asia/Damascus');
assert.equal(validHistoryDay('2026-02-30'), false);
assert.equal(validHistoryDay('2024-02-29'), true);
assert.equal(shiftHistoryDay('2026-01-01', -1), '2025-12-31');
const orders = [
 { id: 'before-midnight', tableId: '1', orderedAt: '2026-10-18T20:50:00Z', completedAt: '2026-10-18T22:00:00Z', status: 'COMPLETED' },
 { id: 'later', tableId: 'deleted', orderedAt: '2026-10-18T22:30:00Z', status: 'CANCELLED' },
 { id: 'legacy', tableId: '1', createdAt: '2026-10-18T21:30:00Z', status: 'PENDING' },
 { id: 'takeaway', tableId: '', orderedAt: '2026-10-18T22:30:00Z' },
 { id: 'invalid', tableId: '1', orderedAt: 'invalid' }
];
assert.equal(ordersForHistoryDay(orders, '2026-10-18', 'Asia/Damascus')[0].id, 'before-midnight');
assert.equal(ordersForHistoryDay(orders, '2026-10-19', 'Asia/Damascus').map(o => o.id).join(','), 'later,legacy');
assert.equal(ordersForHistoryDay(orders, '2026-10-20', 'Asia/Damascus').length, 0);
console.log('Table history: date boundaries, fallback dates, order sorting, cancelled and missing tables passed.');
