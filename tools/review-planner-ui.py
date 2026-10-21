"""Actual browser planner acceptance and clean product recording, synthetic data.
Uses Playwright's fixed Date clock (timers/animations run normally), real UI writes,
local IndexedDB reads for assertions. No cloud service or sync is simulated here.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT=Path(os.environ.get('SMOKE_PLANNER_OUTPUT','/workspace/shared/planner-release'))
OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('SMOKE_REVIEW_URL','http://127.0.0.1:4174/review.html')


def records(page):
    return page.evaluate('''async()=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('smoke-notes-ui-review-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      try{return await new Promise((resolve,reject)=>{const r=db.transaction('todos').objectStore('todos').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{db.close()}
    }''')


def settle(page):
    page.wait_for_timeout(240)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


def option_fields(page,opened):
    detail=page.locator('.planner-create-options')
    if (detail.get_attribute('open') is not None)!=opened: detail.locator('summary').click()


def add(page,name,date=None,repeat='once',notes=''):
    page.get_by_role('textbox',name='新待办内容').fill(name)
    if date or repeat!='once' or notes:
        option_fields(page,True)
        if date:page.get_by_label('新待办日期',exact=True).fill(date)
        page.get_by_label('新待办重复',exact=True).select_option(repeat)
        if notes:page.get_by_label('新待办备注',exact=True).fill(notes)
    page.get_by_role('button',name='添加',exact=True).click()
    expect(page.get_by_role('textbox',name='新待办内容')).to_have_value('')
    option_fields(page,False)
    settle(page)


def row(page,name):
    return page.locator('.planner-todo-row').filter(has=page.get_by_role('textbox',name='编辑待办：'+name,exact=True))


def tab(page,name):
    page.get_by_role('group',name='待办视图').get_by_role('button',name=name,exact=True).click();settle(page)


with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,record_video_dir=str(OUT),record_video_size={'width':390,'height':844})
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.clock.set_fixed_time('2026-10-20T15:59:00Z')
    page.goto(URL);nav=page.get_by_role('navigation',name='主导航');nav.wait_for()
    nav.get_by_role('button',name='待办',exact=True).click();settle(page)
    expect(page.get_by_role('status',name='待办同步状态')).to_contain_text('未启用云端同步')
    add(page,'提交周报')
    add(page,'整理上周资料','2026-10-19',notes='先整理桌面与收件箱')
    expect(page.locator('.planner-overdue')).to_contain_text('之前未完成')
    add(page,'每日阅读','2026-10-20','daily','睡前读二十页')
    page.get_by_role('button',name='完成：每日阅读',exact=True).click();settle(page)
    expect(page.get_by_role('button',name='撤销：每日阅读',exact=True)).to_be_visible()
    page.get_by_role('button',name='撤销：每日阅读',exact=True).click();settle(page)
    expect(page.get_by_role('button',name='完成：每日阅读',exact=True)).to_be_visible()
    page.get_by_role('button',name='完成：每日阅读',exact=True).click();settle(page)
    # Existing one-time past record is explicitly moved to today.
    overdue=row(page,'整理上周资料');overdue.get_by_text('安排与更多',exact=True).click()
    overdue.get_by_role('button',name='移到今天',exact=True).click();settle(page)
    add(page,'工作日计划','2026-10-20','weekdays')
    weekday=row(page,'工作日计划');weekday.get_by_text('安排与更多',exact=True).click()
    weekday.get_by_role('button',name='跳过今天',exact=True).click();settle(page)
    page.locator('.todo-workspace').evaluate('e=>e.scrollTop=0')
    page.screenshot(path=str(OUT/'after-today.png'))
    page.wait_for_timeout(750)
    tab(page,'全部')
    series=page.locator('.planner-series-item').filter(has=page.locator('summary').filter(has_text='每日阅读'))
    series.locator(':scope > summary').click();settle(page)
    series.get_by_role('button',name='暂停重复',exact=True).click();settle(page)
    expect(series.get_by_role('button',name='恢复重复',exact=True)).to_be_visible()
    series.get_by_role('button',name='恢复重复',exact=True).click();settle(page)
    weekly=page.locator('.planner-series-item').filter(has=page.locator('summary').filter(has_text='工作日计划'))
    weekly.locator(':scope > summary').click()
    weekly.get_by_text('停止未来重复',exact=True).click();settle(page)
    weekly.get_by_role('button',name='确认停止未来',exact=True).click();settle(page)
    expect(weekly).to_contain_text('已停止未来安排')
    page.screenshot(path=str(OUT/'after-repeat-controls.png'))
    initial=records(page)
    daily_id=next(r['id'] for r in initial if r.get('planning',{}).get('kind')=='series' and r['text']=='每日阅读')
    stopped_id=next(r['id'] for r in initial if r.get('planning',{}).get('kind')=='series' and r['text']=='工作日计划')
    # Hong Kong midnight while the page is offline: date materialization is local.
    tab(page,'今天');context.set_offline(True)
    page.clock.set_fixed_time('2026-10-20T16:01:00Z');page.evaluate("window.dispatchEvent(new Event('focus'))")
    expect(page.get_by_role('button',name='完成：每日阅读',exact=True)).to_be_visible()
    assert len([r for r in records(page) if r.get('planning',{}).get('seriesId')==daily_id])==2
    # Three more days away, no host process needed to generate intervening dates.
    page.clock.set_fixed_time('2026-10-23T16:01:00Z');page.evaluate("window.dispatchEvent(new Event('focus'))")
    page.wait_for_timeout(400)
    current=records(page)
    daily=[r for r in current if r.get('planning',{}).get('seriesId')==daily_id]
    assert len(daily)==5 and len({r['planning']['date'] for r in daily})==5
    assert next(r for r in daily if r['planning']['date']=='2026-10-20')['completed']
    assert len([r for r in current if r.get('planning',{}).get('seriesId')==stopped_id])==1
    assert row(page,'每日阅读').count()==1, 'missed repeated instances must not become duplicate backlog'
    context.set_offline(False);page.reload();nav=page.get_by_role('navigation',name='主导航');nav.wait_for()
    nav.get_by_role('button',name='待办',exact=True).click();settle(page)
    assert len([r for r in records(page) if r.get('planning',{}).get('seriesId')==daily_id])==5
    tab(page,'历史');page.get_by_label('历史日期',exact=True).fill('2026-10-20');settle(page)
    expect(page.locator('.planner-completed')).to_contain_text('已完成')
    expect(page.locator('.planner-skipped')).to_contain_text('已跳过')
    expect(page.get_by_role('region',name='当日未完成')).to_be_visible()
    page.locator('.todo-workspace').evaluate('e=>e.scrollTop=0')
    page.screenshot(path=str(OUT/'after-history.png'));page.wait_for_timeout(900)
    # Verify the actual persisted clock setting through the settings UI.
    nav.get_by_role('button',name='打开设置',exact=True).click()
    page.get_by_text('每日待办',exact=True).click()
    page.get_by_label('待办换日时间',exact=True).select_option('4')
    expect(page.get_by_label('待办换日时间',exact=True)).to_be_enabled()
    assert next(r for r in records(page) if r.get('planning',{}).get('kind')=='settings')['planning']['settings']['dayBoundaryHour']==4
    page.screenshot(path=str(OUT/'after-settings.png'));page.wait_for_timeout(900)
    assert not errors,errors
    video=Path(page.video.path());context.close();video.rename(OUT/'planner-first-version-mobile.webm')
    browser.close()
(OUT/'results.json').write_text(json.dumps({'checks':['real UI create one-time/daily/weekdays/notes','completion+undo','skip today','reschedule overdue','pause+resume','stop future preserves history','Hong Kong midnight offline','three-day catchup+reopen no duplicates','history completed/open/skipped','04:00 setting persistence','local-only state honest'], 'dailyDates':sorted(r['planning']['date'] for r in daily),'pageErrors':errors},ensure_ascii=False,indent=2))
print((OUT/'results.json').read_text())
