package app.jotday.calendar;

import android.app.*;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.time.*;
import java.util.*;

/** Native phone views for the shared workspace; all mutations are offline first. */
final class WorkspaceScreens {
    private final MainActivity host;private String notebook,query="";private LinearLayout list;
    private LocalDate day;private String filter="today";
    private static final int INK=0xff332d39,PURPLE=0xff756486,MUTED=0xff8b8176;
    private static final String[] COLORS={"amber","rose","sage","sky","violet","graphite","lavender","mauve","mist","dustyrose","peach","clay"};
    private static final String[] COLOR_NAMES={"暖黄","蔷薇","鼠尾草","天蓝","紫罗兰","石墨","薰衣草","淡紫","雾蓝","灰粉","桃色","陶土"};
    private static final int[] TINTS={0xffffe4ab,0xfff1d0d2,0xffd9e4d0,0xffd3e5f1,0xffdfd1f0,0xffd4d2d7,0xffe7e0f4,0xffe4d5e4,0xffdce6e9,0xffead6d4,0xfff6ddca,0xffe9d3c3};
    WorkspaceScreens(MainActivity h){host=h;day=WorkspaceRecords.today(store());}
    private PlannerStore store(){return host.workspaceStore();}
    private int dp(int v){return Math.round(v*host.getResources().getDisplayMetrics().density);}
    private LinearLayout col(){LinearLayout l=new LinearLayout(host);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private LinearLayout row(){LinearLayout l=new LinearLayout(host);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
    private TextView text(String t,int size,int color){TextView v=new TextView(host);v.setText(t);v.setTextSize(size);v.setTextColor(color);return v;}
    private TextView action(String title,Runnable run){TextView b=text(title,15,PURPLE);b.setGravity(Gravity.CENTER);b.setMinHeight(dp(48));b.setPadding(dp(12),dp(6),dp(12),dp(6));b.setContentDescription(title);b.setOnClickListener(v->run.run());b.setFocusable(true);return b;}
    private EditText input(String hint,String value,int limit){EditText e=new EditText(host);e.setHint(hint);e.setText(value);e.setTextSize(16);e.setTextColor(INK);e.setMinHeight(dp(48));e.setFilters(new InputFilter[]{new InputFilter.LengthFilter(limit)});return e;}
    private GradientDrawable bg(int color){GradientDrawable b=new GradientDrawable();b.setColor(color);b.setCornerRadius(dp(18));return b;}
    private void card(LinearLayout parent,View card){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,dp(5),0,dp(5));card.setPadding(dp(16),dp(14),dp(16),dp(14));parent.addView(card,p);}
    void render(LinearLayout parent,String tab){
        if(tab.equals("settings")){settings(parent);return;}
        LinearLayout heading=row();TextView title=text(tab.equals("notes")?"便签":"待办",30,INK);title.setTypeface(null,Typeface.BOLD);heading.addView(title,new LinearLayout.LayoutParams(0,dp(64),1));heading.addView(action(tab.equals("notes")?"＋便签":"＋待办",()->{if(tab.equals("notes"))editNote(null);else editTodo(null);}));parent.addView(heading);
        if(tab.equals("notes")){
            EditText search=input("搜索标题、正文与便签本",query,200);search.setSingleLine(true);parent.addView(search);
            LinearLayout bar=row();bar.addView(action("所有便签",()->{notebook=null;refreshNotes();}));bar.addView(action("便签本",this::chooseNotebook));bar.addView(action("＋便签本",()->editNotebook(null)));parent.addView(bar);
            list=col();parent.addView(list);search.addTextChangedListener(watch(()->{query=search.getText().toString();refreshNotes();}));refreshNotes();
        }else{
            LinearLayout nav=row();nav.addView(action("‹",()->{day=day.minusDays(1);host.refreshWorkspace();}));nav.addView(action(day.toString(),()->new DatePickerDialog(host,(v,y,m,d)->{day=LocalDate.of(y,m+1,d);filter="today";host.refreshWorkspace();},day.getYear(),day.getMonthValue()-1,day.getDayOfMonth()).show()),new LinearLayout.LayoutParams(0,-2,1));nav.addView(action("›",()->{day=day.plusDays(1);host.refreshWorkspace();}));parent.addView(nav);
            LinearLayout filters=row();for(String[] f:new String[][]{{"today","当天"},{"all","全部"},{"series","重复"}}){TextView a=action(f[1],()->{filter=f[0];host.refreshWorkspace();});if(filter.equals(f[0]))a.setBackground(bg(0xffe6dff1));filters.addView(a,new LinearLayout.LayoutParams(0,-2,1));}parent.addView(filters);list=col();parent.addView(list);refreshTodos();
        }
    }
    private TextWatcher watch(Runnable r){return new TextWatcher(){public void beforeTextChanged(CharSequence s,int a,int c,int f){}public void onTextChanged(CharSequence s,int a,int b,int c){r.run();}public void afterTextChanged(Editable e){}};}
    private void refreshNotes(){if(list==null)return;list.removeAllViews();String q=query.toLowerCase(Locale.ROOT);int count=0;
        if(notebook!=null){JSONObject book=store().get("notebook",notebook);if(!WorkspaceRecords.alive(book))notebook=null;else list.addView(action(book.optString("name")+" · 管理",()->editNotebook(book)));}
        for(JSONObject note:WorkspaceRecords.visible(store(),"note")){
            JSONObject book=store().get("notebook",note.optString("notebook_id"));if(!WorkspaceRecords.alive(book))continue;if(notebook!=null&&!notebook.equals(note.optString("notebook_id")))continue;
            if(!(note.optString("title")+note.optString("body")+book.optString("name")).toLowerCase(Locale.ROOT).contains(q))continue;
            LinearLayout c=col();int ci=Arrays.asList(COLORS).indexOf(note.optString("color"));c.setBackground(bg(TINTS[Math.max(0,ci)]));TextView title=text(note.optString("title").isEmpty()?"未命名便签":note.optString("title"),19,INK);title.setTypeface(null,Typeface.BOLD);c.addView(title);
            TextView preview=text(note.optString("body"),15,INK);preview.setMaxLines(4);preview.setEllipsize(TextUtils.TruncateAt.END);preview.setPadding(0,dp(9),0,dp(12));c.addView(preview);c.addView(text(book.optString("name"),12,MUTED));c.setContentDescription("便签："+title.getText());c.setOnClickListener(v->editNote(note));c.setOnLongClickListener(v->{noteMenu(note);return true;});card(list,c);count++;
        }
        if(count==0)card(list,text(query.isEmpty()?"让念头有个落脚的地方。\n点右上角写下第一张便签。":"没有找到匹配内容。",16,MUTED));
        if(store().draft("note-editor")!=null)list.addView(action("继续未保存的便签",()->editNote(null)));
    }
    private void chooseNotebook(){List<JSONObject> books=WorkspaceRecords.visible(store(),"notebook");String[] names=books.stream().map(b->b.optString("name")).toArray(String[]::new);new AlertDialog.Builder(host).setTitle("便签本").setItems(names,(d,i)->{notebook=books.get(i).optString("id");refreshNotes();}).setNeutralButton("新建",(d,w)->editNotebook(null)).show();}
    private void editNotebook(JSONObject original){EditText name=input("便签本名称",original==null?"":original.optString("name"),80);LinearLayout panel=col();panel.setPadding(dp(20),dp(8),dp(20),dp(12));panel.addView(name);
        AlertDialog dialog=new AlertDialog.Builder(host).setTitle(original==null?"新便签本":"管理便签本").setView(panel).setNegativeButton("取消",null).setPositiveButton("保存",null).create();
        if(original!=null){panel.addView(action("置于最前",()->{JSONObject b=store().get("notebook",original.optString("id"));Json.put(b,"rank",firstRank("notebook"));WorkspaceRecords.save(store(),"notebook",b);dialog.dismiss();host.localChanged();}));panel.addView(action("移入回收站",()->{dialog.dismiss();remove("notebook",original);}));}
        dialog.setOnShowListener(v->dialog.getButton(-1).setOnClickListener(button->{String value=name.getText().toString().trim();if(value.isEmpty()){name.setError("请填写名称");return;}JSONObject b=original==null?WorkspaceRecords.create("notebook",store().workspace):store().get("notebook",original.optString("id"));if(b==null){host.message("便签本已变更");return;}Json.put(b,"name",value);WorkspaceRecords.save(store(),"notebook",b);notebook=b.optString("id");dialog.dismiss();host.localChanged();}));dialog.show();
    }
    private double firstRank(String kind){double min=0;for(JSONObject row:store().all(kind))min=Math.min(min,row.optDouble("rank"));return min-1;}
    private void noteMenu(JSONObject note){new AlertDialog.Builder(host).setTitle(note.optString("title","便签")).setItems(new String[]{"编辑","移动到便签本","置于最前","复制","移入回收站"},(d,i)->{
        if(i==0)editNote(note);else if(i==1){List<JSONObject> books=WorkspaceRecords.visible(store(),"notebook");new AlertDialog.Builder(host).setTitle("移动到").setItems(books.stream().map(b->b.optString("name")).toArray(String[]::new),(a,n)->{JSONObject current=store().get("note",note.optString("id"));Json.put(current,"notebook_id",books.get(n).optString("id"));WorkspaceRecords.save(store(),"note",current);host.localChanged();}).show();}
        else if(i==4)remove("note",note);else{JSONObject value=Json.copy(note);if(i==2)Json.put(value,"rank",firstRank("note"));else{Json.put(value,"id",UUID.randomUUID().toString());Json.put(value,"version",0);Json.put(value,"rank",System.currentTimeMillis());}WorkspaceRecords.save(store(),"note",value);host.localChanged();}
    }).show();}
    void editNote(JSONObject requested){
        List<JSONObject> books=WorkspaceRecords.visible(store(),"notebook");if(books.isEmpty()){JSONObject book=WorkspaceRecords.create("notebook",store().workspace);Json.put(book,"name","我的便签");WorkspaceRecords.save(store(),"notebook",book);books.add(book);}
        JSONObject draft=requested==null?store().draft("note-editor"):null;JSONObject original=requested;
        if(draft!=null)original=draft.optJSONObject("baseline");final JSONObject baseline=original==null?null:Json.copy(original);
        JSONObject value=draft!=null?draft.optJSONObject("value"):original==null?WorkspaceRecords.create("note",store().workspace):Json.copy(original);
        if(!value.has("notebook_id"))Json.put(value,"notebook_id",notebook==null?books.get(0).optString("id"):notebook);
        final JSONObject seed=value;final String workspace=store().workspace;
        Dialog dialog=new Dialog(host);LinearLayout root=col();root.setPadding(dp(16),dp(12),dp(16),dp(8));root.setBackgroundColor(0xfffaf3e7);LinearLayout bar=row();bar.addView(action("关闭",dialog::dismiss));TextView caption=text("写便签",18,INK);bar.addView(caption,new LinearLayout.LayoutParams(0,-2,1));TextView save=action("保存便签",()->{});bar.addView(save);root.addView(bar);
        ScrollView scroll=new ScrollView(host);LinearLayout fields=col();scroll.addView(fields);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));EditText title=input("标题",value.optString("title"),200);fields.addView(title);
        Spinner book=new Spinner(host);book.setAdapter(new ArrayAdapter<>(host,android.R.layout.simple_spinner_dropdown_item,books.stream().map(b->b.optString("name")).toArray(String[]::new)));for(int i=0;i<books.size();i++)if(books.get(i).optString("id").equals(value.optString("notebook_id")))book.setSelection(i);fields.addView(book,new LinearLayout.LayoutParams(-1,dp(48)));
        Spinner color=new Spinner(host);color.setAdapter(new ArrayAdapter<>(host,android.R.layout.simple_spinner_dropdown_item,COLOR_NAMES));color.setSelection(Math.max(0,Arrays.asList(COLORS).indexOf(value.optString("color","amber"))));fields.addView(color,new LinearLayout.LayoutParams(-1,dp(48)));
        NativeRichEditor editor=new NativeRichEditor(host,value.optJSONObject("content_json"),value.optString("body"));fields.addView(editor);
        java.util.function.Supplier<JSONObject> collect=()->{JSONObject row=Json.copy(seed);Json.put(row,"title",title.getText().toString().trim());JSONObject doc=editor.snapshot();Json.put(row,"content_json",doc);Json.put(row,"body",NativeRichEditor.body(doc));Json.put(row,"kind",seed.optString("kind","note"));Json.put(row,"notebook_id",books.get(book.getSelectedItemPosition()).optString("id"));Json.put(row,"color",COLORS[color.getSelectedItemPosition()]);return row;};
        boolean[] saved={false};Runnable stash=()->{if(!saved[0]&&workspace.equals(store().workspace))store().draft("note-editor",Json.obj("baseline",baseline,"value",collect.get()));};title.addTextChangedListener(watch(stash));editor.onChanged(stash);
        save.setOnClickListener(v->{if(!workspace.equals(store().workspace)){host.message("工作区已切换，请重新打开便签");return;}JSONObject current=baseline==null?null:store().get("note",baseline.optString("id"));if(baseline!=null&&!WorkspaceRecords.same("note",current,baseline)){stash.run();host.message("其他设备已修改此便签，草稿已保留");return;}JSONObject row=collect.get();if(row.optString("body").length()>100000||row.optJSONObject("content_json").toString().length()>500000){host.message("便签过长，请拆分保存");return;}WorkspaceRecords.save(store(),"note",row);saved[0]=true;store().clearDraft("note-editor");dialog.dismiss();host.localChanged();});
        dialog.setOnDismissListener(d->{stash.run();host.refreshWorkspace();});dialog.setContentView(root);dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);dialog.show();dialog.getWindow().setLayout(-1,-1);
    }
    private void refreshTodos(){WorkspaceRecords.reconcile(store());list.removeAllViews();List<JSONObject> todos;
        if(filter.equals("series")){todos=new ArrayList<>();for(JSONObject t:WorkspaceRecords.visible(store(),"todo")){JSONObject p=t.optJSONObject("planning");if(p!=null&&p.optString("kind").equals("series"))todos.add(t);}}
        else if(filter.equals("all")){todos=new ArrayList<>();for(JSONObject t:WorkspaceRecords.visible(store(),"todo")){JSONObject p=t.optJSONObject("planning");if(p==null||!Arrays.asList("series","settings").contains(p.optString("kind")))todos.add(t);}}
        else todos=CalendarProjector.projectTodos(store().all("todo"),day,day,WorkspaceRecords.today(store()));
        todos.sort(Comparator.comparingDouble(t->t.optDouble("rank")));long completed=todos.stream().filter(t->t.optBoolean("completed")).count();LinearLayout progress=col();progress.setBackground(bg(0xffede7f5));TextView number=text(completed+" / "+todos.size(),32,PURPLE);number.setTypeface(null,Typeface.BOLD);progress.addView(number);progress.addView(text(filter.equals("series")?"重复计划":"已完成 · 按自己的节奏来",13,MUTED));card(list,progress);
        for(JSONObject todo:todos){JSONObject p=todo.optJSONObject("planning");boolean series=p!=null&&p.optString("kind").equals("series");LinearLayout card=row();card.setBackground(bg(0xfffffefe));
            if(!series){CheckBox check=new CheckBox(host);check.setContentDescription("完成："+todo.optString("text"));check.setChecked(todo.optBoolean("completed"));check.setOnCheckedChangeListener((v,b)->{WorkspaceRecords.status(store(),todo,b?"completed":"open");host.localChanged();});card.addView(check);}
            LinearLayout detail=col();TextView title=text(todo.optString("text"),17,INK);if(todo.optBoolean("completed"))title.setPaintFlags(title.getPaintFlags()|android.graphics.Paint.STRIKE_THRU_TEXT_FLAG);detail.addView(title);String meta=p==null?"":p.optString("date")+(p.optString("status").equals("skipped")?" · 已跳过":"");if(series)meta="重复计划 · 点按管理";if(!meta.isEmpty())detail.addView(text(meta,12,MUTED));detail.setPadding(dp(8),0,0,0);card.addView(detail,new LinearLayout.LayoutParams(0,-2,1));card.setOnClickListener(v->{if(series)seriesMenu(todo);else editTodo(todo);});card.setOnLongClickListener(v->{todoMenu(todo);return true;});card(list,card);}
        if(todos.isEmpty())card(list,text("今天还没有待办。",16,MUTED));
    }
    private void todoMenu(JSONObject todo){JSONObject planning=todo.optJSONObject("planning");if(planning!=null&&planning.optString("kind").equals("series")){seriesMenu(todo);return;}new AlertDialog.Builder(host).setTitle(todo.optString("text")).setItems(new String[]{"编辑","跳过这一次","置于最前","移入回收站"},(d,i)->{if(i==0)editTodo(todo);else if(i==1){WorkspaceRecords.status(store(),todo,"skipped");host.localChanged();}else if(i==2){JSONObject row=WorkspaceRecords.explicit(todo,store());Json.put(row,"rank",firstRank("todo"));WorkspaceRecords.save(store(),"todo",row);host.localChanged();}else remove("todo",WorkspaceRecords.explicit(todo,store()));}).show();}
    void editTodo(JSONObject original){
        JSONObject p=original==null?null:original.optJSONObject("planning");if(p!=null&&p.optString("kind").equals("series")){seriesMenu(original);return;}
        LinearLayout panel=col();panel.setPadding(dp(20),dp(8),dp(20),dp(12));EditText title=input("待办名称",original==null?"":original.optString("text"),500),notes=input("备注",p==null?"":p.optString("notes"),10000);panel.addView(title);panel.addView(notes);
        LocalDate[] date={p!=null&&p.has("date")?LocalDate.parse(p.optString("date")):day};TextView dateButton=action(date[0].toString(),()->{});dateButton.setOnClickListener(v->new DatePickerDialog(host,(view,y,m,d)->{date[0]=LocalDate.of(y,m+1,d);dateButton.setText(date[0].toString());},date[0].getYear(),date[0].getMonthValue()-1,date[0].getDayOfMonth()).show());panel.addView(dateButton);if(p!=null&&p.optString("kind").equals("occurrence"))dateButton.setEnabled(false);
        Spinner repeat=new Spinner(host);repeat.setAdapter(new ArrayAdapter<>(host,android.R.layout.simple_spinner_dropdown_item,new String[]{"不重复","每天","周一至周五","每周同一天"}));if(original==null)panel.addView(repeat,new LinearLayout.LayoutParams(-1,dp(48)));
        ScrollView scroll=new ScrollView(host);scroll.addView(panel);AlertDialog dialog=new AlertDialog.Builder(host).setTitle(original==null?"新待办":"编辑待办").setView(scroll).setNegativeButton("取消",null).setPositiveButton("保存",null).create();
        dialog.setOnShowListener(v->dialog.getButton(-1).setOnClickListener(b->{String text=title.getText().toString().trim();if(text.isEmpty()){title.setError("请填写待办名称");return;}JSONObject current=original==null?null:store().get("todo",original.optString("id"));if(current!=null&&!WorkspaceRecords.same("todo",current,original)){host.message("待办已由其他设备更新，请重新打开");return;}
            JSONObject todo=original==null?WorkspaceRecords.task(store(),text,date[0],notes.getText().toString()):WorkspaceRecords.explicit(original,store());JSONObject plan=todo.optJSONObject("planning");Json.put(todo,"text",text);Json.put(plan,"date",date[0].toString());Json.put(plan,"notes",notes.getText().toString());WorkspaceRecords.stamp(plan,"text","date","notes");
            if(original==null&&repeat.getSelectedItemPosition()>0){int index=repeat.getSelectedItemPosition();JSONObject rule=Json.obj("kind",index==1?"daily":index==2?"weekdays":"weekly");if(index==3)Json.put(rule,"weekdays",new JSONArray().put(date[0].getDayOfWeek().getValue()%7));Json.put(plan,"kind","series");Json.put(plan,"revisions",new JSONArray().put(Json.obj("id",UUID.randomUUID().toString(),"effectiveFrom",date[0].toString(),"changedAt",Instant.now().toString(),"text",text,"notes",notes.getText().toString(),"repeat",rule,"paused",false,"stopped",false)));}
            WorkspaceRecords.save(store(),"todo",todo);dialog.dismiss();host.localChanged();}));dialog.show();dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    }
    private void seriesMenu(JSONObject todo){new AlertDialog.Builder(host).setTitle(todo.optString("text")).setItems(new String[]{"修改未来名称和备注","暂停／恢复未来任务","结束未来任务","移入回收站"},(d,i)->{
        if(i==3){remove("todo",todo);return;}JSONObject row=store().get("todo",todo.optString("id")),p=row.optJSONObject("planning");JSONArray revisions=p.optJSONArray("revisions");JSONObject latest=null;String best="";for(int n=0;n<revisions.length();n++){JSONObject r=revisions.optJSONObject(n);String key=r.optString("effectiveFrom")+r.optString("changedAt")+r.optString("id");if(key.compareTo(best)>0){best=key;latest=r;}}if(latest==null)return;JSONObject next=Json.copy(latest);Json.put(next,"id",UUID.randomUUID().toString());Json.put(next,"effectiveFrom",day.toString());Json.put(next,"changedAt",Instant.now().toString());
        Runnable save=()->{revisions.put(next);Json.put(row,"text",next.optString("text"));WorkspaceRecords.save(store(),"todo",row);host.localChanged();};
        if(i==0){LinearLayout body=col();EditText name=input("名称",next.optString("text"),500),notes=input("备注",next.optString("notes"),10000);body.addView(name);body.addView(notes);new AlertDialog.Builder(host).setTitle("从 "+day+" 起修改").setView(body).setNegativeButton("取消",null).setPositiveButton("保存",(a,w)->{if(name.getText().toString().trim().isEmpty())return;Json.put(next,"text",name.getText().toString().trim());Json.put(next,"notes",notes.getText().toString());save.run();}).show();}else{Json.put(next,i==1?"paused":"stopped",i==1?!next.optBoolean("paused"):true);save.run();}
    }).show();}
    private void remove(String kind,JSONObject original){new AlertDialog.Builder(host).setTitle("移入回收站？").setMessage(kind.equals("notebook")?"此便签本中的便签也会隐藏；恢复便签本后重新显示。":"可以在设置的回收站恢复。").setNegativeButton("取消",null).setPositiveButton("移入",(d,w)->{JSONObject current=store().get(kind,original.optString("id"));if(current==null)current=Json.copy(original);Json.put(current,"deleted_at",Instant.now().toString());WorkspaceRecords.save(store(),kind,current);host.localChanged();}).show();}
    private void trash() {
        List<String> names=new ArrayList<>(), kinds=new ArrayList<>();
        List<JSONObject> rows=new ArrayList<>();
        for (String kind:WorkspaceRecords.KINDS) for (JSONObject row:store().all(kind)) {
            if (WorkspaceRecords.alive(row) || WorkspaceRecords.purged(row)) continue;
            names.add((kind.equals("notebook")?"便签本 · ":kind.equals("note")?"便签 · ":"待办 · ")+row.optString("name",row.optString("title",row.optString("text"))));
            kinds.add(kind);rows.add(row);
        }
        AlertDialog.Builder dialog=new AlertDialog.Builder(host).setTitle("回收站").setNegativeButton("关闭",null);
        if (rows.isEmpty()) dialog.setMessage("没有可恢复的内容。");
        else {
            dialog.setItems(names.toArray(new String[0]),(d,i)->new AlertDialog.Builder(host).setTitle(names.get(i))
                .setItems(new String[]{"恢复","彻底删除"},(actions,choice)->{
                    JSONObject current=store().get(kinds.get(i),rows.get(i).optString("id"));
                    if (current==null||WorkspaceRecords.alive(current)||WorkspaceRecords.purged(current)) {trash();return;}
                    if (choice==0) {Json.put(current,"deleted_at",null);WorkspaceRecords.save(store(),kinds.get(i),current);host.localChanged();}
                    else confirmPurge(Collections.singletonList(kinds.get(i)),Collections.singletonList(rows.get(i)),"彻底删除“"+names.get(i)+"”");
                }).setNegativeButton("取消",null).show());
            dialog.setNeutralButton("清空最近删除",(d,w)->confirmPurge(kinds,rows,"清空最近删除中的 "+rows.size()+" 项内容"));
        }
        dialog.show();
    }
    private void confirmPurge(List<String> kinds,List<JSONObject> rows,String title) {
        String detail=(kinds.contains("notebook")?"便签本内的便签也会一并删除。":"")+"删除后无法恢复。";
        new AlertDialog.Builder(host).setTitle(title+"？").setMessage(detail).setNegativeButton("取消",null).setPositiveButton("确认删除",(d,w)->{
            try {
                store().transaction(()->{
                    for (int i=0;i<rows.size();i++) {
                        JSONObject previous=rows.get(i),current=store().get(kinds.get(i),previous.optString("id"));
                        if (current==null||WorkspaceRecords.purged(current)) continue;
                        if (WorkspaceRecords.alive(current)||!WorkspaceRecords.same(kinds.get(i),current,previous))
                            throw new IllegalStateException("内容已变更，请重新确认。");
                        WorkspaceRecords.purge(store(),kinds.get(i),current);
                    }
                });
                host.localChanged();
            } catch (RuntimeException failure) {Toast.makeText(host,"删除失败，请重新检查最近删除。",Toast.LENGTH_LONG).show();}
            trash();
        }).show();
    }
    private void settings(LinearLayout parent){TextView title=text("设置",30,INK);title.setTypeface(null,Typeface.BOLD);card(parent,title);
        parent.addView(action("设备配对与同步",host::openSyncMenu));parent.addView(action("桌面小组件",host::pinWidget));parent.addView(action("回收站",this::trash));parent.addView(action("日历分类",this::types));parent.addView(action("待办换日时间",this::boundary));parent.addView(action("导出本机备份",host::exportBackup));
        card(parent,text("Jotday "+BuildConfig.VERSION_NAME+"\n内容先保存在手机，配对后在应用前台同步。\n小组件显示本机已保存的内容。",14,MUTED));
    }
    private void boundary(){new AlertDialog.Builder(host).setTitle("待办在何时进入新一天").setItems(new String[]{"香港时间 00:00","香港时间 04:00"},(d,i)->{JSONObject settings=null;for(JSONObject t:store().all("todo")){JSONObject p=t.optJSONObject("planning");if(p!=null&&p.optString("kind").equals("settings")){settings=t;break;}}if(settings==null){settings=WorkspaceRecords.create("todo",store().workspace);Json.put(settings,"id",CalendarProjector.stableId("smoke-notes:todo-settings:"+store().workspace));}Json.put(settings,"text","待办设置");Json.put(settings,"completed",false);Json.put(settings,"planning",Json.obj("version",1,"kind","settings","settings",Json.obj("timeZone","Asia/Hong_Kong","dayBoundaryHour",i==0?0:4)));WorkspaceRecords.save(store(),"todo",settings);day=WorkspaceRecords.today(store());host.localChanged();}).show();}
    private void types(){List<JSONObject> types=new ArrayList<>();for(JSONObject t:store().all("type"))if(Json.str(t,"deletedAt").isEmpty())types.add(t);new AlertDialog.Builder(host).setTitle("日历分类").setItems(types.stream().map(t->t.optString("name")).toArray(String[]::new),(d,i)->editType(types.get(i))).setPositiveButton("新增",(d,w)->editType(null)).show();}
    private void editType(JSONObject old){LinearLayout body=col();EditText name=input("分类名称",old==null?"":old.optString("name"),40);body.addView(name);Spinner color=new Spinner(host);color.setAdapter(new ArrayAdapter<>(host,android.R.layout.simple_spinner_dropdown_item,COLOR_NAMES));body.addView(color);new AlertDialog.Builder(host).setTitle("日历分类").setView(body).setNegativeButton("取消",null).setPositiveButton("保存",(d,w)->{String value=name.getText().toString().trim();if(value.isEmpty())return;JSONObject t=old==null?Json.obj("id",UUID.randomUUID().toString(),"workspaceId",store().workspace,"rank",System.currentTimeMillis(),"deletedAt",null):Json.copy(old);Json.put(t,"name",value);Json.put(t,"color",COLORS[color.getSelectedItemPosition()]);Json.put(t,"updatedAt",Instant.now().toString());store().put("type",t);host.localChanged();}).show();}
}
