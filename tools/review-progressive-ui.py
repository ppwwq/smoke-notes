"""New interaction paths in the isolated review build; no production or cloud data."""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('SMOKE_REVIEW_URL', 'http://127.0.0.1:4173/review.html')
OUT = Path(os.environ.get('SMOKE_INTERACTION_OUTPUT', '/workspace/shared/smoke-ui-v3/interactions'))
OUT.mkdir(parents=True, exist_ok=True)
passed, errors = [], []

def screenshot(page, name):
    page.wait_for_timeout(150)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT / f'{name}.png'))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in [(320,568),(390,844),(1440,1000)]:
        ctx = browser.new_context(viewport={'width':width,'height':height},is_mobile=width<760,has_touch=width<760)
        page = ctx.new_page(); page.on('pageerror',lambda error:errors.append(str(error))); page.goto(BASE)
        page.get_by_role('button',name='打开便签：一个轻盈的开始',exact=True).click()
        body=page.get_by_role('textbox',name='便签正文',exact=True)
        expect(body).to_be_visible()
        expect(page.get_by_role('button',name='便签颜色：sky',exact=True)).to_have_count(0)
        expect(page.get_by_role('button',name='粗体',exact=True)).to_have_count(0)
        page.evaluate('window.reviewEditor = document.querySelector(".tiptap")')
        body.click(); page.keyboard.press('Control+a')
        page.get_by_role('button',name='格式',exact=True).click()
        page.get_by_role('button',name='粗体',exact=True).click()
        expect(body.locator('strong').first).to_contain_text('留一点空白')
        page.get_by_role('button',name='字体颜色',exact=True).click()
        palette=page.get_by_label('选择字体颜色',exact=True)
        box=palette.bounding_box(); assert box['x']>=0 and box['x']+box['width']<=width and box['y']>=0 and box['y']+box['height']<=height
        assert box['y']+box['height'] <= page.locator('.format-toolbar').bounding_box()['y']
        for swatch in palette.get_by_role('button').all():
            rect=swatch.bounding_box(); assert rect['width']>=44 and rect['height']>=44
            assert swatch.evaluate('(e)=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}')
        screenshot(page,f'format-text-colors-{width}')
        page.get_by_role('button',name=re.compile('^字体色 ')).first.click()
        page.get_by_role('button',name='荧光标注',exact=True).click()
        page.get_by_role('button',name=re.compile('^荧光色 ')).first.click()
        expect(body.locator('mark').first).to_be_visible()
        page.get_by_role('button',name='荧光标注',exact=True).click()
        page.get_by_role('button',name='清除荧光标注',exact=True).click()
        expect(body.locator('mark')).to_have_count(0)
        page.get_by_role('button',name='更多操作',exact=True).click()
        expect(page.get_by_role('menuitem',name='便签外观',exact=True)).to_be_focused()
        page.keyboard.press('End'); expect(page.get_by_role('menuitem',name='删除便签',exact=True)).to_be_focused()
        page.keyboard.press('Home'); page.keyboard.press('Enter')
        appearance=page.get_by_role('dialog',name='便签外观',exact=True)
        expect(appearance).to_be_visible()
        page.get_by_role('button',name='便签颜色：sky',exact=True).click()
        expect(page.get_by_role('button',name='便签颜色：sky',exact=True)).to_have_attribute('aria-pressed','true')
        screenshot(page,f'note-appearance-{width}')
        page.get_by_role('button',name='完成',exact=True).click()
        expect(appearance).to_have_count(0)
        expect(page.get_by_role('button',name='更多操作',exact=True)).to_be_focused()
        assert page.evaluate('window.reviewEditor === document.querySelector(".tiptap")')
        expect(body.locator('strong').first).to_contain_text('留一点空白')
        page.get_by_role('button',name='更多操作',exact=True).click()
        page.get_by_role('menuitem',name='应用设置',exact=True).click()
        page.get_by_role('button',name=re.compile('外观与阅读')).click()
        page.get_by_role('radio',name=re.compile('纸面模式')).check()
        screenshot(page,f'app-appearance-{width}')
        page.get_by_role('button',name='关闭设置',exact=True).click()
        assert page.evaluate('window.reviewEditor === document.querySelector(".tiptap")')
        expect(page.locator('.smoke-app')).to_have_attribute('data-web-background','paper')
        expect(page.locator('.rich-note-editor')).to_have_class(re.compile('note-color-sky'))
        page.get_by_role('button',name='返回便签列表',exact=True).click()
        page.reload();page.get_by_role('button',name='打开便签：一个轻盈的开始',exact=True).click()
        expect(page.locator('.rich-note-editor')).to_have_class(re.compile('note-color-sky'))
        expect(page.locator('.tiptap strong').first).to_contain_text('留一点空白')
        passed.append(f'{width}px: selection-based formatting, text/highlight palettes and clear action, separate note/app appearance, editor identity, keyboard menu/focus return, save/reload persistence')
        if width == 390:
            page.get_by_role('button',name='返回便签列表',exact=True).click()
            page.get_by_role('button',name='浏览便签本',exact=True).click()
            page.get_by_role('button',name='管理便签本',exact=True).click()
            trigger=page.get_by_role('button',name='更多便签本操作：阅读摘记',exact=True)
            trigger.click()
            action=page.get_by_role('dialog',name='便签本操作：阅读摘记',exact=True)
            expect(action.get_by_role('button',name='关闭操作',exact=True)).to_be_focused()
            for _ in range(8):
                page.keyboard.press('Tab')
                page.wait_for_function('document.querySelector(".actions-panel")?.contains(document.activeElement)',timeout=1000)
            page.keyboard.press('Escape');expect(action).to_have_count(0)
            expect(trigger).to_be_focused()
            expect(page.get_by_role('dialog',name='便签本导航',exact=True)).to_be_visible()
            trigger.click();page.get_by_role('button',name='删除便签本：阅读摘记',exact=True).click()
            expect(action).to_have_count(0)
            expect(page.get_by_role('button',name='关闭便签本管理',exact=True)).to_be_focused()
            page.keyboard.press('Escape')
            expect(page.get_by_role('dialog',name='便签本导航',exact=True)).to_have_count(0)
            expect(page.get_by_role('button',name='管理便签本',exact=True)).to_be_focused()
            passed.append('Nested management/action dialogs: Tab stays in top dialog, Escape closes one layer, deletion restores focus to surviving management control')
        ctx.close()
    browser.close()
assert not errors,errors
report={'passed':passed,'pageErrors':errors}
(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
