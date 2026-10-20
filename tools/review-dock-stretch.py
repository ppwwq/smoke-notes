"""Real Chromium touch acceptance and a short mobile screen recording.
Serve the existing isolated web review build on 4174. Uses synthetic local data.
PLAYWRIGHT_BROWSERS_PATH must contain Playwright's ffmpeg binary for recording.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT = Path(os.environ.get('SMOKE_REVIEW_OUTPUT', '/workspace/shared/dock-trailing-35'))
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('SMOKE_REVIEW_URL', 'http://127.0.0.1:4174/review.html')
RESULTS = []


def touch(cdp, kind, point=None):
    cdp.send('Input.dispatchTouchEvent', {
        'type': kind,
        'touchPoints': [] if point is None else [{'x': point[0], 'y': point[1]}],
    })


def drag(page, cdp, start, end, steps=20, delay=20):
    for i in range(1, steps + 1):
        touch(cdp, 'touchMove', (start[0] + (end[0] - start[0]) * i / steps, start[1]))
        page.wait_for_timeout(delay)


def open_page(browser, width, height, reduced=False, record=False):
    options = dict(viewport={'width': width, 'height': height}, has_touch=True,
                   is_mobile=width < 600, reduced_motion='reduce' if reduced else 'no-preference')
    if record:
        options.update(record_video_dir=str(OUT), record_video_size={'width': width, 'height': height})
    context = browser.new_context(**options)
    page = context.new_page()
    page.goto(URL)
    nav = page.get_by_role('navigation', name='主导航')
    nav.wait_for()
    page.wait_for_timeout(450)
    buttons = nav.get_by_role('button')
    points = []
    for button in buttons.all():
        r = button.bounding_box()
        points.append((r['x'] + r['width']/2, r['y'] + r['height']/2))
    return context, page, nav, buttons, points, context.new_cdp_session(page)


def geometry(page):
    return page.evaluate('''() => {
      const nav = document.querySelector('.web-dock');
      const capsule = nav.querySelector('.dock-selection');
      const r = capsule.getBoundingClientRect(), n = nav.getBoundingClientRect();
      const css = getComputedStyle(capsule), padding = parseFloat(getComputedStyle(nav).getPropertyValue('--dock-padding'));
      return {left:r.left,right:r.right,width:r.width,base:parseFloat(css.width),
        min:n.left+padding,max:n.right-padding,transition:css.transitionDuration,
        index:Number(nav.style.getPropertyValue('--dock-index')),
        offset:Number(nav.style.getPropertyValue('--dock-offset')),
        buttons:[...nav.querySelectorAll('button')].map(b=>({x:b.getBoundingClientRect().x,
          width:b.getBoundingClientRect().width,transform:getComputedStyle(b).transform,
          icon:getComputedStyle(b.querySelector('svg')).transform,
          label:getComputedStyle(b.querySelector('span')).transform,
          blend:getComputedStyle(b).mixBlendMode}))};
    }''')


def acceptance(browser, width, height, reduced=False):
    name = f'{width}x{height}' + ('-reduced' if reduced else '')
    context, page, nav, buttons, points, cdp = open_page(browser, width, height, reduced)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    initial = geometry(page)
    content = page.locator('.workspace-shell').inner_html()
    # Sample every animation frame, including release: no out-of-bounds capsule.
    page.evaluate('''() => {window.dockFrames=[];window.sampleDock=true;
      const sample=()=>{if(!window.sampleDock)return;
        const n=document.querySelector('.web-dock'),c=n.querySelector('.dock-selection');
        const a=n.getBoundingClientRect(),b=c.getBoundingClientRect(),p=parseFloat(getComputedStyle(n).getPropertyValue('--dock-padding'));
        window.dockFrames.push({left:b.left-a.left-p,right:a.right-p-b.right,width:b.width});requestAnimationFrame(sample)};sample();}''')
    touch(cdp, 'touchStart', points[0])
    drag(page, cdp, points[0], points[1])
    page.wait_for_timeout(180)
    expect(buttons.nth(0)).to_have_attribute('aria-current', 'page')
    assert page.locator('.workspace-shell').inner_html() == content, 'page changed while held'
    held = geometry(page)
    assert held['buttons'] == initial['buttons'], 'icons/labels moved or changed geometry'
    assert abs(held['width'] / held['base'] - 1.35) < 0.001 if not reduced else abs(held['width'] - held['base']) < 0.1
    assert held['offset'] < 0
    target = buttons.nth(1).bounding_box()
    assert abs(held['right'] - target['x'] - target['width']) < 0.2, 'rightward leading edge must follow the finger'
    page.screenshot(path=str(OUT / f'{name}-held-right.png'))
    drag(page, cdp, points[1], points[2])
    page.wait_for_timeout(140)
    turn = (points[2][0] - 8, points[2][1])
    if not reduced:
        page.locator('.dock-selection').evaluate('''e=>{
          window.reversalTransition=false;
          e.addEventListener('transitionrun',()=>{
            window.reversalTransition=e.getAnimations().some(a=>a.transitionProperty==='transform' &&
              a.effect.getTiming().duration===90 && a.playState==='running');
          },{once:true});
        }''')
    touch(cdp, 'touchMove', turn)
    if not reduced:
        # CDP queues touch moves; observe the browser's transition event rather
        # than assuming the pointer update has already run when dispatch returns.
        page.wait_for_function('window.reversalTransition')
    drag(page, cdp, turn, points[1], 12, 16)
    page.wait_for_timeout(180)
    reverse = geometry(page)
    assert reverse['offset'] > 0
    assert abs(reverse['left'] - target['x']) < 0.2, 'leftward leading edge must follow the finger'
    assert page.locator('.workspace-shell').inner_html() == content
    page.screenshot(path=str(OUT / f'{name}-held-left.png'))
    touch(cdp, 'touchEnd')
    expect(buttons.nth(1)).to_have_attribute('aria-current', 'page')
    expect(buttons.nth(1)).to_be_focused()
    page.wait_for_timeout(430)
    released = geometry(page)
    assert abs(released['width'] - released['base']) < 0.1
    assert abs(released['left'] - buttons.nth(1).bounding_box()['x']) < 1
    # Fast pull and cancellation after reaching a new destination.
    touch(cdp, 'touchStart', points[1]);touch(cdp, 'touchMove', points[0]);touch(cdp, 'touchEnd')
    expect(buttons.nth(0)).to_have_attribute('aria-current', 'page')
    page.wait_for_timeout(400)
    touch(cdp, 'touchStart', points[0]);drag(page, cdp, points[0], points[2], 8, 16);touch(cdp, 'touchCancel')
    page.wait_for_timeout(400)
    expect(buttons.nth(0)).to_have_attribute('aria-current', 'page')
    assert abs(geometry(page)['width'] - initial['base']) < 0.1
    # Both boundaries and reversal after overshooting, still held.
    touch(cdp, 'touchStart', points[0])
    for x in [points[3][0]+50, points[3][0], points[2][0], points[0][0]-50, points[1][0]]:
        touch(cdp, 'touchMove', (x, points[0][1]));page.wait_for_timeout(160)
        g=geometry(page);assert g['left'] >= g['min']-0.2 and g['right'] <= g['max']+0.2
    touch(cdp, 'touchCancel');page.wait_for_timeout(400)
    expect(buttons.nth(0)).to_have_attribute('aria-current', 'page')
    # Keyboard cancellation, then normal tap and all four destinations.
    touch(cdp, 'touchStart', points[0]);touch(cdp, 'touchMove', points[2]);page.keyboard.press('Escape');touch(cdp, 'touchEnd')
    expect(buttons.nth(0)).to_have_attribute('aria-current', 'page')
    page.wait_for_timeout(400)
    touch(cdp, 'touchStart', points[0]);drag(page, cdp, points[0], points[2], 8, 10);touch(cdp, 'touchEnd')
    expect(buttons.nth(2)).to_have_attribute('aria-current', 'page')
    page.keyboard.press('Tab');expect(buttons.nth(3)).to_be_focused();page.keyboard.press('Space')
    expect(page.get_by_role('dialog')).to_be_visible();page.keyboard.press('Escape')
    buttons.nth(0).click();expect(buttons.nth(0)).to_have_attribute('aria-current', 'page')
    page.wait_for_timeout(430)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    frames=page.evaluate('window.sampleDock=false;window.dockFrames')
    assert all(f['left'] >= -0.3 and f['right'] >= -0.3 for f in frames), min(f['left'] for f in frames)
    assert all(f['width'] <= initial['base'] * 1.35 + 0.1 for f in frames), 'stretch exceeded 35%'
    if reduced:
        assert released['transition'] == '0s'
        assert all(abs(f['width']-initial['base'])<0.1 for f in frames)
    assert not errors, errors
    page.screenshot(path=str(OUT / f'{name}-settled.png'))
    RESULTS.append({'viewport':name,'checks':'slow/hold/fast/reverse interpolation/leading-edge alignment/bounds/35% cap/touchCancel/Escape/release-only/four destinations/Tab/Space/focus/labels fixed',
                    'heldScale':round(held['width']/held['base'],3),'sampledFrames':len(frames),
                    'minimumBoundaryClearance':round(min(min(f['left'],f['right']) for f in frames),3)})
    context.close()


def record_demo(browser):
    context,page,nav,buttons,points,cdp=open_page(browser,390,844,record=True)
    # Recording-only captions and contact marker; no application code changes.
    page.evaluate('''() => {
      const label=document.createElement('div');label.id='demo-label';
      label.style.cssText='position:fixed;top:50px;left:16px;right:16px;z-index:9999;padding:12px;border-radius:12px;background:#111e;color:white;font:14px sans-serif;text-align:center;pointer-events:none';document.body.append(label);
      const dot=document.createElement('div');dot.id='demo-touch';dot.style.cssText='display:none;position:fixed;width:28px;height:28px;border:2px solid #ec926a;border-radius:50%;transform:translate(-50%,-50%);z-index:9999;pointer-events:none;background:#ec926a33';document.body.append(dot);
      for(const type of ['pointerdown','pointermove'])document.addEventListener(type,e=>{dot.style.display='block';dot.style.left=e.clientX+'px';dot.style.top=e.clientY+'px'},true);
      for(const type of ['pointerup','pointercancel'])document.addEventListener(type,()=>dot.style.display='none',true);
    }''')
    def label(text): page.locator('#demo-label').evaluate('(e,t)=>e.textContent=t',text)
    label('向右慢拖：左侧拖尾，最多延伸 35%')
    page.wait_for_timeout(650)
    touch(cdp,'touchStart',points[0]);drag(page,cdp,points[0],points[1],45,25)
    page.wait_for_timeout(650);label('放手：柔和缩回，吸附并切换页面');touch(cdp,'touchEnd');page.wait_for_timeout(1000)
    label('反向向左：换到右侧拖尾，前端跟手')
    touch(cdp,'touchStart',points[1]);drag(page,cdp,points[1],points[2],30,25);page.wait_for_timeout(250)
    drag(page,cdp,points[2],points[0],48,20);page.wait_for_timeout(350);touch(cdp,'touchEnd');page.wait_for_timeout(700)
    label('快拖：放手后才切页')
    touch(cdp,'touchStart',points[0]);drag(page,cdp,points[0],points[1],4,16);page.wait_for_timeout(400);touch(cdp,'touchEnd');page.wait_for_timeout(900)
    label('边界：拉伸有上限，胶囊不越界')
    touch(cdp,'touchStart',points[1]);drag(page,cdp,points[1],(385,points[1][1]),40,20);page.wait_for_timeout(500)
    drag(page,cdp,(385,points[1][1]),points[2],18,20);page.wait_for_timeout(300)
    label('取消手势：回到原来的页面');touch(cdp,'touchCancel');page.wait_for_timeout(1000)
    label('向后拖尾 35% · 图标文字固定 · 放手切页');page.wait_for_timeout(900)
    video=Path(page.video.path());context.close();video.rename(OUT/'dock-trailing-35-mobile.webm')


with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for width,height in [(320,740),(390,844),(430,932),(1440,1000)]:
        acceptance(browser,width,height)
    acceptance(browser,390,844,reduced=True)
    record_demo(browser)
    browser.close()
(OUT/'results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2))
print(json.dumps(RESULTS,ensure_ascii=False,indent=2))
