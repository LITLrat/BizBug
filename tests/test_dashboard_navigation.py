"""Regression: render-time navigation wiring must not break dashboard startup."""
import re
import shutil
import subprocess
from pathlib import Path

import pytest

BASE = Path(__file__).resolve().parents[1]


def test_navigation_binding_uses_select_all_helper():
    script = (BASE / "static" / "app.js").read_text()
    assert "wireCrm();$$('[data-goto]').forEach(" in script
    assert not re.search(r"(?<!\$)\$\(['\"]\[data-goto\]['\"]\)\.forEach", script)


@pytest.mark.skipif(shutil.which("node") is None, reason="Node unavailable")
def test_dashboard_navigation_event_handler_runtime():
    # Exercise the actual deployed wirePage() function in a minimal DOM stub.
    # A mere JS syntax check cannot catch calling forEach() on querySelector().
    code = (BASE / "static" / "app.js").read_text()
    start = code.index("function wirePage(){")
    end = code.index("async function sendChat(", start)
    wire_page = code[start:end]

    script = """
const assert = require('node:assert/strict');
const vm = require('node:vm');
const routes = [];
let crmWired = 0;
const buttons = ['pipeline', 'tasks', 'reports'].map(goto => ({
  dataset: {goto},
  handlers: {},
  addEventListener(type, handler) {this.handlers[type] = handler;}
}));
const context = {
  '$': selector => {
    if (selector === '[data-goto]') throw Error('Used querySelector for navigation');
    return null;
  },
  '$$': selector => selector === '[data-goto]' ? buttons : [],
  wireCrm: () => crmWired++,
  wireIntegrations: () => {},
  switchPage: page => routes.push(page),
  openFollowup: () => {},
  sendChat: () => {},
  resetChat: () => {},
  api: () => {},
  state: {businessId: 'bloom'},
  navigator: {}, location: {origin: 'https://example.invalid'}
};
vm.runInNewContext(""" + repr(wire_page) + """, context);
context.wirePage();
assert.equal(crmWired, 1);
buttons.forEach(button => {
  assert.equal(typeof button.handlers.click, 'function');
  button.handlers.click();
});
assert.deepEqual(routes, ['pipeline', 'tasks', 'reports']);
"""
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
