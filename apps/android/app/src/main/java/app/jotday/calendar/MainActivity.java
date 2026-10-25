package app.jotday.calendar;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private static final int PAPER=0xfffaf3e7,INK=0xff332d39,MUTED=0xff8b8176,PURPLE=0xff756486;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private PlannerStore store;
    private CloudClient cloud;
    private SharedPreferences prefs;
    private LocalDate selected=LocalDate.now(CalendarProjector.ZONE);
    private YearMonth month=YearMonth.from(selected);
    private LinearLayout content,agenda;
    private TextView status,monthTitle;
    private MonthGrid grid;
    private boolean syncing,foreground;
    private String syncText="仅在本机保存";
    private float zoom=1f;
    private final Runnable tick=new Runnable() { public void run() { if(foreground) { synchronize();handler.postDelayed(this,15000); } } };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);prefs=getSharedPreferences("calendar",0);cloud=new CloudClient(this);
        String workspace=prefs.getString("workspace",null);
        if(workspace==null) {workspace=UUID.randomUUID().toString();prefs.edit().putString("workspace",workspace).commit();}
        store=new PlannerStore(this,workspace);zoom=prefs.getFloat("month-zoom",1f);
        if(saved!=null) {selected=LocalDate.parse(saved.getString("selected",selected.toString()));month=YearMonth.parse(saved.getString("month",month.toString()));}
        build();
    }
    @Override protected void onResume() {super.onResume();foreground=true;handler.post(tick);}
    @Override protected void onPause() {super.onPause();foreground=false;handler.removeCallbacks(tick);}
    @Override protected void onSaveInstanceState(Bundle out) {out.putString("selected",selected.toString());out.putString("month",month.toString());super.onSaveInstanceState(out);}
    @Override protected void onDestroy() {handler.removeCallbacksAndMessages(null);network.shutdown();super.onDestroy();}
    private int dp(float n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView text(String value,float size,int color) {TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    private LinearLayout column() {LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.VERTICAL);return v;}
    private LinearLayout row() {LinearLayout v=new LinearLayout(this);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    private GradientDrawable background(int color,int radius) {GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private TextView action(String title,String description,Runnable run) {
        TextView b=text(title,19,PURPLE);b.setGravity(Gravity.CENTER);b.setMinHeight(dp(48));b.setMinWidth(dp(48));b.setContentDescription(description);b.setFocusable(true);b.setClickable(true);
        android.util.TypedValue ripple=new android.util.TypedValue();getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless,ripple,true);b.setBackgroundResource(ripple.resourceId);
        b.setOnClickListener(v->run.run());return b;
    }
    private void build() {
        LinearLayout root=column();root.setBackgroundColor(PAPER);
        if(Build.VERSION.SDK_INT>=30) root.setOnApplyWindowInsetsListener((v,insets)-> {android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});
        if(Build.VERSION.SDK_INT<30) root.setFitsSystemWindows(true);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setClipToPadding(false);
        content=column();content.setPadding(dp(16),dp(8),dp(16),dp(32));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,-1));setContentView(root);
        LinearLayout brand=row();TextView name=text("Jotday",16,INK);name.setTypeface(null,Typeface.BOLD);brand.addView(name,new LinearLayout.LayoutParams(0,dp(40),1));
        status=text(syncText,11,MUTED);status.setMaxLines(2);status.setPadding(dp(8),0,dp(8),0);status.setOnClickListener(v->synchronize());brand.addView(status,new LinearLayout.LayoutParams(dp(170),-2));
        brand.addView(action("⋯","更多选项",this::menu));content.addView(brand);
        LinearLayout heading=row();monthTitle=text("",27,INK);monthTitle.setTypeface(null,Typeface.BOLD);monthTitle.setMaxLines(1);monthTitle.setAutoSizeTextTypeUniformWithConfiguration(14,27,1,android.util.TypedValue.COMPLEX_UNIT_SP);monthTitle.setOnClickListener(v->jump());monthTitle.setMinHeight(dp(56));monthTitle.setContentDescription("选择年月");heading.addView(monthTitle,new LinearLayout.LayoutParams(0,-2,1));
        heading.addView(action("‹","上个月",()->changeMonth(-1)));heading.addView(action("›","下个月",()->changeMonth(1)));heading.addView(action("＋","新增日程",()->edit(null,"all",null)));content.addView(heading);
        grid=new MonthGrid(this,new MonthGrid.Listener() {
            public void select(LocalDate day) {selected=day;month=YearMonth.from(day);render();}
            public void month(int delta) {changeMonth(delta);}
            public void scale(float value) {zoom=value;prefs.edit().putFloat("month-zoom",value).apply();}
        });content.addView(grid);
        View divider=new View(this);divider.setBackgroundColor(0xffe6dccf);LinearLayout.LayoutParams d=new LinearLayout.LayoutParams(-1,dp(1));d.setMargins(0,dp(18),0,dp(18));content.addView(divider,d);
        agenda=column();content.addView(agenda);render();
    }
    private List<CalendarProjector.Occurrence> occurrences(LocalDate from,LocalDate to) {
        List<CalendarProjector.Occurrence> events=CalendarProjector.project(store.all("event"),from,to);
        events.addAll(CalendarProjector.reminders(store,from,to));events.sort(Comparator.comparing((CalendarProjector.Occurrence o)->!o.allDay()).thenComparing(o->o.start));return events;
    }
    private void render() {
        monthTitle.setText(month.getYear()+"年 "+month.getMonthValue()+"月");
        Set<LocalDate> busy=new HashSet<>();for(CalendarProjector.Occurrence o:occurrences(month.atDay(1).minusDays(7),month.atEndOfMonth().plusDays(7))) {
            LocalDate start=o.start.toLocalDate(),end=o.end.minusNanos(1).toLocalDate();
            for(LocalDate day=start.isBefore(month.atDay(1).minusDays(7))?month.atDay(1).minusDays(7):start;!day.isAfter(end)&&!day.isAfter(month.atEndOfMonth().plusDays(7));day=day.plusDays(1))busy.add(day);
        }
        grid.render(month,selected,busy,zoom);agenda.removeAllViews();
        LinearLayout heading=row();TextView date=text(selected.format(DateTimeFormatter.ofPattern("M月d日 · EEEE",Locale.SIMPLIFIED_CHINESE)),18,INK);date.setTypeface(null,Typeface.BOLD);heading.addView(date,new LinearLayout.LayoutParams(0,dp(48),1));
        heading.addView(action("↶","回到今天",()-> {selected=LocalDate.now(CalendarProjector.ZONE);month=YearMonth.from(selected);render();}));agenda.addView(heading);
        List<CalendarProjector.Occurrence> events=occurrences(selected,selected);
        if(events.isEmpty()) {TextView empty=text("今天留点空白也很好。",15,MUTED);empty.setPadding(dp(4),dp(24),0,dp(16));agenda.addView(empty);agenda.addView(action("＋ 添加安排","添加当天安排",()->edit(null,"all",null)));}
        for(CalendarProjector.Occurrence o:events) {
            LinearLayout item=row();item.setPadding(dp(12),dp(15),dp(12),dp(15));item.setBackground(background(0xfffffcf6,18));
            TextView time=text(o.allDay()?"全天":o.start.toLocalDate().isBefore(selected)?"跨天":o.start.toLocalTime().toString(),13,MUTED);time.setGravity(Gravity.TOP);item.addView(time,new LinearLayout.LayoutParams(dp(52),-1));
            View strip=new View(this);strip.setBackground(background(color(o.source.optString("color","purple")),3));LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(dp(3),dp(34));sp.setMargins(0,0,dp(12),0);item.addView(strip,sp);
            LinearLayout detail=column();TextView title=text(o.title(),17,INK);title.setLineSpacing(dp(3),1);detail.addView(title);
            String meta=o.reminder?(o.event.optBoolean("completed")?"待办 · 已完成":"待办"):(o.allDay()?"全天安排":o.end.toLocalDate().equals(selected)?"至 "+o.end.toLocalTime():"至 "+o.end.format(DateTimeFormatter.ofPattern("M月d日 HH:mm")));
            String location=Json.str(o.source,"location");if(!location.isEmpty())meta+=" · "+location;
            TextView subtitle=text(meta,12,MUTED);subtitle.setPadding(0,dp(6),0,0);detail.addView(subtitle);item.addView(detail,new LinearLayout.LayoutParams(0,-2,1));
            item.setOnClickListener(v-> {if(o.reminder) reminder(o);else chooseScope(o,false);});item.setFocusable(true);item.setContentDescription(o.title()+"，"+meta);
            LinearLayout.LayoutParams ip=new LinearLayout.LayoutParams(-1,-2);ip.setMargins(0,dp(5),0,dp(5));agenda.addView(item,ip);
        }
        if(store.draft()!=null) {TextView draft=action("继续未保存的日程","恢复日程草稿",()->edit(null,"all",store.draft()));draft.setTextSize(14);agenda.addView(draft);}
        int conflicts=store.conflicts().length();if(conflicts>0) {TextView info=text("有 "+conflicts+" 条同步冲突记录，可在更多菜单查看。",12,MUTED);info.setPadding(0,dp(16),0,0);agenda.addView(info);}
        Set<String> imports=new HashSet<>();int duplicates=0;for(JSONObject e:store.all("event")){String key=Json.str(e,"importKey");if(Json.str(e,"deletedAt").isEmpty()&&!key.isEmpty()&&!imports.add(key))duplicates++;}
        if(duplicates>0)agenda.addView(text("有 "+duplicates+" 项相同来源的导入日程。已保留各设备版本，请核对后删除多余项。",12,MUTED));
    }
    private int color(String value) {
        switch(value) {case "green":case "sage":return 0xff94aa8c;case "blue":case "sky":case "mist":return 0xff9fb5c7;case "orange":case "amber":case "peach":return 0xffd4a471;case "rose":case "dustyrose":case "clay":return 0xffc19594;default:return 0xffb19bc4;}
    }
    private void changeMonth(int delta) {month=month.plusMonths(delta);selected=month.atDay(Math.min(selected.getDayOfMonth(),month.lengthOfMonth()));render();}
    private void jump() {new DatePickerDialog(this,(v,y,m,d)-> {selected=LocalDate.of(y,m+1,d);month=YearMonth.from(selected);render();},selected.getYear(),selected.getMonthValue()-1,selected.getDayOfMonth()).show();}
    private void menu() {
        String[] choices={"与网页版配对","生成配对码","立即同步","月历恢复默认大小","放大月历","缩小月历","同步冲突记录","关于 Jotday"};
        new AlertDialog.Builder(this).setTitle("Jotday").setItems(choices,(dialog,index)-> {
            switch(index) {
                case 0:pair();break;case 1:createPairing();break;case 2:synchronize();break;
                case 3:case 4:case 5:zoom=index==3?1f:Math.max(.85f,Math.min(1.5f,zoom+(index==4?.1f:-.1f)));prefs.edit().putFloat("month-zoom",zoom).apply();render();break;
                case 6:showConflicts();break;
                default:new AlertDialog.Builder(this).setTitle("Jotday 0.1.0").setMessage("双指捏合调整月历大小，左右滑动切换月份。\n\n内容先保存在手机，打开应用并联网时自动同步。网页与手机需加入同一个工作区。\n\n显示时区：香港。日程保留原始时区。\n网页待办在日历中显示，完整编辑请使用网页版。").setPositiveButton("知道了",null).show();
            }
        }).show();
    }
    private void synchronize() {
        if(syncing || !prefs.getBoolean("paired",false))return;
        syncing=true;PlannerStore target=store;syncText="正在同步…";status.setText(syncText);
        network.execute(()-> {
            String message;
            try {PlannerSync sync=new PlannerSync(target,cloud);sync.run();int pending=sync.pending();message=pending>0?pending+" 项待同步":"已同步 · "+LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"));}
            catch(Exception e) {message=e.getMessage()==null?"暂时离线，内容已保留":e.getMessage();}
            String result=message;handler.post(()-> {syncing=false;if(isDestroyed()||target!=store)return;syncText=result;status.setText(result);render();});
        });
    }
    private void pair() {
        EditText code=input("6 位配对码");code.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);code.setFilters(new InputFilter[]{new InputFilter.LengthFilter(6)});
        LinearLayout body=column();body.setPadding(dp(24),dp(8),dp(24),0);body.addView(text("在网页版设置中生成配对码。",14,MUTED));body.addView(code);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("连接网页版").setView(body).setNegativeButton("取消",null).setPositiveButton("连接",null).create();
        dialog.setOnShowListener(v->dialog.getButton(-1).setOnClickListener(button-> {
            String value=code.getText().toString();if(!value.matches("[0-9]{6}")){code.setError("请输入 6 位数字");return;}
            dialog.getButton(-1).setEnabled(false);PlannerStore previous=store;boolean local=!prefs.getBoolean("paired",false);
            network.execute(()-> {
                try {
                    String workspace=cloud.redeem(value);PlannerStore next=new PlannerStore(this,workspace);
                    if(local&&!previous.workspace.equals(workspace))next.adoptFrom(previous);
                    prefs.edit().putString("workspace",workspace).putBoolean("paired",true).commit();
                    handler.post(()-> {store=next;dialog.dismiss();syncing=false;render();synchronize();});
                }catch(Exception e){handler.post(()-> {dialog.getButton(-1).setEnabled(true);code.setError(e.getMessage());});}
            });
        }));dialog.show();
    }
    private void createPairing() {
        if(syncing){toast("请等本轮同步结束");return;}status.setText("正在生成配对码…");
        network.execute(()-> {try {
            cloud.rpc("enroll_local_workspace",Json.obj("p_workspace_id",store.workspace));
            prefs.edit().putBoolean("paired",true).commit();
            JSONObject result=cloud.function("create-pairing",Json.obj("workspaceId",store.workspace,"webUrl","https://smoke-notes-philipwwq.pages.dev"));
            String code=result.getString("code");handler.post(()-> {new AlertDialog.Builder(this).setTitle("配对码  "+code).setMessage("在网页版或另一台设备输入此码。配对码过期后可重新生成。").setPositiveButton("完成",null).show();synchronize();});
        } catch(Exception e) {handler.post(()-> {status.setText(e.getMessage());toast(e.getMessage());});} });
    }
    private void showConflicts() {
        JSONArray conflicts=store.conflicts();if(conflicts.length()==0){toast("没有同步冲突");return;}
        List<String> names=new ArrayList<>();for(int i=0;i<conflicts.length();i++){JSONObject c=conflicts.optJSONObject(i),local=c.optJSONObject("local");names.add((local==null?"删除记录":local.optString("title",local.optString("name","分类／时间")))) ;}
        new AlertDialog.Builder(this).setTitle("冲突记录 · 原内容已保留").setItems(names.toArray(new String[0]),(d,index)-> {
            JSONObject c=conflicts.optJSONObject(index),local=c.optJSONObject("local");
            new AlertDialog.Builder(this).setTitle(names.get(index)).setMessage("本机版本：\n"+(local==null?"已删除":local.toString())+"\n\n云端版本：\n"+c.opt("remote")).setPositiveButton("关闭",null).show();
        }).setPositiveButton("完成",null).show();
    }
    private void reminder(CalendarProjector.Occurrence o) {
        new AlertDialog.Builder(this).setTitle(o.title()).setMessage(o.source.optString("notes")+"\n\n这是网页版待办，完成状态与原记录同步。完整编辑请使用网页版。").setPositiveButton("关闭",null).show();
    }
    private void chooseScope(CalendarProjector.Occurrence o,boolean deleting) {
        if(!o.recurring()){if(deleting)delete(o,"all");else edit(o,"all",null);return;}
        new AlertDialog.Builder(this).setTitle(deleting?"删除重复日程":"编辑重复日程").setItems(new String[]{"仅这一次","这次及以后的日程","整个系列"},(d,index)-> {
            String scope=new String[]{"one","following","all"}[index];if(deleting)delete(o,scope);else edit(o,scope,null);
        }).show();
    }
    private void delete(CalendarProjector.Occurrence o,String scope) {
        new AlertDialog.Builder(this).setTitle("删除这项安排？").setMessage("删除会同步到已配对的设备。").setNegativeButton("取消",null).setPositiveButton("删除",(d,w)-> {
            JSONObject current=store.get("event",o.event.optString("id"));if(current==null)return;
            if(scope.equals("one")) {JSONObject ex=current.optJSONObject("exceptions");if(ex==null)ex=new JSONObject();Json.put(ex,o.occurrenceDate,null);Json.put(current,"exceptions",ex);}
            else if(scope.equals("following")&&o.occurrenceDate.compareTo(current.optString("start").substring(0,10))>0) truncate(current,o.occurrenceDate);
            else Json.put(current,"deletedAt",Instant.now().toString());
            Json.put(current,"updatedAt",Instant.now().toString());store.put("event",current);render();synchronize();
        }).show();
    }
    private void truncate(JSONObject event,String date) {
        JSONObject repeat=event.optJSONObject("repeat");if(repeat==null)return;repeat.remove("count");Json.put(repeat,"until",LocalDate.parse(date).minusDays(1).toString());
        JSONObject ex=event.optJSONObject("exceptions"),keep=new JSONObject();if(ex!=null)ex.keys().forEachRemaining(key->{if(key.compareTo(date)<0)Json.put(keep,key,ex.opt(key));});Json.put(event,"exceptions",keep);
    }
    private EditText input(String hint) {EditText v=new EditText(this);v.setHint(hint);v.setTextSize(16);v.setTextColor(INK);v.setPadding(dp(4),dp(8),dp(4),dp(8));v.setMinHeight(dp(48));return v;}
    private void toast(String message) {Toast.makeText(this,message,Toast.LENGTH_LONG).show();}

    private void edit(CalendarProjector.Occurrence occurrence,String scope,JSONObject draft) {
        final JSONObject original=occurrence==null?null:store.get("event",occurrence.event.optString("id"));
        if(occurrence!=null&&original==null){toast("日程已变更，请刷新");return;}
        JSONObject seed=draft!=null?draft.optJSONObject("value"):occurrence==null?null:scope.equals("all")?original:occurrence.source;
        final LocalDateTime[] times={selected.atTime(9,0),selected.atTime(10,0)};
        if(seed!=null){times[0]=LocalDateTime.parse(seed.optString("start"));times[1]=LocalDateTime.parse(seed.optString("end"));}
        final String editId=draft!=null?Json.str(draft,"eventId"):original==null?"":original.optString("id");
        final String editScope=draft!=null?draft.optString("scope","all"):scope;
        final String occurrenceDate=draft!=null?Json.str(draft,"occurrenceDate"):occurrence==null?"":occurrence.occurrenceDate;
        final JSONObject baseline=draft!=null?draft.optJSONObject("baseline"):original;
        final JSONObject seedValue=seed==null?Json.obj():Json.copy(seed);
        CompactSheet dialog=new CompactSheet(this);LinearLayout panel=column();panel.setPadding(dp(16),dp(8),dp(16),dp(16));panel.setBackground(background(PAPER,24));
        LinearLayout bar=row();bar.addView(action("取消","关闭编辑",dialog::dismiss));TextView caption=text(editId.isEmpty()?"新安排":"编辑安排",17,INK);caption.setGravity(Gravity.CENTER);caption.setTypeface(null,Typeface.BOLD);bar.addView(caption,new LinearLayout.LayoutParams(0,dp(48),1));TextView save=action("保存","保存日程",()->{});save.setTextSize(16);bar.addView(save);panel.addView(bar);
        ScrollView fieldsScroll=new ScrollView(this);LinearLayout fields=column();fieldsScroll.addView(fields);panel.addView(fieldsScroll,new LinearLayout.LayoutParams(-1,-2));
        EditText title=input("这天有什么安排？");title.setText(seedValue.optString("title"));title.setMaxLines(3);title.setFilters(new InputFilter[]{new InputFilter.LengthFilter(240)});fields.addView(title);
        Switch allDay=new Switch(this);allDay.setText("全天");allDay.setTextSize(15);allDay.setMinHeight(dp(48));allDay.setChecked(seedValue.optBoolean("allDay"));fields.addView(allDay);
        TextView start=action("","开始日期和时间",()->{}),end=action("","结束日期和时间",()->{});start.setTextSize(15);end.setTextSize(15);fields.addView(start);fields.addView(end);
        LinearLayout extra=column();extra.setVisibility(View.GONE);
        TextView more=action("更多选项  ⌄","标签、重复、地点及备注",()-> {extra.setVisibility(extra.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE);});more.setTextSize(14);fields.addView(more);fields.addView(extra);
        List<JSONObject> types=store.all("type");List<String> typeNames=new ArrayList<>();typeNames.add("无分类");int typeIndex=0;for(int i=0;i<types.size();i++){typeNames.add(types.get(i).optString("name"));if(types.get(i).optString("id").equals(Json.str(seedValue,"typeId")))typeIndex=i+1;}
        Spinner type=new Spinner(this);type.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,typeNames));type.setSelection(typeIndex);extra.addView(text("分类",12,MUTED));extra.addView(type,new LinearLayout.LayoutParams(-1,dp(48)));
        Spinner repeat=new Spinner(this);String[] repeatNames=seedValue.optJSONObject("repeat")==null?new String[]{"不重复","每天","每周","每月","每年"}:new String[]{"保留现有重复规则","不重复","每天","每周","每月","每年"};
        repeat.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,repeatNames));repeat.setEnabled(!editScope.equals("one"));extra.addView(text(editScope.equals("one")?"仅编辑本次，不改重复规则":"重复",12,MUTED));extra.addView(repeat,new LinearLayout.LayoutParams(-1,dp(48)));
        EditText location=input("地点"),notes=input("备注"),url=input("链接（可选）");location.setText(seedValue.optString("location"));notes.setText(seedValue.optString("notes"));url.setText(seedValue.optString("url"));notes.setMinLines(2);extra.addView(location);extra.addView(notes);extra.addView(url);
        extra.addView(text("时区："+seedValue.optString("timeZone","Asia/Hong_Kong"),12,MUTED));
        boolean[] finished={false},initializing={true};
        java.util.function.Supplier<JSONObject> value=()-> {
            JSONObject v=Json.obj();if(seedValue.optJSONObject("repeat")!=null)Json.put(v,"repeat",Json.copy(seedValue.optJSONObject("repeat")));Json.put(v,"title",title.getText().toString().trim());Json.put(v,"start",CalendarProjector.stamp(times[0]));Json.put(v,"end",CalendarProjector.stamp(times[1]));Json.put(v,"allDay",allDay.isChecked());
            Json.put(v,"notes",notes.getText().toString());Json.put(v,"location",location.getText().toString());Json.put(v,"url",url.getText().toString());Json.put(v,"timeZone",seedValue.optString("timeZone","Asia/Hong_Kong"));
            int ti=type.getSelectedItemPosition();JSONObject label=ti>0?types.get(ti-1):null;Json.put(v,"typeId",label==null?null:label.optString("id"));Json.put(v,"color",label==null?seedValue.optString("color","purple"):label.optString("color"));
            int ri=repeat.getSelectedItemPosition()-(seedValue.optJSONObject("repeat")==null?0:1);
            if(editScope.equals("one")||ri==0)v.remove("repeat");else if(ri>0){JSONObject r=Json.obj("frequency",new String[]{"daily","weekly","monthly","yearly"}[ri-1],"interval",1);if(ri==2)Json.put(r,"weekdays",new JSONArray().put(times[0].getDayOfWeek().getValue()%7));Json.put(v,"repeat",r);}
            return v;
        };
        Runnable saveDraft=()-> {if(!finished[0]&&!initializing[0]&&(!title.getText().toString().trim().isEmpty()||!notes.getText().toString().isEmpty()||!location.getText().toString().isEmpty()))store.draft(Json.obj("eventId",editId,"scope",editScope,"occurrenceDate",occurrenceDate,"baseline",baseline,"value",value.get()));};
        Runnable refreshTimes=()-> {start.setText("开始   "+times[0].format(DateTimeFormatter.ofPattern(allDay.isChecked()?"M月d日 E":"M月d日 E   HH:mm",Locale.SIMPLIFIED_CHINESE)));end.setText("结束   "+(allDay.isChecked()?times[1].minusDays(1):times[1]).format(DateTimeFormatter.ofPattern(allDay.isChecked()?"M月d日 E":"M月d日 E   HH:mm",Locale.SIMPLIFIED_CHINESE)));saveDraft.run();};
        java.util.function.IntConsumer pick=which-> {
            LocalDateTime shown=allDay.isChecked()&&which==1?times[1].minusDays(1):times[which];
            new DatePickerDialog(this,(v,y,m,d)-> {
                LocalDate date=LocalDate.of(y,m+1,d);
                if(allDay.isChecked()) {times[which]=(which==1?date.plusDays(1):date).atStartOfDay();refreshTimes.run();}
                else new TimePickerDialog(this,(view,h,min)-> {times[which]=date.atTime(h,min);refreshTimes.run();},shown.getHour(),shown.getMinute(),true).show();
            },shown.getYear(),shown.getMonthValue()-1,shown.getDayOfMonth()).show();
        };
        start.setOnClickListener(v->pick.accept(0));end.setOnClickListener(v->pick.accept(1));
        allDay.setOnCheckedChangeListener((v,checked)-> {if(checked){times[0]=times[0].toLocalDate().atStartOfDay();times[1]=times[1].toLocalDate().plusDays(times[1].toLocalTime().equals(LocalTime.MIDNIGHT)?0:1).atStartOfDay();if(!times[1].isAfter(times[0]))times[1]=times[0].plusDays(1);}else {times[0]=times[0].withHour(9);times[1]=times[0].plusHours(1);}refreshTimes.run();});
        TextWatcher watcher=new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){saveDraft.run();}public void afterTextChanged(Editable e){}};
        for(EditText field:new EditText[]{title,location,notes,url})field.addTextChangedListener(watcher);
        AdapterView.OnItemSelectedListener changed=new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> a,View v,int pos,long id){saveDraft.run();}public void onNothingSelected(AdapterView<?> a){}};type.setOnItemSelectedListener(changed);repeat.setOnItemSelectedListener(changed);
        save.setOnClickListener(view-> {
            JSONObject v=value.get();String error=validate(v);if(error!=null){toast(error);return;}
            JSONObject current=editId.isEmpty()?null:store.get("event",editId);
            if(!editId.isEmpty()&&(current==null||!Json.str(current,"deletedAt").isEmpty()||!Json.same(current,baseline))){toast("日程已在同步中变更。草稿已保留，请关闭后重新打开日程。");return;}
            saveEvent(v,current,editScope,occurrenceDate);finished[0]=true;store.clearDraft();dialog.dismiss();render();synchronize();
        });
        if(occurrence!=null) {TextView remove=action("删除安排","删除此日程",()-> {saveDraft.run();dialog.dismiss();chooseScope(occurrence,true);});remove.setTextSize(14);remove.setTextColor(0xffaa5858);extra.addView(remove);}
        initializing[0]=false;refreshTimes.run();dialog.setContentView(panel);
        dialog.setMaxWidth(dp(520));dialog.setMaxHeight((int)(getResources().getDisplayMetrics().heightPixels*.78));
        dialog.setOnDismissListener(d->{saveDraft.run();render();});dialog.show();dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    }
    private String validate(JSONObject v) {
        if(v.optString("title").trim().isEmpty())return "请填写日程名称";
        LocalDateTime start=LocalDateTime.parse(v.optString("start")),end=LocalDateTime.parse(v.optString("end"));
        if(!end.isAfter(start))return "结束时间必须晚于开始时间";
        if(Duration.between(start,end).compareTo(Duration.ofDays(366))>0)return "单个日程不能超过一年";
        if(v.optString("notes").length()>4000||v.optString("location").length()>500||v.optString("url").length()>2000)return "备注、地点或链接过长";
        if(!v.optString("url").isEmpty()&&!v.optString("url").matches("https?://.*"))return "链接须以 https:// 或 http:// 开头";
        if(!v.optBoolean("allDay")){ZoneId z=ZoneId.of(v.optString("timeZone"));if(z.getRules().getValidOffsets(start).isEmpty()||z.getRules().getValidOffsets(end).isEmpty())return "该时区此刻处于夏令时跳时，请选择其他时间";}
        return null;
    }
    private void saveEvent(JSONObject value,JSONObject current,String scope,String date) {
        store.transaction(()-> {
            JSONObject saved=Json.copy(value);String now=Instant.now().toString();
            if(current!=null&&scope.equals("one")) {
                saved=Json.copy(current);JSONObject exceptions=saved.optJSONObject("exceptions");if(exceptions==null)exceptions=new JSONObject();Json.put(exceptions,date,value);Json.put(saved,"exceptions",exceptions);
            } else if(current!=null&&scope.equals("following")&&current.optJSONObject("repeat")!=null) {
                JSONObject old=Json.copy(current);JSONObject r=saved.optJSONObject("repeat"),oldRule=current.optJSONObject("repeat");
                if(r!=null&&r.has("count")&&r.optInt("count")==oldRule.optInt("count")) {
                    int used=0;LocalDate first=LocalDate.parse(current.optString("start").substring(0,10));for(LocalDate day=first;day.isBefore(LocalDate.parse(date));day=day.plusDays(1))if(CalendarProjector.matches(first,day,oldRule))used++;
                    Json.put(r,"count",Math.max(1,r.optInt("count")-used));
                }
                JSONObject future=new JSONObject(),ex=current.optJSONObject("exceptions");if(ex!=null)ex.keys().forEachRemaining(key->{if(key.compareTo(date)>0)Json.put(future,key,ex.opt(key));});
                Json.put(saved,"exceptions",r==null?new JSONObject():future);Json.put(saved,"id",UUID.randomUUID().toString());saved.remove("importKey");
                truncate(old,date);if(date.compareTo(current.optString("start").substring(0,10))<=0)Json.put(old,"deletedAt",now);Json.put(old,"updatedAt",now);store.put("event",old);
            } else {Json.put(saved,"id",current==null?UUID.randomUUID().toString():current.optString("id"));if(current!=null&&current.has("importKey"))Json.put(saved,"importKey",current.opt("importKey"));Json.put(saved,"exceptions",saved.optJSONObject("repeat")==null?new JSONObject():current==null?new JSONObject():current.optJSONObject("exceptions"));}
            Json.put(saved,"workspaceId",store.workspace);Json.put(saved,"deletedAt",null);Json.put(saved,"updatedAt",now);store.put("event",saved);
        });
    }
}
