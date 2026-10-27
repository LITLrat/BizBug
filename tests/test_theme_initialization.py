"""Ensure a theme change cannot strand the hosted dashboard on Loading Assistant."""
import re
import shutil
import subprocess
from pathlib import Path
import pytest

BASE = Path(__file__).resolve().parents[1]
JS = BASE / "static" / "app.js"
HTML = BASE / "static" / "index.html"


def theme_initializer():
    source = JS.read_text(encoding="utf-8")
    match = re.search(r"function applyTheme\(theme\)\{[\s\S]*?\nfunction wireThemeControls", source)
    assert match, "Theme startup function missing"
    return match.group(0).rsplit("function wireThemeControls", 1)[0]


def test_uses_multi_element_selector_not_single_element_for_theme_buttons():
    body = theme_initializer()
    assert "$$('[data-theme-set]').forEach" in body
    assert not re.search(r"(?<!\$)\$\('\[data-theme-set\]'\)\.forEach", body)


def test_stylesheet_and_script_have_matching_cache_busting_urls():
    html = HTML.read_text(encoding="utf-8")
    builder = (BASE / "build_offline.py").read_text(encoding="utf-8")
    for resource in ("/static/styles.css", "/static/app.js"):
        match = re.search(re.escape(resource) + r"\?v=([a-zA-Z0-9-]+)", html)
        assert match
        assert resource + "?v=" + match.group(1) in builder


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not installed")
def test_theme_bootstrap_executes_across_all_palette_buttons():
    js = r"""
const fs = require('node:fs');
const source = fs.readFileSync(process.argv[1], 'utf8');
const start = source.indexOf('function applyTheme(theme)');
const end = source.indexOf('function wireThemeControls',start);
if (start < 0 || end < 0) throw Error('Missing theme initializer');
const names = ['emerald','forest','graphite','mint'];
const buttons = names.map(name=>({
 dataset:{themeSet:name},
 attrs:{}, active:false,
 setAttribute(k,v){this.attrs[k]=v},
 classList:{toggle(){}}}));
for(const button of buttons)button.classList.toggle=(k,on)=>{button.active=on};
const state={theme:'fern'}, saved={};
const document={
 body:{setAttribute(k,v){this[k]=v}},
 querySelector(s){return s.includes('theme-color')?{setAttribute(){}}:null}
};
const themeNames=Object.fromEntries(names.map(x=>[x,x]));
const $$=(s)=>{if(s!=='[data-theme-set]')throw Error('Unexpected selector');return buttons};
const saveDemoPreference=(k,v)=>saved[k]=v;
eval(source.slice(start,end));
applyTheme('fern');
if(state.theme!=='emerald')throw Error('Legacy theme migration failed');
if(buttons.filter(b=>b.active).length!==1||buttons[0].attrs['aria-pressed']!=='true')throw Error('Theme controls broken');
applyTheme('graphite');
if(state.theme!=='graphite'||!buttons[2].active||buttons.filter(b=>b.active).length!==1)throw Error('Theme switching failed');
"""
    result = subprocess.run(["node", "-e", js, str(JS)], capture_output=True, text=True, timeout=5)
    assert result.returncode == 0, result.stderr
