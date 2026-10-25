package app.jotday.calendar;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.util.*;

/** Runs only in the isolated test app; no account or network is required. */
public class NativeChecks extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments);start(); }
    private void check(boolean ok,String message) {if(!ok)throw new AssertionError(message);}
    private View find(View v,String description) {
        if(description.contentEquals(v.getContentDescription()==null?"":v.getContentDescription()))return v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){View found=find(((ViewGroup)v).getChildAt(i),description);if(found!=null)return found;}
        return null;
    }
    private MonthGrid grid(View v) {
        if(v instanceof MonthGrid)return (MonthGrid)v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){MonthGrid g=grid(((ViewGroup)v).getChildAt(i));if(g!=null)return g;}return null;
    }
    private void event(MonthGrid grid,long down,int action,float distance,int count) {
        MotionEvent.PointerProperties[] props=new MotionEvent.PointerProperties[count];MotionEvent.PointerCoords[] coords=new MotionEvent.PointerCoords[count];
        for(int i=0;i<count;i++){props[i]=new MotionEvent.PointerProperties();props[i].id=i;props[i].toolType=MotionEvent.TOOL_TYPE_FINGER;coords[i]=new MotionEvent.PointerCoords();coords[i].x=grid.getWidth()/2f+(i==0?-distance:distance);coords[i].y=grid.getHeight()/2f;coords[i].pressure=1;coords[i].size=1;}
        MotionEvent e=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,count,props,coords,0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);grid.dispatchTouchEvent(e);e.recycle();
    }
    @Override public void onStart() {
        Bundle result=new Bundle();Activity activity=null;
        try {
            Context context=getTargetContext();SharedPreferences prefs=context.getSharedPreferences("calendar",0);
            check(!prefs.getBoolean("paired",false),"Tests require an unpaired synthetic device");
            prefs.edit().putFloat("month-zoom",1f).commit();
            activity=startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));waitForIdleSync();
            Activity first=activity;String[] selection={null};
            runOnMainSync(()-> {
                MonthGrid g=grid(first.getWindow().getDecorView());check(g!=null,"month grid present");
                selection[0]=selected(g);long down=SystemClock.uptimeMillis();
                event(g,down,MotionEvent.ACTION_DOWN,120,1);event(g,down,MotionEvent.ACTION_POINTER_DOWN|(1<<8),120,2);
                for(int i=0;i<18;i++)event(g,down,MotionEvent.ACTION_MOVE,120+i*18,2);
                event(g,down,MotionEvent.ACTION_POINTER_UP|(1<<8),426,2);event(g,down,MotionEvent.ACTION_UP,426,1);
                check(selection[0].equals(selected(g)),"pinch must not select another date");
            });waitForIdleSync();
            float zoom=prefs.getFloat("month-zoom",1);check(zoom>1.1f&&zoom<=1.5f,"pinch persists bounded zoom: "+zoom);
            runOnMainSync(first::finish);waitForIdleSync();
            activity=startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));waitForIdleSync();Activity second=activity;
            runOnMainSync(()-> {
                MonthGrid g=grid(second.getWindow().getDecorView());TextView cell=(TextView)((ViewGroup)g.getChildAt(1)).getChildAt(0);
                check(Math.abs(cell.getTextSize()/context.getResources().getDisplayMetrics().scaledDensity-17*zoom)<.1,"restart restores visual zoom");
                View add=find(second.getWindow().getDecorView(),"新增日程");check(add!=null,"new schedule entry");add.performClick();
            });waitForIdleSync();
            // Accessibility sees the active dialog and verifies the visible save action.
            getUiAutomation().waitForIdle(500,5000);
            android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
            check(root!=null&&!root.findAccessibilityNodeInfosByText("保存").isEmpty(),"compact editor exposes save action");
            result.putString("stream","PASS: native pinch, selection isolation, persisted scale after activity restart, editor save visibility\n");finish(Activity.RESULT_OK,result);
        }catch(Throwable error){result.putString("stream","FAIL: "+error+"\n");finish(Activity.RESULT_CANCELED,result);}
    }
    private String selected(View view) {
        CharSequence description=view.getContentDescription();if(description!=null&&description.toString().contains("已选择"))return description.toString();
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){String found=selected(((ViewGroup)view).getChildAt(i));if(found!=null)return found;}return null;
    }
}
