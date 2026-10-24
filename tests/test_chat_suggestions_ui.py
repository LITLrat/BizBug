"""Regression tests for contextual suggestions in the assistant playground."""

from pathlib import Path
import shutil
import subprocess

import pytest


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not available")
def test_playground_only_displays_contextual_suggestions():
    source = (Path(__file__).resolve().parents[1] / "static" / "app.js").read_text()
    start = source.index("function visibleChatOptions(){")
    end = source.index("\nfunction chatCard()", start)
    helper = source[start:end]

    script = """
const assert = require('node:assert/strict');
const state = {
  uiLanguage: 'en',
  chatOptions: [],
  chatMessages: [{role: 'assistant', text: 'Welcome!'}]
};
""" + helper + """
assert.deepEqual(visibleChatOptions(),
  ['What are your hours?', 'Book appointment', 'Leave a message']);

// Server-provided choices (such as services or time slots) remain visible.
state.chatMessages.push({role: 'user', text: 'Book appointment'});
state.chatOptions = ['SERVICE::AC repair', 'SERVICE::AC installation'];
assert.deepEqual(visibleChatOptions(), state.chatOptions);

// After the customer selects an appointment slot, asking for a name is free text.
state.chatMessages.push({role: 'assistant', text: 'What name should we put down?'});
state.chatOptions = [];
assert.deepEqual(visibleChatOptions(), []);

// Generic Q&A also must not resurrect unrelated starter buttons.
state.chatMessages.push({role: 'user', text: 'What is the warranty?'});
state.chatMessages.push({role: 'assistant', text: 'The warranty is one year.'});
assert.deepEqual(visibleChatOptions(), []);

// Reset re-enables onboarding prompts in the chosen language.
state.uiLanguage = 'es';
state.chatMessages = [{role: 'assistant', text: '¡Hola!'}];
assert.deepEqual(visibleChatOptions(),
  ['¿Cuál es su horario?', 'Solicitar cita', 'Dejar mensaje']);
state.chatMessages.push({role: 'user', text: 'Quiero una cita'});
assert.deepEqual(visibleChatOptions(), []);
state.chatOptions = ['SLOT::2026-10-26T14:00'];
assert.deepEqual(visibleChatOptions(), state.chatOptions);
"""
    syntax = subprocess.run(
        ["node", "--check", str(Path(__file__).resolve().parents[1] / "static" / "app.js")],
        capture_output=True,
        text=True,
    )
    assert syntax.returncode == 0, syntax.stderr
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
