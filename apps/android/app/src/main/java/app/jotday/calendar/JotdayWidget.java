package app.jotday.calendar;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import org.json.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class JotdayWidget extends AppWidgetProvider {
    private static final int[] ROWS={R.id.widget_row1,R.id.widget_row2,R.id.widget_row3,R.id.widget_row4,R.id.widget_row5,R.id.widget_row6};
    static void refresh(Context context){AppWidgetManager manager=AppWidgetManager.getInstance(context);int[] ids=manager.getAppWidgetIds(new ComponentName(context,JotdayWidget.class));for(int id:ids)update(context,manager,id);}
    @Override public void onUpdate(Context c,AppWidgetManager m,int[] ids){for(int id:ids)update(c,m,id);}
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options){update(c,m,id);}
    @Override public void onReceive(Context c,Intent i){super.onReceive(c,i);if(Intent.ACTION_DATE_CHANGED.equals(i.getAction())||Intent.ACTION_TIME_CHANGED.equals(i.getAction())||Intent.ACTION_TIMEZONE_CHANGED.equals(i.getAction())||Intent.ACTION_MY_PACKAGE_REPLACED.equals(i.getAction()))refresh(c);}
    static PendingIntent open(Context c,int widgetId,String tab,String quick){Intent intent=new Intent(c,MainActivity.class).setAction(Intent.ACTION_VIEW).setData(Uri.parse("jotday://widget/"+widgetId+"/"+tab+"/"+quick)).putExtra("tab",tab).putExtra("quick",quick).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);return PendingIntent.getActivity(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static List<String> lines(PlannerStore store,LocalDate day){List<String> result=new ArrayList<>();List<JSONObject> todos=CalendarProjector.projectTodos(store.all("todo"),day,day,WorkspaceRecords.today(store));todos.sort(Comparator.comparing(t->t.optBoolean("completed")));for(JSONObject todo:todos){JSONObject p=todo.optJSONObject("planning");if(p!=null&&p.optString("status").equals("skipped"))continue;result.add((todo.optBoolean("completed")?"✓  ":"○  ")+todo.optString("text"));}for(CalendarProjector.Occurrence event:CalendarProjector.project(store.all("event"),day,day))result.add((event.allDay()?"全天":event.start.toLocalDate().isBefore(day)?"跨天":event.start.toLocalTime().toString())+"  "+event.title());return result;}
    static RemoteViews views(Context context,int id,int height){
        RemoteViews view=new RemoteViews(context.getPackageName(),R.layout.widget_today);LocalDate day=LocalDate.now(CalendarProjector.ZONE);view.setTextViewText(R.id.widget_date,day.format(DateTimeFormatter.ofPattern("M月d日 EEEE",Locale.SIMPLIFIED_CHINESE)));
        String workspace=context.getSharedPreferences("calendar",0).getString("workspace",null);List<String> values=new ArrayList<>();if(workspace!=null)try(PlannerStore store=new PlannerStore(context,workspace)){values=lines(store,day);}
        float scale=context.getResources().getConfiguration().fontScale;int count=Math.max(1,Math.min(6,(int)((height-112*scale)/Math.max(28,22*scale))));for(int n=0;n<ROWS.length;n++){boolean visible=n<count&&(n<values.size()||n==0);view.setViewVisibility(ROWS[n],visible?View.VISIBLE:View.GONE);if(visible)view.setTextViewText(ROWS[n],values.isEmpty()?"今天留点空白也很好。":values.get(n));view.setOnClickPendingIntent(ROWS[n],open(context,id,"calendar",""));}
        view.setTextViewText(R.id.widget_status,(values.size()>count?"还有 "+(values.size()-count)+" 项 · ":"")+"本机 · "+LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm")));
        view.setOnClickPendingIntent(R.id.widget_header,open(context,id,"calendar",""));view.setOnClickPendingIntent(R.id.widget_note,open(context,id,"notes","note"));view.setOnClickPendingIntent(R.id.widget_todo,open(context,id,"todos","todo"));return view;
    }
    private static void update(Context c,AppWidgetManager m,int id){m.updateAppWidget(id,views(c,id,m.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,220)));}
}
