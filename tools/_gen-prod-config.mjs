/* 一次性脚本：从根 config.yaml 生成 deploy/config/config.yaml 生产预设 */
import fs from 'node:fs';

let s = fs.readFileSync('config.yaml', 'utf8');
const put = (k, v) => {
    const re = new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':.*$', 'm');
    if (!re.test(s)) { console.error('MISSING KEY: ' + k); process.exitCode = 1; return; }
    s = s.replace(re, k + ': ' + v);
};
put('listen', 'true');
put('whitelistMode', 'false');
put('basicAuthMode', 'false');
put('enableCorsProxy', 'false');
put('securityOverride', 'false');
put('allowKeysExposure', 'false');
put('enableServerPlugins', 'false');
put('enableServerPluginsAutoUpdate', 'false');
put('enableUserAccounts', 'false');
put('disableCsrfProtection', 'false');
/* browserLaunch 在服务器上无意义 */
s = s.replace(/^browserLaunch:\n(?:  .*\n)*/m, 'browserLaunch:\n  enabled: false\n  browser: default\n  hostname: auto\n  port: -1\n  avoidLocalhost: false\n');
fs.writeFileSync('deploy/config/config.yaml', s);
console.log('written deploy/config/config.yaml');
