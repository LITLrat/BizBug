from pathlib import Path
BASE = Path(__file__).resolve().parents[1]

def test_storage_preferences_do_not_throw_on_ios():
    text = (BASE/'static'/'app.js').read_text()
    assert "readDemoPreference('bizbug.theme'" in text
    assert "readDemoPreference('bizbug.uiLanguage'" in text
    assert "saveDemoPreference('bizbug.theme'" in text
    assert "document.body.classList.add('bizbug-ready')" in text

def test_offline_preview_has_help_when_scripts_cannot_start():
    html = (BASE/'static'/'index.html').read_text()
    assert 'iPhone Files' in html
    assert '<noscript>' in html

def test_offline_clone_falls_back_without_structured_clone():
    adapter = (BASE/'static'/'offline-adapter.js').read_text()
    assert 'typeof structuredClone' in adapter
    assert 'cloneDemo(seed.leads)' in adapter
