#!/usr/bin/env node
/* lore 快照更新器：有意修改设定集后运行本命令刷新基线
 * 用法：node tools/update-lore-snapshot.mjs
 * 说明：smoke.mjs 会比对 tools/lore-snapshot.json 的哈希与当前卡库
 * 设定集——防止 lore 文本被静默改写。 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const sb = { window: {} };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'pixel-tavern', 'cards.js'), 'utf8'), sb);
const chars = sb.window.PT_CARD_CHARACTERS || [];
if (!chars.length) { console.error('cards.js 为空——先运行 node tools/build-cards.mjs'); process.exit(1); }

const snap = chars.map(c => ({ id: c.id, lore: (c.lore || []).map(e => ({ keys: e.keys, title: e.title, text: e.text, core: !!e.core })) }));
const hash = crypto.createHash('sha256').update(JSON.stringify(snap)).digest('hex').slice(0, 16);
const out = path.join(__dirname, 'lore-snapshot.json');
fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), hash, snapshot: snap }, null, 2));
console.log('lore 快照已更新 →', path.relative(ROOT, out), 'hash:', hash);
