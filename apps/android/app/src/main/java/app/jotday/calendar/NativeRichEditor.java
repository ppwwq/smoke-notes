package app.jotday.calendar;

import android.content.Context;
import android.graphics.Typeface;
import android.text.*;
import android.text.style.CharacterStyle;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.*;

/** Native editable blocks; keeps unedited document attributes and nested list structure. */
final class NativeRichEditor extends LinearLayout {
    private JSONObject document;private LinearLayout blocks;private EditText active;
    private final List<Binding> bindings=new ArrayList<>();private Runnable changed=()->{};
    private static class Binding{JSONObject node;EditText field;String initial;boolean unsupported;}
    static class Mark extends CharacterStyle {
        final JSONObject json;Mark(JSONObject j){json=Json.copy(j);}
        @Override public void updateDrawState(TextPaint p){String t=json.optString("type");switch(t){
            case "bold":p.setFakeBoldText(true);break;case "italic":p.setTextSkewX(-.25f);break;case "underline":p.setUnderlineText(true);break;case "strike":p.setStrikeThruText(true);break;
            case "code":p.setTypeface(Typeface.MONOSPACE);p.bgColor=0xffeee8f1;break;case "highlight":p.bgColor=0xffffedb3;JSONObject highlight=json.optJSONObject("attrs");if(highlight!=null)try{p.bgColor=android.graphics.Color.parseColor(highlight.optString("color"));}catch(Exception ignored){}break;case "link":p.setUnderlineText(true);p.setColor(0xff756486);break;
            case "textStyle":JSONObject a=json.optJSONObject("attrs");if(a!=null){try{if(!Json.str(a,"color").isEmpty())p.setColor(android.graphics.Color.parseColor(a.optString("color")));}catch(Exception ignored){}}break;
        }}
    }
    NativeRichEditor(Context c,JSONObject doc,String body){super(c);setOrientation(VERTICAL);document=doc!=null?Json.copy(doc):plain(body);
        HorizontalScrollView scroll=new HorizontalScrollView(c);scroll.setHorizontalScrollBarEnabled(false);LinearLayout toolbar=new LinearLayout(c);scroll.addView(toolbar);addView(scroll);
        for(String[] spec:new String[][]{{"B","bold"},{"I","italic"},{"U","underline"},{"划线","strike"},{"标记","highlight"}}){Button b=button(spec[0]);b.setContentDescription("格式："+spec[1]);b.setOnClickListener(v->mark(spec[1]));toolbar.addView(b);}
        Button color=button("文字颜色");color.setOnClickListener(v->palette(false));toolbar.addView(color);Button highlight=button("高亮颜色");highlight.setOnClickListener(v->palette(true));toolbar.addView(highlight);
        Button append=button("＋段落");append.setOnClickListener(v->new AlertDialogBuilder(c).show());toolbar.addView(append);
        blocks=new LinearLayout(c);blocks.setOrientation(VERTICAL);addView(blocks);render();
    }
    private Button button(String text){Button b=new Button(getContext());b.setText(text);b.setMinWidth(48);b.setMinimumWidth(48);b.setTextSize(13);return b;}
    private class AlertDialogBuilder{Context context;AlertDialogBuilder(Context c){context=c;}void show(){new android.app.AlertDialog.Builder(context).setTitle("添加内容").setItems(new String[]{"正文","标题","项目列表","编号列表","勾选列表","引用","代码"},(d,i)->{
        snapshot();JSONObject paragraph=Json.obj("type",i==1?"heading":i==6?"codeBlock":"paragraph","content",new JSONArray());if(i==1)Json.put(paragraph,"attrs",Json.obj("level",2));JSONObject node=paragraph;
        if(i>=2&&i<=4){JSONObject item=Json.obj("type",i==4?"taskItem":"listItem","content",new JSONArray().put(paragraph));if(i==4)Json.put(item,"attrs",Json.obj("checked",false));node=Json.obj("type",i==2?"bulletList":i==3?"orderedList":"taskList","content",new JSONArray().put(item));}
        if(i==5)node=Json.obj("type","blockquote","content",new JSONArray().put(paragraph));document.optJSONArray("content").put(node);render();changed.run();
    }).show();}}
    void onChanged(Runnable run){changed=run;}
    static JSONObject plain(String body){JSONArray a=new JSONArray();for(String line:body.split("\n",-1))a.put(Json.obj("type","paragraph","content",new JSONArray().put(Json.obj("type","text","text",line))));return Json.obj("type","doc","content",a);}
    private void render(){bindings.clear();blocks.removeAllViews();active=null;walk(document,0,"");}
    private void walk(JSONObject node,int depth,String prefix){String type=node.optString("type");
        if(type.equals("paragraph")||type.equals("heading")||type.equals("codeBlock")){
            LinearLayout row=new LinearLayout(getContext());row.setGravity(Gravity.TOP);row.setPadding(depth*12,0,0,0);if(!prefix.isEmpty()){TextView label=new TextView(getContext());label.setText(prefix);label.setPadding(0,14,8,0);row.addView(label);}
            EditText edit=new EditText(getContext());edit.setTextColor(0xff332d39);edit.setTextSize(type.equals("heading")?23:16);edit.setGravity(Gravity.TOP);edit.setBackgroundColor(android.graphics.Color.TRANSPARENT);edit.setMinHeight((int)(48*getResources().getDisplayMetrics().density));edit.setHint("写点什么…");edit.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE|android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
            if(type.equals("codeBlock"))edit.setTypeface(Typeface.MONOSPACE);if(type.equals("heading"))edit.setTypeface(null,Typeface.BOLD);
            Binding binding=new Binding();binding.node=node;binding.field=edit;SpannableStringBuilder value=new SpannableStringBuilder();JSONArray inline=node.optJSONArray("content");
            if(inline!=null)for(int i=0;i<inline.length();i++){JSONObject part=inline.optJSONObject(i);if(part==null)continue;int start=value.length();String t=part.optString("type");value.append(t.equals("hardBreak")?"\n":t.equals("text")?part.optString("text"):"［"+t+"］");if(!t.equals("hardBreak")&&!t.equals("text"))binding.unsupported=true;JSONArray marks=part.optJSONArray("marks");if(marks!=null)for(int m=0;m<marks.length();m++)if(marks.optJSONObject(m)!=null&&value.length()>start)value.setSpan(new Mark(marks.optJSONObject(m)),start,value.length(),Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);}
            binding.initial=value.toString();edit.setText(value);if(binding.unsupported){edit.setKeyListener(null);edit.setContentDescription("此段包含特殊内容，原样保留");}
            edit.setOnFocusChangeListener((v,focus)->{if(focus)active=edit;});edit.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int a,int c,int f){}public void onTextChanged(CharSequence s,int a,int b,int c){changed.run();}public void afterTextChanged(Editable e){}});
            bindings.add(binding);row.addView(edit,new LinearLayout.LayoutParams(0,-2,1));blocks.addView(row);return;
        }
        if(type.equals("taskItem")){CheckBox check=new CheckBox(getContext());check.setText("完成此项");JSONObject attrs=node.optJSONObject("attrs");if(attrs==null){attrs=Json.obj();Json.put(node,"attrs",attrs);}JSONObject fixed=attrs;check.setChecked(attrs.optBoolean("checked"));check.setOnCheckedChangeListener((v,b)->{Json.put(fixed,"checked",b);changed.run();});blocks.addView(check);}
        JSONArray children=node.optJSONArray("content");if(children!=null)for(int i=0;i<children.length();i++){JSONObject child=children.optJSONObject(i);if(child!=null)walk(child,depth+(type.endsWith("List")||type.equals("blockquote")?1:0),type.equals("bulletList")?"•":type.equals("orderedList")?(i+1)+".":prefix);}
        else if(!type.equals("doc")){TextView retained=new TextView(getContext());retained.setText(type.equals("horizontalRule")?"────────────":"［"+type+" · 原样保留］");blocks.addView(retained);}
    }
    private void mark(String type){if(active==null||active.getKeyListener()==null)return;Editable s=active.getText();int from=Math.min(active.getSelectionStart(),active.getSelectionEnd()),to=Math.max(active.getSelectionStart(),active.getSelectionEnd());if(from<0||from==to){Toast.makeText(getContext(),"先选中文字",Toast.LENGTH_SHORT).show();return;}
        boolean removed=false;for(Mark mark:s.getSpans(from,to,Mark.class))if(type.equals(mark.json.optString("type"))){int start=s.getSpanStart(mark),end=s.getSpanEnd(mark);s.removeSpan(mark);if(start<from)s.setSpan(new Mark(mark.json),start,from,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);if(end>to)s.setSpan(new Mark(mark.json),to,end,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);removed=true;}
        if(!removed)s.setSpan(new Mark(Json.obj("type",type)),from,to,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);changed.run();
    }
    private void palette(boolean highlight){if(active==null)return;EditText field=active;int from=Math.min(field.getSelectionStart(),field.getSelectionEnd()),to=Math.max(field.getSelectionStart(),field.getSelectionEnd());if(from<0||from==to){Toast.makeText(getContext(),"先选中文字",Toast.LENGTH_SHORT).show();return;}String[] colors=highlight?new String[]{"#6f3d40","#73512d","#7f6a2f","#365f50","#36586d","#56446d"}:new String[]{"#d9dde1","#e98286","#e6a35c","#d7bd68","#75b99a","#78aecd","#b59ad6"};String[] names=highlight?new String[]{"玫瑰","棕橙","金黄","青绿","蓝色","紫色"}:new String[]{"浅灰","玫瑰","橙色","金黄","青绿","蓝色","紫色"};new android.app.AlertDialog.Builder(getContext()).setTitle(highlight?"高亮颜色":"文字颜色").setItems(names,(d,i)->{Editable text=field.getText();String type=highlight?"highlight":"textStyle";for(Mark mark:text.getSpans(from,to,Mark.class))if(mark.json.optString("type").equals(type)){int start=text.getSpanStart(mark),end=text.getSpanEnd(mark);text.removeSpan(mark);if(start<from)text.setSpan(new Mark(mark.json),start,from,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);if(end>to)text.setSpan(new Mark(mark.json),to,end,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);}text.setSpan(new Mark(Json.obj("type",type,"attrs",Json.obj("color",colors[i]))),from,to,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);changed.run();}).show();}
    JSONObject snapshot(){for(Binding b:bindings){if(b.unsupported)continue;Editable value=b.field.getText();JSONArray inline=new JSONArray();int start=0;while(start<value.length()){
        if(value.charAt(start)=='\n'){inline.put(Json.obj("type","hardBreak"));start++;continue;}
        int end=value.nextSpanTransition(start,value.length(),Mark.class);int newline=value.toString().indexOf('\n',start);if(newline>=0)end=Math.min(end,newline);if(end<=start)end=start+1;
        JSONObject leaf=Json.obj("type","text","text",value.subSequence(start,end).toString());JSONArray marks=new JSONArray();Set<String> seen=new HashSet<>();for(Mark mark:value.getSpans(start,end,Mark.class)){if(value.getSpanStart(mark)<end&&value.getSpanEnd(mark)>start&&seen.add(Json.canonical(mark.json)))marks.put(Json.copy(mark.json));}if(marks.length()>0)Json.put(leaf,"marks",marks);inline.put(leaf);start=end;
    }Json.put(b.node,"content",inline);}return Json.copy(document);}
    static String body(JSONObject doc){StringBuilder out=new StringBuilder();body(doc,out);return out.toString().replaceAll("\n$","");}
    private static void body(JSONObject n,StringBuilder out){String type=n.optString("type");if(type.equals("text"))out.append(n.optString("text"));if(type.equals("hardBreak"))out.append('\n');JSONArray a=n.optJSONArray("content");if(a!=null)for(int i=0;i<a.length();i++)if(a.optJSONObject(i)!=null)body(a.optJSONObject(i),out);if(type.equals("paragraph")||type.equals("heading")||type.equals("codeBlock"))out.append('\n');}
}
