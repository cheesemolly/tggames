import test from 'node:test';
import assert from 'node:assert/strict';

import { isMobilePlatform } from '../device.js';

test('телефон или компьютер — по Telegram.WebApp.platform', () => {
  for (const name of ['android', 'android_x', 'ios', 'IOS']) assert.equal(isMobilePlatform(name), true, name);
  for (const name of ['tdesktop', 'macos', 'web', 'weba', 'webk', 'unigram', 'unknown', '', undefined]) {
    assert.equal(isMobilePlatform(name), false, `${name}: компьютер — без полного экрана`);
  }
});
