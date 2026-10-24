"""Isolated Family Button / daily planner acceptance. Only review-origin sample data."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT = Path('outputs/family-button-acceptance')
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('SMOKE_REVIEW_URL', 'http://127.0.0.1:4176/review.html')
results = []

def settle(page):
    page.wait_for_timeout(450)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow'

def records(page, table='todos'):
    return page.evaluate('''async table => {
      const db = await new Promise((resolve,reject) => {const r = indexedDB.open('smoke-notes-ui-review-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      try {return await new Promise((resolve,reject)=>{const r=db.transaction(table).objectStore(table).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})} finally {db.close()}
    }''', table)

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height, reduced in [(1440,900,False),(1180,820,False),(820,1180,False),(390,844,False),(320,740,False),(390,844,True)]:
        name = f'{width}x{height}' + ('-reduced' if reduced else '')
        context = browser.new_context(viewport={'width':width,'height':height}, has_touch=True, is_mobile=width<600, reduced_motion='reduce' if reduced else 'no-preference')
        context.add_init_script('''localStorage.setItem('smoke-review:skip-pairing','true');
          const v=new EventTarget();Object.assign(v,{height:innerHeight,width:innerWidth,offsetTop:0,offsetLeft:0,scale:1});
          Object.defineProperty(window,'visualViewport',{configurable:true,value:v});
          window.resizeKeyboard=(height,top=0)=>{v.height=height;v.offsetTop=top;v.dispatchEvent(new Event('resize'))};
        ''')
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        try:
            page.goto(URL, wait_until='domcontentloaded')
            nav=page.get_by_role('navigation',name='主导航')
            nav.get_by_role('button',name='待办',exact=True).click()
            settle(page)
            page.screenshot(path=str(OUT/f'{name}-daily.png'))
            trigger=page.get_by_role('button',name='新建待办',exact=True)
            trigger.click()
            dialog=page.get_by_role('dialog',name='新建一件小事')
            field=dialog.get_by_role('textbox',name='新待办内容')
            expect(field).to_be_focused()
            field.fill('保留的草稿')
            types=dialog.get_by_role('group',name='新建类型')
            types.get_by_role('button',name='便签',exact=True).click()
            settle(page)
            if width < 600:
                panel_box = dialog.bounding_box()
                nav_box = page.locator('.web-dock').bounding_box()
                assert panel_box['y'] >= 0 and panel_box['y'] + panel_box['height'] <= nav_box['y'], (panel_box,nav_box)
            page.screenshot(path=str(OUT/f'{name}-note-panel.png'))
            types.get_by_role('button',name='待办',exact=True).click()
            expect(field).to_have_value('保留的草稿')
            page.keyboard.press('Escape')
            expect(dialog).not_to_be_visible()
            expect(trigger).to_be_focused()
            trigger.click()
            expect(field).to_have_value('保留的草稿')
            field.fill('明天散步')
            dialog.get_by_role('button',name='明天',exact=True).click()
            dialog.get_by_role('button',name='添加',exact=True).click()
            expect(field).to_have_value('')
            expect(dialog.get_by_role('status',name='新建待办反馈')).to_contain_text('明天')
            dialog.get_by_role('button',name='查看待办',exact=True).click()
            expect(page.get_by_role('group',name='待办视图').get_by_role('button',name='全部',exact=True)).to_have_attribute('aria-pressed','true')
            expect(page.get_by_role('textbox',name='编辑待办：明天散步')).to_be_visible()
            trigger.click()
            dialog.get_by_role('button',name='今天',exact=True).click()
            field.fill('今天的小计划')
            dialog.get_by_role('button',name='添加',exact=True).click()
            expect(field).to_have_value('')
            field.fill('下一件还没写完')
            if width < 600:
                page.evaluate('resizeKeyboard(360,30)')
                settle(page)
                field.scroll_into_view_if_needed()
                dialog.get_by_role('button',name='添加',exact=True).scroll_into_view_if_needed()
                rect=dialog.bounding_box()
                assert rect['y']>=30 and rect['y']+rect['height']<=390, rect
                close=dialog.get_by_role('button',name='收起新建面板').bounding_box()
                assert close['y'] >= rect['y'] and close['y']+close['height'] <= rect['y']+rect['height'], close
                page.screenshot(path=str(OUT/f'{name}-keyboard.png'))
                page.evaluate(f'resizeKeyboard({height})')
            settle(page)
            page.screenshot(path=str(OUT/f'{name}-todo-panel.png'))
            dialog.get_by_role('button',name='收起新建面板').click()
            page.get_by_role('group',name='待办视图').get_by_role('button',name='今天',exact=True).click()
            page.get_by_role('checkbox',name='完成：今天的小计划',exact=True).click()
            undo=page.get_by_role('button',name='撤销：今天的小计划')
            expect(undo).to_be_visible()
            undo.click()
            expect(page.get_by_role('checkbox',name='完成：今天的小计划',exact=True)).to_have_attribute('aria-checked','false')
            settle(page)
            # The shared capsule's trailing expansion must reach 26%, with text unchanged.
            group=page.get_by_role('group',name='待办视图')
            box=group.get_by_role('button',name='今天',exact=True).bounding_box()
            cdp=context.new_cdp_session(page)
            x,y=box['x']+box['width']/2,box['y']+box['height']/2
            def touch(kind,xpos):
                cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':xpos,'y':y,'id':1}]})
            touch('touchStart',x)
            touch('touchMove',x+box['width']*.8)
            page.wait_for_timeout(150)
            stretch=float(group.evaluate("e=>e.style.getPropertyValue('--dock-stretch')"))
            assert abs(stretch-1.26)<.001, stretch
            if reduced:
                transform=group.locator('.planner-segment-selection').evaluate('e=>getComputedStyle(e).transform')
                assert transform in ('none','matrix(1, 0, 0, 1, 0, 0)') or 'matrix(1,' in transform, transform
            touch('touchEnd',x)
            settle(page)
            nav_box=nav.get_by_role('button',name='待办',exact=True).bounding_box()
            x,y=nav_box['x']+nav_box['width']/2,nav_box['y']+nav_box['height']/2
            touch('touchStart',x)
            touch('touchMove',x+nav_box['width']*.8)
            page.wait_for_timeout(150)
            nav_stretch=float(nav.evaluate("e=>e.style.getPropertyValue('--dock-stretch')"))
            assert abs(nav_stretch-1.26)<.001, nav_stretch
            cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
            # Reload proves the real repository persisted both creations, with no cloud client.
            page.reload(wait_until='domcontentloaded')
            nav.get_by_role('button',name='待办',exact=True).click()
            page.get_by_role('group',name='待办视图').get_by_role('button',name='全部',exact=True).click()
            expect(page.get_by_role('textbox',name='编辑待办：明天散步')).to_be_visible()
            tasks=records(page)
            assert len([t for t in tasks if t['text']=='明天散步'])==1
            assert len([t for t in tasks if t['text']=='今天的小计划'])==1
            # Distinct note destination + checklist creation through the same button.
            page.get_by_role('button',name='新建待办',exact=True).click()
            dialog.get_by_role('group',name='新建类型').get_by_role('button',name='便签',exact=True).click()
            dialog.get_by_role('combobox',name='新便签所属便签本').select_option(label='工作与计划')
            dialog.get_by_role('button',name='清单便签',exact=False).click()
            title=page.get_by_role('textbox',name='便签标题',exact=True)
            expect(title).to_be_visible()
            title.fill('测试清单便签')
            page.get_by_role('button',name='保存',exact=True).click()
            expect(page.get_by_role('status',name='保存状态')).to_contain_text('保存')
            saved=records(page,'notes')
            match=[n for n in saved if n['title']=='测试清单便签']
            assert len(match)==1 and match[0]['kind']=='todo', match
            books=records(page,'notebooks')
            assert next(b['name'] for b in books if b['id']==match[0]['notebookId'])=='工作与计划'
            assert not errors, errors
            results.append({'viewport':name,'passed':True,'trailingScale':stretch,'navigationTrailingScale':nav_stretch,'pageErrors':errors})
        except Exception as error:
            page.screenshot(path=str(OUT/f'{name}-failure.png'))
            results.append({'viewport':name,'passed':False,'error':str(error),'pageErrors':errors})
            raise
        finally:
            (OUT/'result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
            context.close()
    browser.close()
print(json.dumps(results,ensure_ascii=False,indent=2))
