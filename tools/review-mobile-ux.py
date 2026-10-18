"""Touch/viewport acceptance against the isolated example-data review build only."""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('SMOKE_REVIEW_URL', 'http://127.0.0.1:4173/review.html')
OUT = Path(os.environ.get('SMOKE_MOBILE_OUTPUT', '/workspace/shared/smoke-ui-mobile-adaptation/ux'))
OUT.mkdir(parents=True, exist_ok=True)
passed, errors = [], []

def nav(page, name):
    page.get_by_role('navigation', name='手机主导航').get_by_role('button', name=name, exact=True).tap()

def capture(page, name):
    page.wait_for_timeout(250)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), name
    page.screenshot(path=str(OUT / f'{name}.png'))

def verify_dock(page):
    main = page.locator('.workspace-shell').bounding_box()
    dock = page.locator('.web-dock').bounding_box()
    # The content viewport ends above the navigation, including at scroll end.
    content = page.locator('main').bounding_box()
    assert content['y'] + content['height'] <= dock['y'], (main, content, dock)
    for button in page.locator('.web-dock button').all():
        rect = button.bounding_box()
        assert rect['width'] >= 44 and rect['height'] >= 44
        expect(button.locator('span')).to_be_visible()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    for width, height in [(320, 568), (360, 640), (390, 844), (430, 932)]:
        ctx = browser.new_context(viewport={'width':width,'height':height}, is_mobile=True, has_touch=True)
        page = ctx.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE); expect(page.get_by_role('heading', name='日常灵感', exact=True)).to_be_visible()
        capture(page, f'notes-{width}'); verify_dock(page)
        expect(page.locator('.web-note-overview')).to_be_hidden()
        if width == 390:
            order = page.locator('.sticky-card strong').all_text_contents()
            grip = page.locator('.sticky-card-grid > .sortable-row > .drag-handle').first.bounding_box()
            cdp = ctx.new_cdp_session(page)
            x, y = grip['x'] + grip['width']/2, grip['y'] + grip['height']/2
            cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            page.wait_for_timeout(300)
            for distance in [10, 60, 120, 180]:
                cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x,'y':y+distance}]})
                page.wait_for_timeout(80)
            cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            page.wait_for_function('(before)=>JSON.stringify([...document.querySelectorAll(".sticky-card strong")].map(e=>e.textContent))!==JSON.stringify(before)',arg=order)
            expect(page.get_by_role('textbox',name='便签标题',exact=True)).to_have_count(0)
            passed.append('Touch drag reorders notes without opening or deleting a note')
        notes = page.locator('.notes-board-scroll')
        notes.evaluate('(e)=>e.scrollTop=e.scrollHeight'); page.wait_for_timeout(100)
        capture(page, f'notes-end-{width}')
        last = page.locator('.sticky-card-open').last.bounding_box(); dock = page.locator('.web-dock').bounding_box()
        assert last['y'] + last['height'] <= dock['y']
        scroll_before = notes.evaluate('(e)=>e.scrollTop')
        page.get_by_role('button', name='打开便签：今天慢慢做', exact=True).tap()
        expect(page.locator('.tiptap')).to_be_visible(); capture(page, f'editor-{width}')
        page.get_by_role('checkbox').first.tap()
        page.get_by_role('button', name='返回便签列表').tap()
        expect(page.get_by_role('navigation', name='手机主导航')).to_be_visible()
        assert abs(notes.evaluate('(e)=>e.scrollTop') - scroll_before) < 2
        nav(page, '待办'); verify_dock(page); capture(page, f'todos-{width}')
        buttons = page.locator('.completion-ring')
        for button in buttons.all():
            rect=button.bounding_box(); assert rect['width']>=44 and rect['height']>=44
        page.get_by_role('button', name='完成：读二十页喜欢的书', exact=True).tap()
        expect(page.get_by_role('button', name='恢复：读二十页喜欢的书', exact=True)).to_have_attribute('aria-pressed','true')
        expect(page.get_by_role('status', name='待办操作反馈')).to_contain_text('做得好')
        page.get_by_role('button', name='未完成', exact=True).tap()
        nav(page, '便签'); assert abs(notes.evaluate('(e)=>e.scrollTop') - scroll_before) < 2
        nav(page, '待办'); expect(page.get_by_role('button', name='未完成', exact=True)).to_have_attribute('aria-pressed','true')
        nav(page, '浏览便签本'); verify_dock(page); capture(page, f'notebooks-{width}')
        page.get_by_role('button', name='展开卡片', exact=True).tap()
        page.get_by_role('button', name='进入便签本：阅读摘记', exact=True).tap()
        expect(page.get_by_role('button', name='写下第一张便签')).to_be_visible()
        nav(page, '浏览便签本'); expect(page.get_by_role('button', name='收起卡片', exact=True)).to_have_attribute('aria-expanded','true')
        page.get_by_role('button', name='收起卡片', exact=True).tap()
        page.get_by_role('button', name='建立新便签本').tap()
        long_name='本周工作与生活的灵感整理 / IdeasForAThoughtfulEverydayLife'
        page.get_by_role('textbox', name='新便签本名称').fill(long_name)
        page.get_by_role('button', name='创建', exact=True).tap()
        expect(page.get_by_role('heading', name=long_name, exact=True)).to_be_visible()
        capture(page, f'long-name-{width}'); verify_dock(page)
        add=page.get_by_role('button',name='新建便签',exact=True).bounding_box()
        assert add['x']+add['width']<=width and add['width']>=44
        page.get_by_role('button',name='新建便签',exact=True).tap()
        page.get_by_role('menuitem',name='普通便签',exact=True).tap()
        title=page.get_by_role('textbox',name='便签标题',exact=True)
        title.fill('手机路径验收'); page.get_by_role('textbox',name='便签正文',exact=True).fill('隔离示例数据：新建、编辑、保存、返回。')
        page.get_by_role('button',name='保存',exact=True).tap()
        expect(page.get_by_label('保存状态')).to_contain_text(re.compile('已(自动)?保存'))
        page.get_by_role('button',name='返回便签列表').tap()
        page.get_by_role('button',name='删除便签：手机路径验收',exact=True).tap()
        expect(page.get_by_role('textbox',name='便签标题',exact=True)).to_have_count(0)
        page.get_by_role('button',name='撤销删除',exact=True).tap()
        expect(page.get_by_role('button',name='打开便签：手机路径验收',exact=True)).to_be_visible()
        page.get_by_role('button',name='删除便签：手机路径验收',exact=True).tap()
        nav(page,'打开设置'); capture(page,f'settings-{width}')
        row=page.locator('.trash-row').filter(has_text='手机路径验收')
        row.get_by_role('button',name='恢复',exact=True).tap()
        page.get_by_role('button',name='关闭设置').tap()
        expect(page.get_by_role('button',name='打开便签：手机路径验收',exact=True)).to_be_visible()
        page.reload(); nav(page,'浏览便签本'); page.get_by_role('button',name=f'进入便签本：{long_name}',exact=True).tap()
        page.get_by_role('button',name='打开便签：手机路径验收',exact=True).tap()
        expect(page.get_by_role('textbox',name='便签正文',exact=True)).to_contain_text('隔离示例数据')
        passed.append(f'{width}px: labelled 44px dock outside content; saved checklist return and tab scroll retention; task/filter feedback; stack/select/collapse; empty notebook; long heading; create/edit/save/reload; delete undo and Recently Deleted restore')
        ctx.close()
    empty = browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    ep = empty.new_page(); ep.on('pageerror',lambda e:errors.append(str(e))); ep.goto(BASE)
    ep.get_by_role('button',name='打开便签本',exact=True).tap()
    for name in ['日常灵感','工作与计划','生活碎片','阅读摘记']:
        ep.get_by_role('button',name=f'删除便签本：{name}',exact=True).tap()
        expect(ep.get_by_role('button',name=f'删除便签本：{name}',exact=True)).to_have_count(0)
    ep.get_by_role('button',name='关闭便签本',exact=True).tap(position={'x':370,'y':400})
    expect(ep.get_by_role('heading',name='先建立一个便签本',exact=True)).to_be_visible()
    nav(ep,'浏览便签本'); capture(ep,'empty-notebooks')
    ep.get_by_role('button',name='建立第一个便签本',exact=False).tap()
    ep.get_by_role('textbox',name='新便签本名称').fill('从空态重新开始')
    ep.get_by_role('button',name='创建',exact=True).tap()
    expect(ep.get_by_role('button',name='写下第一张便签')).to_be_visible()
    passed.append('Deleting all example notebooks leaves a usable empty state and a working create-notebook entry')
    empty.close()
    assert not errors, errors
    browser.close()
report={'passed':passed,'pageErrors':errors,'boundaries':['Chromium touch emulation, not a physical mobile keyboard','Example data only; no live cloud authentication or cross-device sync']}
(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
