package app.jotday.calendar;

import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.*;
import android.widget.FrameLayout;

/** Content-sized native dialog, capped to the available height above the keyboard. */
final class CompactSheet extends Dialog {
    private int maxHeight=Integer.MAX_VALUE,maxWidth=Integer.MAX_VALUE;
    private final FrameLayout frame;
    CompactSheet(Context context) {
        super(context);requestWindowFeature(Window.FEATURE_NO_TITLE);
        frame=new FrameLayout(context) {
            @Override protected void onMeasure(int widthSpec,int heightSpec) {
                int available=View.MeasureSpec.getSize(heightSpec);
                super.onMeasure(widthSpec,View.MeasureSpec.makeMeasureSpec(Math.min(maxHeight,available==0?maxHeight:available),View.MeasureSpec.AT_MOST));
            }
        };
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        getWindow().setGravity(Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        setCanceledOnTouchOutside(true);
    }
    void setMaxWidth(int value) {maxWidth=value;}
    void setMaxHeight(int value) {maxHeight=value;}
    @Override public void setContentView(View view) {frame.removeAllViews();frame.addView(view);super.setContentView(frame);}
    @Override public void show() {
        super.show();getWindow().setLayout(Math.min(maxWidth,getContext().getResources().getDisplayMetrics().widthPixels),WindowManager.LayoutParams.WRAP_CONTENT);
    }
}
