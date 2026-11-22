package app.jotday.calendar;

import android.app.*;
import android.content.Context;
import android.text.*;
import android.view.View;
import android.widget.*;
import org.json.*;
import java.time.*;

/** Edits the same bounded recurrence fields as the web client. */
final class RepeatEditor extends LinearLayout {
    private final Spinner frequency,endMode,pattern;private final EditText interval,count;private final TextView weekdays,months,until,monthly;
    private final LinearLayout options;private JSONObject seed;private LocalDate start,endDate;private Runnable changed=()->{};
    private boolean[] days=new boolean[7],selectedMonths=new boolean[12];private int ordinal=1,weekday=1;private boolean initializing=true;
    RepeatEditor(Context context,JSONObject rule,LocalDate first){super(context);setOrientation(VERTICAL);start=first;seed=rule==null?Json.obj():Json.copy(rule);endDate=rule!=null&&rule.has("until")?LocalDate.parse(rule.optString("until")):first.plusMonths(1);
        frequency=spinner(new String[]{"不重复","每天","每周","每月","每年"});addView(frequency);options=new LinearLayout(context);options.setOrientation(VERTICAL);addView(options);
        interval=number("每隔多少天／周／月／年",seed.optInt("interval",1));options.addView(interval);
        for(int i=0;i<7;i++)days[i]=CalendarProjector.contains(seed.optJSONArray("weekdays"),i);if(seed.optJSONArray("weekdays")==null)days[first.getDayOfWeek().getValue()%7]=true;
        weekdays=button("重复星期",()->new AlertDialog.Builder(context).setTitle("选择星期").setMultiChoiceItems(new String[]{"星期日","星期一","星期二","星期三","星期四","星期五","星期六"},days,(d,i,b)->days[i]=b).setPositiveButton("完成",(d,w)->{labels();changed.run();}).show());options.addView(weekdays);
        for(int i=0;i<12;i++)selectedMonths[i]=seed.optJSONArray("months")==null?i==first.getMonthValue()-1:CalendarProjector.contains(seed.optJSONArray("months"),i+1);
        months=button("重复月份",()->{String[] labels=new String[12];for(int i=0;i<12;i++)labels[i]=(i+1)+"月";new AlertDialog.Builder(context).setTitle("选择月份").setMultiChoiceItems(labels,selectedMonths,(d,i,b)->selectedMonths[i]=b).setPositiveButton("完成",(d,w)->{labels();changed.run();}).show();});options.addView(months);
        pattern=spinner(new String[]{"按月内日期","按第几个星期","保留原月内规则"});options.addView(pattern);JSONObject nth=seed.optJSONObject("nthWeekday");if(nth!=null){ordinal=nth.optInt("ordinal");weekday=nth.optInt("weekday");pattern.setSelection(1);}else if(seed.optJSONArray("monthDays")!=null)pattern.setSelection(2);
        monthly=button("月内规则",()->{if(pattern.getSelectedItemPosition()==1){new AlertDialog.Builder(context).setTitle("第几个星期").setItems(new String[]{"第一个","第二个","第三个","第四个","第五个","最后一个"},(d,i)->{ordinal=i==5?-1:i+1;new AlertDialog.Builder(context).setTitle("星期几").setItems(new String[]{"星期日","星期一","星期二","星期三","星期四","星期五","星期六"},(a,n)->{weekday=n;labels();changed.run();}).show();}).show();}else{boolean[] checked=new boolean[31];for(int i=0;i<31;i++)checked[i]=CalendarProjector.contains(seed.optJSONArray("monthDays"),i+1);if(seed.optJSONArray("monthDays")==null)checked[first.getDayOfMonth()-1]=true;String[] labels=new String[31];for(int i=0;i<31;i++)labels[i]=(i+1)+"日";new AlertDialog.Builder(context).setTitle("月内日期").setMultiChoiceItems(labels,checked,(d,i,b)->checked[i]=b).setPositiveButton("完成",(d,w)->{JSONArray a=new JSONArray();for(int i=0;i<31;i++)if(checked[i])a.put(i+1);Json.put(seed,"monthDays",a);pattern.setSelection(2);labels();changed.run();}).show();}});options.addView(monthly);
        endMode=spinner(new String[]{"一直重复","到指定日期","重复指定次数"});options.addView(endMode);until=button("结束日期",()->new DatePickerDialog(context,(v,y,m,d)->{endDate=LocalDate.of(y,m+1,d);labels();changed.run();},endDate.getYear(),endDate.getMonthValue()-1,endDate.getDayOfMonth()).show());options.addView(until);count=number("重复次数",seed.optInt("count",10));options.addView(count);
        if(seed.has("until"))endMode.setSelection(1);else if(seed.has("count"))endMode.setSelection(2);
        String f=seed.optString("frequency");frequency.setSelection(f.equals("daily")?1:f.equals("weekly")?2:f.equals("monthly")?3:f.equals("yearly")?4:0);
        AdapterView.OnItemSelectedListener selected=new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> a,View v,int i,long id){labels();if(!initializing)changed.run();}public void onNothingSelected(AdapterView<?> a){}};frequency.setOnItemSelectedListener(selected);pattern.setOnItemSelectedListener(selected);endMode.setOnItemSelectedListener(selected);
        TextWatcher watcher=new TextWatcher(){public void beforeTextChanged(CharSequence s,int a,int c,int f){}public void onTextChanged(CharSequence s,int a,int b,int c){if(!initializing)changed.run();}public void afterTextChanged(Editable e){}};interval.addTextChangedListener(watcher);count.addTextChangedListener(watcher);initializing=false;labels();
    }
    private Spinner spinner(String[] labels){Spinner s=new Spinner(getContext());s.setAdapter(new ArrayAdapter<>(getContext(),android.R.layout.simple_spinner_dropdown_item,labels));s.setMinimumHeight((int)(48*getResources().getDisplayMetrics().density));return s;}
    private EditText number(String hint,int value){EditText e=new EditText(getContext());e.setInputType(InputType.TYPE_CLASS_NUMBER);e.setHint(hint);e.setText(String.valueOf(value));return e;}
    private TextView button(String text,Runnable action){TextView b=new TextView(getContext());b.setText(text);b.setTextColor(0xff756486);b.setTextSize(15);b.setPadding(8,18,8,18);b.setMinHeight((int)(48*getResources().getDisplayMetrics().density));b.setOnClickListener(v->action.run());return b;}
    private void labels(){int f=frequency.getSelectedItemPosition();options.setVisibility(f==0?GONE:VISIBLE);weekdays.setVisibility(f==2?VISIBLE:GONE);months.setVisibility(f==4?VISIBLE:GONE);pattern.setVisibility(f>=3?VISIBLE:GONE);monthly.setVisibility(f>=3?VISIBLE:GONE);until.setVisibility(endMode.getSelectedItemPosition()==1?VISIBLE:GONE);count.setVisibility(endMode.getSelectedItemPosition()==2?VISIBLE:GONE);
        StringBuilder d=new StringBuilder("星期：");for(int i=0;i<7;i++)if(days[i])d.append("日一二三四五六".charAt(i)).append(' ');weekdays.setText(d);StringBuilder m=new StringBuilder("月份：");for(int i=0;i<12;i++)if(selectedMonths[i])m.append(i+1).append(' ');months.setText(m);until.setText("至 "+endDate);monthly.setText(pattern.getSelectedItemPosition()==1?(ordinal==-1?"最后一个":"第 "+ordinal+" 个")+"星期"+"日一二三四五六".charAt(weekday):"月内日期："+(seed.optJSONArray("monthDays")==null?start.getDayOfMonth():seed.optJSONArray("monthDays").toString()));
    }
    void onChanged(Runnable r){changed=r;}
    JSONObject value(){int f=frequency.getSelectedItemPosition();if(f==0)return null;JSONObject rule=Json.obj("frequency",new String[]{"","daily","weekly","monthly","yearly"}[f],"interval",integer(interval,1));
        if(f==2){JSONArray a=new JSONArray();for(int i=0;i<7;i++)if(days[i])a.put(i);Json.put(rule,"weekdays",a);}if(f==4){JSONArray a=new JSONArray();for(int i=0;i<12;i++)if(selectedMonths[i])a.put(i+1);Json.put(rule,"months",a);}
        if(f>=3){if(pattern.getSelectedItemPosition()==1)Json.put(rule,"nthWeekday",Json.obj("ordinal",ordinal,"weekday",weekday));else if(seed.optJSONArray("monthDays")!=null)Json.put(rule,"monthDays",seed.optJSONArray("monthDays"));}
        if(endMode.getSelectedItemPosition()==1)Json.put(rule,"until",endDate.toString());if(endMode.getSelectedItemPosition()==2)Json.put(rule,"count",integer(count,0));return rule;
    }
    private int integer(EditText e,int fallback){try{return Integer.parseInt(e.getText().toString());}catch(Exception ignored){return fallback;}}
    static String validate(JSONObject r,LocalDate start){if(r==null)return null;if(r.optInt("interval")<1||r.optInt("interval")>99)return "重复间隔须为 1–99";if(r.has("count")&&(r.optInt("count")<1||r.optInt("count")>10000))return "重复次数须为 1–10000";if(r.has("until")&&LocalDate.parse(r.optString("until")).isBefore(start))return "重复结束日期须不早于开始日期";for(String k:new String[]{"weekdays","months","monthDays"})if(r.has(k)&&r.optJSONArray(k).length()==0)return "请至少选择一个重复日期";return null;}
}
