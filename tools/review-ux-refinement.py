"""UX acceptance against isolated review data, never real user records."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
OUT=Path('outputs/ux-refinement-acceptance');OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('SMOKE_REVIEW_URL','http://127.0.0.1:4176/review.html')
results=[]
def records(page, table):
 return page.evaluate("""async table=>{const db=await new Promise((ok,bad)=>{const r=indexedDB.open('smoke-notes-ui-review-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});try{return await new Promise((ok,bad)=>{const r=db.transaction(table).objectStore(table).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)})}finally{db.close()}}""",table)
def settle(page):
 page.wait_for_timeout(600)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'horizontal overflow'
def point(rect):return rect['x']+rect['width']*.5,rect['y']+rect['height']*.55
def thumb_width(group):
 return group.evaluate('''e=>{const t=e.querySelector('.rubber-segment__thumb');const a=getComputedStyle(t).clipPath.match(/[\\d.]+/g).map(Number);return e.clientWidth-parseFloat(e.style.getPropertyValue('--rs-inset'))*2-a[1]-a[3]}''')
with sync_playwright() as p:
 browser=p.chromium.launch()
 for w,h,reduced in [(1180,820,False),(820,1180,False),(390,844,False),(320,740,False),(390,844,True)]:
  name=f'{w}x{h}'+('-reduced' if reduced else '')
  context=browser.new_context(viewport={'width':w,'height':h},has_touch=True,is_mobile=w<600,reduced_motion='reduce' if reduced else 'no-preference')
  context.add_init_script("localStorage.setItem('smoke-review:skip-pairing','true')")
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto(URL,wait_until='domcontentloaded')
   page.locator('.note-stack').first.click();settle(page)
   cards=page.locator('.whole-card-sort');assert cards.count()>1
   assert page.get_by_role('button',name='整理便签',exact=True).count()==0
   assert cards.locator('.drag-handle').count()==0
   before=records(page,'notes');aid=cards.nth(0).locator('[data-note-id]').get_attribute('data-note-id')
   a=cards.nth(0).bounding_box();z=cards.nth(1).bounding_box();x,y=point(a);tx,ty=point(z)
   if w<600:
    cdp=context.new_cdp_session(page)
    def touch(kind,x=0,y=0):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind in ('touchEnd','touchCancel') else [{'x':x,'y':y,'id':1}]})
    touch('touchStart',x,y);page.wait_for_timeout(380)
    expect(page.locator('.whole-card-sort.is-dragging')).to_have_count(1)
    for step in range(1,10):touch('touchMove',x+(tx-x)*step/9,y+(ty-y)*step/9);page.wait_for_timeout(25)
    touch('touchEnd')
   else:
    page.mouse.move(x,y);page.mouse.down();page.wait_for_timeout(380)
    expect(page.locator('.whole-card-sort.is-dragging')).to_have_count(1)
    page.mouse.move(tx,ty,steps=12);page.wait_for_timeout(120);page.mouse.up()
   settle(page)
   assert page.locator('.mobile-note-screen').count()==0,'drag opened note'
   after=records(page,'notes');assert next(n['rank'] for n in before if n['id']==aid)!=next(n['rank'] for n in after if n['id']==aid),'rank not saved'
   page.screenshot(path=str(OUT/f'{name}-notes.png'))
   # A normal tap still opens the note; formatting preserves the selected text.
   page.locator('.sticky-card-open').first.click();settle(page)
   body=page.locator('.rich-note-content');body.fill('悬浮格式验证');body.press('Control+a')
   trigger=page.get_by_role('button',name='格式',exact=True)
   if w>760:trigger.hover()
   else:trigger.click()
   toolbar=page.get_by_role('toolbar',name='文字格式');expect(toolbar).to_be_visible();settle(page)
   page.screenshot(path=str(OUT/f'{name}-format.png'))
   toolbar.get_by_role('button',name='粗体',exact=True).click();expect(body.locator('strong')).to_have_text('悬浮格式验证')
   if w>760:
    page.mouse.move(20,20);page.wait_for_timeout(350);expect(toolbar).not_to_be_visible()
    trigger.focus();page.keyboard.press('ArrowUp');expect(toolbar).to_be_visible();expect(toolbar.get_by_role('button',name='粗体',exact=True)).to_be_focused()
    page.keyboard.press('Escape');expect(toolbar).not_to_be_visible()
   page.get_by_role('button',name='保存',exact=True).click();settle(page)
   page.get_by_role('button',name='返回便签列表').click();settle(page)
   nav=page.get_by_role('navigation',name='主导航');nav.get_by_role('button',name='待办',exact=True).click();settle(page)
   completed=page.get_by_role('checkbox',name='恢复：整理这一周的灵感',exact=True);expect(completed).to_be_visible()
   assert page.locator('.planner-completed').count()==0
   page.get_by_role('checkbox',name='完成：给家人打个电话',exact=True).click();settle(page)
   expect(page.get_by_role('checkbox',name='恢复：给家人打个电话',exact=True)).to_be_visible()
   page.get_by_role('button',name='撤销：给家人打个电话').click();settle(page)
   expect(page.get_by_role('checkbox',name='完成：给家人打个电话',exact=True)).to_be_visible()
   group=page.get_by_role('group',name='待办视图');assert 'inset' in group.locator('.rubber-segment__thumb').evaluate('e=>e.style.clipPath')
   assert abs(thumb_width(group)-group.get_by_role('button',name='今天',exact=True).evaluate('e=>e.offsetWidth'))<3
   # A touch drag follows the selected thumb and changes view only on release.
   cdp=context.new_cdp_session(page)
   r=group.get_by_role('button',name='今天',exact=True).bounding_box();sx,sy=point(r)
   for kind,dx in [('touchStart',0),('touchMove',8),('touchMove',r['width']+8)]:
    cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':sx+dx,'y':sy,'id':1}]});page.wait_for_timeout(60)
   expect(group.get_by_role('button',name='今天',exact=True)).to_have_attribute('aria-pressed','true')
   page.wait_for_timeout(160)
   cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});settle(page)
   expect(group.get_by_role('button',name='全部',exact=True)).to_have_attribute('aria-pressed','true')
   group.get_by_role('button',name='今天',exact=True).click();settle(page)
   page.screenshot(path=str(OUT/f'{name}-daily.png'))
   # Tomorrow remains date-only, independent of browser timezone conversions.
   today=page.locator('.planner-date time').get_attribute('datetime')
   page.get_by_role('button',name='新建待办',exact=True).click()
   dialog=page.get_by_role('dialog',name='新建一件小事');dialog.get_by_role('button',name='选日期',exact=True).click();settle(page)
   calendar=page.get_by_role('application',name='新待办日期');expect(calendar).to_be_visible()
   types=page.get_by_role('group',name='新建类型')
   assert abs(thumb_width(types)-types.get_by_role('button',name='待办',exact=True).evaluate('e=>e.offsetWidth'))<3
   page.screenshot(path=str(OUT/f'{name}-calendar.png'))
   selected=calendar.locator('.rdp-selected .rdp-day_button');selected.focus();page.keyboard.press('ArrowRight');page.keyboard.press('Enter')
   dialog.get_by_role('textbox',name='新待办内容').fill('月历安排')
   dialog.get_by_role('button',name='添加',exact=True).click()
   expect(dialog.get_by_role('status',name='新建待办反馈')).to_contain_text('明天')
   dialog.get_by_role('button',name='查看待办',exact=True).click();settle(page)
   expect(page.get_by_role('textbox',name='编辑待办：月历安排')).to_be_visible()
   row=page.get_by_role('textbox',name='编辑待办：月历安排').locator('xpath=ancestor::article[1]')
   row.get_by_role('button',name='更多待办操作：月历安排').click()
   page.get_by_role('button',name='安排日期：月历安排',exact=True).click();settle(page)
   popup=page.get_by_role('dialog',name='安排日期：月历安排日历');expect(popup).to_be_visible()
   popup.get_by_role('button',name='关闭日历').click()
   page.keyboard.press('Escape');settle(page)
   group.get_by_role('button',name='历史',exact=True).click()
   page.get_by_role('button',name='历史日期',exact=True).click();settle(page)
   popup=page.get_by_role('dialog',name='历史日期日历');expect(popup).to_be_visible();page.screenshot(path=str(OUT/f'{name}-history-calendar.png'))
   page.keyboard.press('Escape');expect(popup).not_to_be_visible()
   # Notebook create and floating add are separate at every viewport.
   nav.get_by_role('button',name='浏览便签本',exact=True).click();settle(page)
   first=page.get_by_role('button',name='建立新便签本').bounding_box();second=page.locator('.family-trigger').bounding_box()
   assert first['y']+first['height']<second['y'],'create buttons overlap'
   page.screenshot(path=str(OUT/f'{name}-notebooks.png'))
   assert not errors,errors
   results.append({'viewport':name,'passed':True,'pageErrors':errors})
  except Exception as e:
   page.screenshot(path=str(OUT/f'{name}-failure.png'))
   results.append({'viewport':name,'passed':False,'error':str(e),'pageErrors':errors})
   (OUT/'result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
   raise
  finally:context.close()
  (OUT/'result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
 browser.close()
print(json.dumps(results,ensure_ascii=False,indent=2))
