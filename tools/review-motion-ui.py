"""Isolated Chromium acceptance for rc.5 motion changes (no cloud credentials).
Serve web review on 4174 and desktop Vite --mode preview on 4176.
PLAYWRIGHT_BROWSERS_PATH may point to a writable cache with ffmpeg installed.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT = Path(os.environ.get('SMOKE_REVIEW_OUTPUT', '/workspace/shared/smoke-motion/after'))
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('SMOKE_REVIEW_URL', 'http://127.0.0.1:4174/review.html')
results = []

def settled(page):
    page.wait_for_function('!document.documentElement.classList.contains("notebook-transition")')
    page.wait_for_timeout(80)

def snapshot(page, name):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT / f'{name}.png'))

def touch(cdp, kind, x=0, y=0):
    cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind in ('touchEnd', 'touchCancel') else [{'x': x, 'y': y}]})

def dock_test(page, context, name):
    nav = page.get_by_role('navigation', name='主导航')
    buttons = nav.get_by_role('button')
    points = []
    for b in buttons.all():
        r = b.bounding_box(); points.append((r['x'] + r['width']/2, r['y'] + r['height']/2))
    cdp = context.new_cdp_session(page)
    page.evaluate('''()=>{window.pointerTrace=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>window.pointerTrace.push({type,x:e.clientX,y:e.clientY,target:e.target.tagName}),true)}''')
    old = page.locator('.workspace-shell').inner_html()
    start, end = points[0], points[2]
    touch(cdp, 'touchStart', *start)
    for i in range(1, 19):
        touch(cdp, 'touchMove', start[0] + (end[0]-start[0])*i/18, start[1]);page.wait_for_timeout(25)
    page.wait_for_timeout(450)
    expect(buttons.nth(0)).to_have_attribute('aria-current', 'page')
    assert page.locator('.workspace-shell').inner_html() == old, 'Held drag must not render/preview another page'
    rect = page.locator('.dock-selection').bounding_box()
    # Directional stretch extends the leading edge; the trailing edge remains
    # aligned with the base button (also true with reduced motion).
    assert abs(rect['x'] - buttons.nth(2).bounding_box()['x']) < 3, (name, rect, end, nav.get_attribute('style'), nav.get_attribute('data-dragging'), page.evaluate('window.pointerTrace'))
    snapshot(page, f'{name}-dock-held')
    touch(cdp, 'touchEnd')
    expect(buttons.nth(2)).to_have_attribute('aria-current', 'page')
    page.wait_for_timeout(350)
    expect(buttons.nth(2)).to_be_focused()
    # Fast reverse back to notes.
    touch(cdp, 'touchStart', *end);touch(cdp, 'touchMove', *start);touch(cdp, 'touchEnd')
    expect(buttons.nth(0)).to_have_attribute('aria-current', 'page')
    # Reverse direction without releasing: final position, not velocity, wins.
    touch(cdp, 'touchStart', *start);touch(cdp, 'touchMove', *points[2]);touch(cdp, 'touchMove', *points[1]);touch(cdp, 'touchEnd')
    expect(buttons.nth(1)).to_have_attribute('aria-current', 'page')
    buttons.nth(0).click()
    touch(cdp, 'touchStart', *start);touch(cdp, 'touchMove', *points[2]);touch(cdp, 'touchCancel')
    page.wait_for_timeout(400)
    expect(buttons.nth(0)).to_have_attribute('aria-current', 'page')
    rect = page.locator('.dock-selection').bounding_box()
    assert abs(rect['x'] + rect['width']/2 - start[0]) < 2
    # Subsequent tap still works; settings remains the fourth function.
    buttons.nth(3).focus();page.keyboard.press('Enter')
    expect(page.get_by_role('dialog')).to_be_visible()
    page.keyboard.press('Escape')
    buttons.nth(0).click()
    results.append(f'{name}: real touch slow/held/fast/reverse/cancel, no preview/accidental click; all four destinations, keyboard/focus')

def motion_test(page, name):
    first = page.get_by_role('button', name='展开便签本：日常灵感，7 张便签')
    first.wait_for()
    snapshot(page, f'{name}-collapsed')
    # Instrument actual browser animations, without slowing down or replacing them.
    page.evaluate('''() => {
      window.motion=[];
      const start=document.startViewTransition.bind(document);
      document.startViewTransition=(update)=>{
        const t=start(update);
        t.ready.then(()=>{
          const note=document.querySelector('.stack-paper, .sticky-card');
          const n=note.style.viewTransitionName;
          const html=document.documentElement;
          window.motion.push({duration:getComputedStyle(html, `::view-transition-group(${n})`).animationDuration,
            z:getComputedStyle(html, `::view-transition-group(${n})`).zIndex,
            oldOpacity:getComputedStyle(html, `::view-transition-old(${n})`).opacity,
            rootOld:getComputedStyle(html, '::view-transition-old(root)').opacity,
            names:[...document.querySelectorAll('[style*="view-transition-name"]')].map(e=>e.style.viewTransitionName)});
        }).catch(e=>window.motion.push({error:String(e)}));
        return t;
      };
    }''')
    first.click();settled(page)
    expect(page.locator('.sticky-card')).to_have_count(7)
    snapshot(page, f'{name}-expanded')
    page.get_by_role('button', name='收起便签').click();settled(page)
    for _ in range(4):
        first.click();page.get_by_role('button', name='收起便签').click();settled(page)
    trace = page.evaluate('window.motion')
    assert len(trace) == 10, trace
    for t in trace:
        assert 'error' not in t, t
        assert t['duration'] == '0.5s' and t['z'] == '4' and t['rootOld'] == '0', t
        assert t['oldOpacity'] == '0', t
        assert len(t['names']) == len(set(t['names'])), 'duplicate card identities'
    (OUT / f'{name}-animation-evidence.json').write_text(json.dumps(trace, indent=2))
    # Independent scroll memories for stack overview, expanded grid and editor.
    scroller = '.notes-board-scroll' if name.startswith('mobile') else '.notes-board'
    page.locator(scroller).evaluate('(e)=>e.scrollTop=240');page.wait_for_timeout(80)
    overview = page.locator(scroller).evaluate('(e)=>e.scrollTop')
    first.evaluate('(e)=>e.click()');settled(page)
    page.locator(scroller).evaluate('(e)=>e.scrollTop=380');page.wait_for_timeout(80)
    expanded = page.locator(scroller).evaluate('(e)=>e.scrollTop')
    page.get_by_role('button',name='打开便签：旅行清单',exact=True).evaluate('(e)=>e.click()')
    expect(page.get_by_role('textbox',name='便签标题',exact=True)).to_be_visible()
    page.get_by_role('button',name='返回便签列表').click();page.wait_for_timeout(350)
    assert abs(page.locator(scroller).evaluate('(e)=>e.scrollTop') - expanded) <= 1
    page.get_by_role('button',name='收起便签').evaluate('(e)=>e.click()');settled(page)
    assert abs(page.locator(scroller).evaluate('(e)=>e.scrollTop') - overview) <= 1
    results.append(f'{name}: 5 expansion/collapse cycles, unique identity, 500ms/depth/opaque face verified; scroll restored {overview}/{expanded}px')

def colors_test(page):
    page.get_by_role('button',name='展开便签本：工作与计划，2 张便签').click();settled(page)
    for color in ['amber', 'rose', 'violet', 'graphite', 'amber']:
        page.get_by_role('button',name='新建便签',exact=True).click()
        page.get_by_role('menuitem',name='普通便签',exact=True).click()
        expect(page.locator('.rich-note-editor')).to_have_class(__import__('re').compile(f'note-color-{color}'))
        page.get_by_role('button',name='返回便签列表').click();page.wait_for_timeout(350)
    page.get_by_role('button',name='打开便签：会前准备',exact=True).click()
    page.get_by_role('button',name='更多操作',exact=True).click()
    page.get_by_role('menuitem',name='便签外观',exact=True).click()
    page.get_by_role('button',name='便签颜色：violet',exact=True).click()
    page.get_by_role('button',name='完成',exact=True).click()
    page.get_by_role('button',name='保存',exact=True).click()
    page.get_by_role('button',name='返回便签列表').click();page.wait_for_timeout(350)
    page.reload();page.get_by_role('button',name='展开便签本：工作与计划，7 张便签').click();settled(page)
    expect(page.locator('.sticky-card').filter(has=page.get_by_role('button',name='打开便签：会前准备',exact=True))).to_have_class(__import__('re').compile('note-color-violet'))
    snapshot(page,'mobile-new-colors')
    results.append('browser: unused amber/rose/violet/graphite then least-used amber; manual violet survives reload')

BRIDGE = '''(() => {
 const ok=async()=>{};
 window.smokeDesktop={
 getPreviewMode:async()=>true,
 getWindowState:async()=>({backgroundOpacity:0.82,alwaysOnTop:false,width:1440,height:1000,lastView:'notes'}),
 setBackgroundOpacity:async v=>v,setAlwaysOnTop:async v=>v,saveWindowState:ok,
 getLaunchAtLogin:async()=>false,setLaunchAtLogin:async v=>v,minimizeWindow:ok,closeCurrentWindow:ok,
 openNote:ok,closeNote:ok,getRecentNoteIds:async()=>JSON.parse(localStorage.getItem('review:recent') || '[]'),switchNote:async id=>{window.switchedNote=id},
 setNoteWindowMousePassthrough:ok,getNoteWindowPointer:async()=>({x:200,y:100}),
 getNoteWindowState:async noteId=>({noteId,width:460,height:480,backgroundOpacity:.92,alwaysOnTop:false,isOpen:true}),
 saveNoteWindowState:async(noteId,state)=>({noteId,...state})};
})()'''

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
    for name, size in [('desktop-web', {'width':1440,'height':1000}), ('mobile', {'width':390,'height':844})]:
        context = browser.new_context(viewport=size, has_touch=True, record_video_dir=str(OUT), record_video_size=size)
        page=context.new_page();errors=[];page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE)
        motion_test(page,name)
        page.locator('.notes-board-scroll').evaluate('(e)=>e.scrollTop=0')
        dock_test(page,context,name)
        if name == 'mobile': colors_test(page)
        assert not errors,errors
        video=Path(page.video.path());context.close();video.rename(OUT/f'{name}-interaction.webm')
    for mode in ['reduce','no-api']:
        context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce' if mode=='reduce' else 'no-preference',has_touch=True)
        if mode=='no-api':context.add_init_script('document.startViewTransition=undefined')
        page=context.new_page();page.goto(BASE)
        page.get_by_role('button',name='展开便签本：日常灵感，7 张便签').click()
        expect(page.locator('.sticky-card')).to_have_count(7)
        page.get_by_role('button',name='收起便签').click()
        expect(page.locator('.note-stack')).to_have_count(4)
        dock_test(page,context,mode)
        if mode=='reduce':assert page.locator('.dock-selection').evaluate('(e)=>getComputedStyle(e).transitionDuration')=='0s'
        results.append(f'{mode}: expand/collapse and dock remain usable')
        context.close()
    # Actual desktop renderer entry, with native IPC represented by a local test bridge.
    context=browser.new_context(viewport={'width':1440,'height':1000},has_touch=True)
    context.add_init_script(BRIDGE);page=context.new_page();page.goto('http://127.0.0.1:4176/')
    page.get_by_role('button',name='展开便签本：隔离预览 · 示例，5 张便签').wait_for();snapshot(page,'desktop-renderer-collapsed')
    page.get_by_role('button',name='展开便签本：隔离预览 · 示例，5 张便签').click();settled(page);snapshot(page,'desktop-renderer-expanded')
    page.get_by_role('button',name='收起便签').click();settled(page)
    dock_test(page,context,'desktop-renderer')
    ids=page.evaluate('''async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('smoke-notes-preview');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return new Promise(resolve=>{const r=db.transaction('notes').objectStore('notes').getAll();r.onsuccess=()=>resolve(r.result.map(n=>n.id))})}''')
    page.evaluate('(ids)=>localStorage.setItem("review:recent",JSON.stringify(ids))',ids)
    page.set_viewport_size({'width':560,'height':580});page.goto('http://127.0.0.1:4176/?noteId='+ids[0])
    expect(page.get_by_role('navigation',name='最近便签')).to_be_visible()
    tabs=page.get_by_role('button',name=__import__('re').compile('切换便签：'))
    assert tabs.count()>=2
    tabs.nth(1).click();page.wait_for_function('Boolean(window.switchedNote)')
    snapshot(page,'desktop-independent-note')
    results.append('desktop renderer: shared animation/dock, native-note left quick switch invokes IPC bridge; no Windows installer generated')
    context.close();browser.close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
