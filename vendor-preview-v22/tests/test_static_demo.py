"""Standard-library CI tests for the NON-TRANSACTIONAL offline FAQ demo.

No external service, secret, data store, real account, AI provider or bot is used.
These checks are static. They do not certify live-site behavior.
"""

import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


def contents(relative):
    return (ROOT / relative).read_text(encoding='utf-8')


class StandaloneDemoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = contents('public/index.html')
        cls.js = contents('public/assets/app.js')
        cls.css = contents('public/assets/style.css')
        cls.manifest = json.loads(contents('public/health.json'))
        cls.blueprint = contents('render.yaml')
        cls.robots = contents('public/robots.txt')

    def test_complete_static_site(self):
        for relative in ('public/index.html', 'public/404.html', 'public/assets/style.css',
                         'public/assets/app.js', 'public/health.json',
                         'public/robots.txt'):
            with self.subTest(relative=relative):
                self.assertGreater((ROOT / relative).stat().st_size, 10)

    def test_brand_and_explicit_demo_label(self):
        self.assertIn('MASTER7 — Demo Preview', self.page)
        self.assertIn('演示版本', self.page)
        self.assertIn('真实 AI', self.page)

    def test_external_local_assets_present(self):
        self.assertIn('href="/assets/style.css"', self.page)
        self.assertIn('src="/assets/app.js"', self.page)
        self.assertNotRegex(self.page, r'<style\b|<script\s*>|\sstyle\s*=')
        self.assertNotIn('unsafe-inline', self.page)

    def test_site_disallows_network_connections(self):
        self.assertIn("connect-src 'none'", self.page)
        self.assertIn("connect-src 'none'", self.blueprint)
        self.assertNotRegex(self.js, r'\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b')
        self.assertNotRegex(self.page, r'<form\b|<iframe\b')

    def test_three_localized_languages(self):
        self.assertIn('value="zh"', self.page)
        self.assertIn('value="ms"', self.page)
        self.assertIn('value="en"', self.page)
        for locale in ('zh:', 'ms:', 'en:'):
            with self.subTest(locale=locale):
                self.assertIn(locale, self.js)
        self.assertIn("document.documentElement.lang=lang", self.js)

    def test_accessibility_hooks(self):
        for attribute in ('id="skip-link"', 'id="main-content"',
                          'aria-live="polite"', 'id="language"'):
            with self.subTest(attribute=attribute):
                self.assertIn(attribute, self.page)

    def test_health_is_demo_only(self):
        self.assertEqual(self.manifest['status'], 'ok')
        self.assertEqual(self.manifest['version'], '2.2.0')
        self.assertIs(self.manifest['live_ai'], False)


    def test_faq_reset_is_multilingual_and_local(self):
        for phrase in ('重置演示对话', 'Mulakan semula sembang demo',
                       'Reset demo conversation', "className='reset-demo'"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.js)
        self.assertIn("messages.replaceChildren();addMessage(t.hi,'agent')", self.js)
        self.assertIn('while(messages.children.length>15)', self.js)
        self.assertIn("quick.querySelectorAll('.faq-question').length", self.js)

    def test_accessible_static_error_page(self):
        error_page = contents('public/404.html')
        for expected in ('404 · 页面未找到', 'href="/"',
                         'lang="ms"', 'lang="en"',
                         'noindex, nofollow', '独立技术演示'):
            with self.subTest(expected=expected):
                self.assertIn(expected, error_page)
        self.assertNotRegex(error_page, r'<form\b|<iframe\b')

    def test_no_search_indexing(self):
        self.assertIn('Disallow: /', self.robots)
        self.assertIn('noindex, nofollow', self.blueprint)

    def test_one_isolated_static_service(self):
        self.assertEqual(len(re.findall(r'^  - type: web$', self.blueprint, re.M)), 1)
        self.assertIn('runtime: static', self.blueprint)
        self.assertIn('staticPublishPath: ./public', self.blueprint)
        self.assertIn('autoDeployTrigger: checksPass', self.blueprint)
        self.assertNotRegex(self.blueprint, r'(?m)^databases:|^envVarGroups:|^\s*envVars:')

    def test_nontransactional_scoping(self):
        self.assertIn('无客户账号', self.page)
        self.assertIn('没有连接正式平台', self.js)
        self.assertIn('无真实 AI', contents('README-DEPLOY.md'))


if __name__ == '__main__':
    unittest.main()
