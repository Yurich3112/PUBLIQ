import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { navbarAtTop, navigationActive, pageBreadcrumbs, primaryNavigation, secondaryNavigation } from '../../apps/web/src/config/navigation.ts';

test('navigation visibility keeps UDIP workflows focused and administration behind the server role decision', () => {
  assert.deepEqual(primaryNavigation(false, false).map(item => item.href), ['/']);
  assert.deepEqual(primaryNavigation(false, true).map(item => item.href), ['/', '/kalendarz', '/ocr']);
  assert.deepEqual(primaryNavigation(true, true).map(item => item.href), ['/', '/kalendarz', '/ocr', '/admin/knowledge']);
  assert.equal(secondaryNavigation('/admin', false), null);
  assert.equal(secondaryNavigation('/administrator', true), null);
  assert.equal(secondaryNavigation('/admin/', true).items[0].href, '/admin/knowledge');
  assert.equal(secondaryNavigation('/admin/users', false), null);
  assert.deepEqual(secondaryNavigation('/admin/users', true).items.map(item => item.href), ['/admin/knowledge', '/admin/users', '/admin/monitoring']);
  assert.equal(secondaryNavigation('/admin/files', false), null);
  assert.equal(navigationActive('/admin/users', secondaryNavigation('/admin/users', true).items[0]), false);
  assert.equal(navigationActive('/admin/users', secondaryNavigation('/admin/users', true).items.find(item => item.href === '/admin/users')), true);
});

test('active routes respect segment boundaries, exact home and trailing slashes', () => {
  const items = primaryNavigation(true, true);
  const home = items.find(item => item.href === '/');
  const adminKnowledge = items.find(item => item.href === '/admin/knowledge');
  assert.equal(navigationActive('/', home), true);
  assert.equal(navigationActive('/admin', home), false);
  assert.equal(navigationActive('/admin/', adminKnowledge), true);
  assert.equal(navigationActive('/admin/knowledge', adminKnowledge), true);
  assert.equal(navigationActive('/admin/users', adminKnowledge), true);
  assert.equal(navigationActive('/administrator', adminKnowledge), false);
});

test('contextual gallery links point to existing sections and breadcrumbs use known translated routes', async () => {
  const source = await readFile('apps/web/src/app/[locale]/test/components-gallery.tsx', 'utf8');
  for (const item of secondaryNavigation('/test', false).items) assert.ok(source.includes(`id="${item.href.split('#')[1]}"`));
  assert.deepEqual(pageBreadcrumbs('/'), []);
  assert.deepEqual(pageBreadcrumbs('/kalendarz'), [{ label: 'home', href: '/' }, { label: 'calendar' }]);
  assert.deepEqual(pageBreadcrumbs('/ocr'), [{ label: 'home', href: '/' }, { label: 'ocr' }]);
  assert.deepEqual(pageBreadcrumbs('/ocr/pokaz'), [{ label: 'home', href: '/' }, { label: 'ocr', href: '/ocr' }, { label: 'ocrShow' }]);
  assert.deepEqual(pageBreadcrumbs('/sprawy/test-uuid'), [{ label: 'home', href: '/' }, { label: 'calendar', href: '/kalendarz' }, { label: 'caseDetail' }]);
  assert.deepEqual(pageBreadcrumbs('/admin/'), [{ label: 'home', href: '/' }, { label: 'admin' }]);
  assert.deepEqual(pageBreadcrumbs('/admin/knowledge'), [{ label: 'home', href: '/' }, { label: 'admin', href: '/admin/knowledge' }, { label: 'knowledge' }]);
  assert.deepEqual(pageBreadcrumbs('/admin/users/'), [{ label: 'home', href: '/' }, { label: 'admin', href: '/admin/knowledge' }, { label: 'users' }]);
  assert.deepEqual(pageBreadcrumbs('/admin/monitoring/'), [{ label: 'home', href: '/' }, { label: 'admin', href: '/admin/knowledge' }, { label: 'monitoring' }]);
  assert.deepEqual(pageBreadcrumbs('/test#gallery-buttons'), [{ label: 'home', href: '/' }, { label: 'gallery' }]);
  assert.deepEqual(pageBreadcrumbs('/unknown/private-identifier'), []);
});

test('navbar scroll thresholds resist oscillation when the sticky header changes height', () => {
  assert.equal(navbarAtTop(true, 0), true);
  assert.equal(navbarAtTop(true, 72), false);
  assert.equal(navbarAtTop(false, 52), false);
  assert.equal(navbarAtTop(false, 8), true);
  assert.equal(navbarAtTop(true, 28), true);
});
