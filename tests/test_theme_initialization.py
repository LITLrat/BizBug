"""Regression coverage for restored original light BizBug theme and mobile startup."""
import re
import shutil
import subprocess
from pathlib import Path
import pytest

BASE=Path(__file__).resolve().parents[1]
JS=BASE/'static'/'app.js'
HTML=BASE/'static'/'index.html'
CSS=BASE/'static'/'styles.css'
THEMES=('fern','ocean','plum','sunset')


def test_restored_light_theme_is_default():
    js=JS.read_text(encoding='utf-8')
    css=CSS.read_text(encoding='utf-8')
    html=HTML.read_text(encoding='utf-8')
    assert "readDemoPreference('bizbug.theme','fern')" in js
    assert "const themeNames={fern:'Fern',ocean:'Ocean',plum:'Plum',sunset:'Sunset'}" in js
    for theme in THEMES:
        assert f"body[data-theme='{theme}']" in css
        assert f'data-theme-set="{theme}"' in html
    assert "v0.14 · BIZBUG EMERALD NIGHT DESIGN SYSTEM" not in css
    assert 'data:image/webp;base64,' in html


def test_theme_initializer_uses_multi_element_selector():
    src=JS.read_text(encoding='utf-8')
    start=src.index('function applyTheme(theme)')
    end=src.index('function wireThemeControls',start)
    body=src[start:end]
    assert "$$('[data-theme-set]').forEach" in body
    assert not re.search(r"(?<!\$)\$\('\[data-theme-set\]'\)\.forEach",body)


def test_html_asset_versions_match_offline_builder():
    html=HTML.read_text(encoding='utf-8')
    builder=(BASE/'build_offline.py').read_text(encoding='utf-8')
    for asset in ('/static/styles.css','/static/app.js'):
        m=re.search(re.escape(asset)+r'\?v=([a-zA-Z0-9-]+)',html)
        assert m and 'light-restored' in m.group(1)
        assert asset+'?v='+m.group(1) in builder


@pytest.mark.skipif(shutil.which('node') is None,reason='Node.js not installed')
def test_original_palette_initializes_in_javascript_runtime():
    code=r"""
const fs=require('node:fs');
const source=fs.readFileSync(process.argv[1],'utf8');
const start=source.indexOf('function applyTheme(theme)');
const end=source.indexOf('function wireThemeControls',start);
if(start<0||end<0)throw Error('initializer missing');
const names=['fern','ocean','plum','sunset'];
const buttons=names.map(theme=>({
 dataset:{themeSet:theme},active:false,
 classList:{toggle(_name,value){this.parent.active=value}}
}));
for(const b of buttons)b.classList.parent=b;
const state={theme:'fern'},saved={};
const document={body:{setAttribute(k,v){this[k]=v}},querySelector(s){
 return s.includes('theme-color')?{setAttribute(){}}:null}};
const $$=(selector)=>{if(selector!=='[data-theme-set]')throw Error('selector mismatch');return buttons};
const themeNames=Object.fromEntries(names.map(x=>[x,x]));
const saveDemoPreference=(k,v)=>saved[k]=v;
eval(source.slice(start,end));
applyTheme('fern');
if(state.theme!=='fern'||buttons.filter(b=>b.active).length!==1||!buttons[0].active)throw Error('Fern startup failed');
applyTheme('ocean');
if(state.theme!=='ocean'||!buttons[1].active||buttons.filter(b=>b.active).length!==1)throw Error('theme change failed');
applyTheme('emerald');
if(state.theme!=='fern')throw Error('legacy persisted dark theme not reset to light');
"""
    result=subprocess.run(['node','-e',code,str(JS)],capture_output=True,text=True,timeout=5)
    assert result.returncode==0,result.stderr
