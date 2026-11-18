import fs from 'node:fs';

const css = fs.readFileSync('public/pixel-tavern/style.css', 'utf8');

const requiredTheaterRules = [
    '--panel-glass-deep',
    '.view[data-view="chat"]',
    '#chat-header',
    '#chat-form',
    '.option-chip',
    '.msg-body .quote',
    '.msg-body .act'
];

const missing = [];
for (const rule of requiredTheaterRules) {
    if (!css.includes(rule)) {
        missing.push(rule);
    }
}

if (missing.length > 0) {
    console.error('FAIL: Missing required theater rules in CSS:', missing);
    process.exit(1);
}

console.log('PASS: Theater chat rules and structure verified.');
