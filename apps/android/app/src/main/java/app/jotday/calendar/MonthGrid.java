package app.jotday.calendar;

import android.content.Context;
import android.graphics.*;
import android.view.*;
import android.widget.*;
import java.time.*;
import java.util.*;

/** Native date buttons retain accessibility; multi-touch only changes calendar density. */
final class MonthGrid extends LinearLayout {
    interface Listener { void select(LocalDate day);void month(int delta);void scale(float value); }
    private final ScaleGestureDetector pinch;
    private final Listener listener;
    private float density=1f,downX,downY;
    private boolean multi;
    private final List<TextView> cells=new ArrayList<>();
    private final List<LinearLayout> weeks=new ArrayList<>();
    MonthGrid(Context context,Listener listener) {
        super(context);this.listener=listener;setOrientation(VERTICAL);
        pinch=new ScaleGestureDetector(context,new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                density=Math.max(.85f,Math.min(1.5f,density*detector.getScaleFactor()));applyDensity();return true;
            }
            @Override public void onScaleEnd(ScaleGestureDetector detector) { listener.scale(density); }
        });
        pinch.setQuickScaleEnabled(false);
    }
    int dp(float n) {return Math.round(n*getResources().getDisplayMetrics().density);}
    void render(YearMonth month,LocalDate selected,Set<LocalDate> busy,float scale) {
        density=scale;removeAllViews();cells.clear();weeks.clear();
        LinearLayout labels=new LinearLayout(getContext());
        for(String day:new String[]{"一","二","三","四","五","六","日"}) {
            TextView label=new TextView(getContext());label.setText(day);label.setTextSize(12);label.setTextColor(0xff928a81);label.setGravity(Gravity.CENTER);
            labels.addView(label,new LinearLayout.LayoutParams(0,dp(30),1));
        }
        addView(labels);
        LocalDate first=month.atDay(1);int offset=first.getDayOfWeek().getValue()-1;
        int count=(offset+month.lengthOfMonth()+6)/7;
        LocalDate start=first.minusDays(offset);
        for(int row=0;row<count;row++) {
            LinearLayout week=new LinearLayout(getContext());weeks.add(week);
            for(int col=0;col<7;col++) {
                LocalDate date=start.plusDays(row*7L+col);
                TextView cell=new TextView(getContext());cell.setText(date.getDayOfMonth()+(busy.contains(date)?"\n•":"\n "));cell.setGravity(Gravity.CENTER);cell.setIncludeFontPadding(false);
                cell.setTextColor(date.equals(selected)?0xffffffff:YearMonth.from(date).equals(month)?0xff332d39:0xffb8b1a7);
                cell.setTypeface(null,date.equals(LocalDate.now(CalendarProjector.ZONE))?Typeface.BOLD:Typeface.NORMAL);
                cell.setContentDescription(date+ (busy.contains(date)?"，有安排":"")+(date.equals(selected)?"，已选择":""));
                cell.setClickable(true);cell.setFocusable(true);
                android.graphics.drawable.GradientDrawable bg=new android.graphics.drawable.GradientDrawable();bg.setCornerRadius(dp(17));
                bg.setColor(date.equals(selected)?0xff756486:Color.TRANSPARENT);
                if(date.equals(LocalDate.now(CalendarProjector.ZONE))&&!date.equals(selected)) bg.setStroke(dp(1),0xffb9a9c5);
                cell.setBackground(bg);cell.setOnClickListener(v->listener.select(date));
                LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(0,LayoutParams.MATCH_PARENT,1);params.setMargins(dp(2),dp(2),dp(2),dp(2));week.addView(cell,params);cells.add(cell);
            }
            addView(week,new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT,dp(52)));
        }
        applyDensity();
    }
    private void applyDensity() {
        for(LinearLayout week:weeks) { android.view.ViewGroup.LayoutParams p=week.getLayoutParams();p.height=dp(Math.max(48,52*density));week.setLayoutParams(p); }
        for(TextView cell:cells) cell.setTextSize(17*density);
    }
    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        pinch.onTouchEvent(event);
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN) { downX=event.getX();downY=event.getY();multi=false; }
        if(event.getPointerCount()>1) {multi=true;getParent().requestDisallowInterceptTouchEvent(true);}
        if(multi) {
            if(event.getActionMasked()==MotionEvent.ACTION_POINTER_DOWN) { MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(cancel);cancel.recycle(); }
            return true;
        }
        if(event.getActionMasked()==MotionEvent.ACTION_MOVE && Math.abs(event.getX()-downX)>Math.abs(event.getY()-downY)+dp(12)) getParent().requestDisallowInterceptTouchEvent(true);
        if(event.getActionMasked()==MotionEvent.ACTION_UP && Math.abs(event.getX()-downX)>dp(65) && Math.abs(event.getX()-downX)>Math.abs(event.getY()-downY)*1.5f) {
            MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(cancel);cancel.recycle();listener.month(event.getX()<downX?1:-1);return true;
        }
        return super.dispatchTouchEvent(event);
    }
}
