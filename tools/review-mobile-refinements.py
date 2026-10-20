"""Mobile notes layout checks. The keyboard is a visualViewport simulation, not a physical device."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
OUT=Path(os.environ.get('SMOKE_MOBILE_OUTPUT','/workspace/shared/mobile-refinement'))
OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('SMOKE_REVIEW_URL','http://127.0.0.1:4174/review.html')
PHASE=os.environ.get('SMOKE_MOBILE_PHASE','after')
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in [(320,740),(390,844),(430,932),(1194,834)]:
  context=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<600,has_touch=True)
  context.add_init_script('''{
    const v=new EventTarget();Object.assign(v,{height:innerHeight,width:innerWidth,offsetTop:0,offsetLeft:0,scale:1});
    Object.defineProperty(window,'visualViewport',{configurable:true,value:v});
    window.resizeKeyboard=(height,top=0)=>{v.height=height;v.offsetTop=top;v.dispatchEvent(new Event('resize'))};
  }''')
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE);page.get_by_role('navigation',name='主导航').wait_for()
  page.get_by_role('button',name='新建便签',exact=True).click();page.wait_for_timeout(200)
  page.screenshot(path=str(OUT/f'{PHASE}-{width}-create-menu.png'))
  menu=page.get_by_role('menuitem',name='普通便签',exact=True)
  if PHASE=='after':
   r=menu.bounding_box();assert menu.evaluate('(e,p)=>e.contains(document.elementFromPoint(p.x,p.y))',{'x':r['x']+r['width']/2,'y':r['y']+r['height']/2}), 'creation menu obscured'
   menu.click()
  else: menu.evaluate('(e)=>e.click()') # Baseline menu is covered; bypass only to inspect separate editor.
  title=page.get_by_role('textbox',name='便签标题',exact=True);title.wait_for();page.wait_for_timeout(550)
  title.fill(f'手机保存测试 {width}')
  body=page.locator('.rich-note-content');body.fill('键盘打开时保存这段内容。\n第二行仍然可编辑。')
  page.evaluate('resizeKeyboard(310,30)');page.wait_for_timeout(200)
  geometry=page.locator('.mobile-note-screen').evaluate('''e=>({screen:e.getBoundingClientRect().toJSON(),save:e.querySelector('.mobile-save-button').getBoundingClientRect().toJSON(),scroll:e.querySelector('.rich-note-scroll').getBoundingClientRect().toJSON(),compact:e.classList.contains('compact-editing')})''')
  if PHASE=='after':
   assert geometry['compact'],geometry
   assert geometry['save']['top']>=30 and geometry['save']['bottom']<=340,geometry
   assert geometry['save']['left']>=0 and geometry['save']['right']<=width,geometry
   assert geometry['scroll']['height']>=100,geometry
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.evaluate('''()=>{const e=document.createElement('div');e.id='keyboard-proof';e.textContent='键盘占用区域（VisualViewport 模拟）';e.style.cssText='position:fixed;top:340px;bottom:0;left:0;right:0;background:#e3e4e6;color:#505158;z-index:9999;text-align:center;padding-top:40px;font:14px sans-serif';document.body.append(e)}''')
  page.screenshot(path=str(OUT/f'{PHASE}-{width}-keyboard.png'))
  page.get_by_role('button',name='保存',exact=True).click();page.wait_for_timeout(200)
  page.evaluate('document.querySelector("#keyboard-proof").remove();resizeKeyboard(innerHeight,0)');page.wait_for_timeout(200)
  page.get_by_role('button',name='返回便签列表',exact=True).click();page.wait_for_timeout(550)
  page.reload();page.get_by_role('button',name='展开便签本：日常灵感，8 张便签').click();page.wait_for_timeout(550)
  saved=page.get_by_role('button',name=f'打开便签：手机保存测试 {width}',exact=True)
  expect(saved).to_be_visible()
  assert '键盘打开时保存' in saved.inner_text()
  page.locator('.notes-board-scroll').evaluate('(e)=>e.scrollTop=0');page.wait_for_timeout(50)
  page.screenshot(path=str(OUT/f'{PHASE}-{width}-card-spacing.png'))
  gap=page.locator('.sticky-card-grid').evaluate('(e)=>getComputedStyle(e).gap')
  if PHASE=='after': assert gap=='24px',gap
  if PHASE=='after':
   page.get_by_role('button',name='新建便签',exact=True).click()
   page.get_by_role('menuitem',name='待办便签',exact=True).click()
   expect(page.locator('.rich-note-content ul[data-type="taskList"]')).to_be_visible()
  results.append({'size':[width,height],'creationMenu':PHASE=='after','keyboard':geometry,'cardGap':gap,'savedAfterReload':True})
  assert not errors,errors
  context.close()
 browser.close()
(OUT/f'{PHASE}-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
