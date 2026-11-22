package app.jotday.calendar;

import android.app.*;
import android.content.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.time.*;
import java.util.*;

final class WorkspaceChecks {
    private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    static void run(Instrumentation test)throws Exception{
        Context context=test.getTargetContext();String workspace=UUID.randomUUID().toString();PlannerStore store=new PlannerStore(context,workspace);Fake cloud=new Fake(workspace);WorkspaceSync sync=new WorkspaceSync(store,cloud);
        JSONObject book=WorkspaceRecords.create("notebook",workspace);Json.put(book,"name","Synthetic notebook");WorkspaceRecords.save(store,"notebook",book);
        JSONObject note=WorkspaceRecords.create("note",workspace);Json.put(note,"notebook_id",book.optString("id"));Json.put(note,"title","Before retry");Json.put(note,"content_json",NativeRichEditor.plain("Offline content"));Json.put(note,"body","Offline content");WorkspaceRecords.save(store,"note",note);
        JSONObject task=WorkspaceRecords.task(store,"Synthetic task",LocalDate.now(CalendarProjector.ZONE),"notes");WorkspaceRecords.save(store,"todo",task);
        check(sync.pending()==3,"all entity edits durably queued");sync.run();check(sync.pending()==0,"all entity writes acknowledged");check(cloud.order.get(0).equals("notebook"),"parent synchronized before child");
        JSONObject local=store.get("note",note.optString("id"));Json.put(local,"title","First frozen value");WorkspaceRecords.save(store,"note",local);cloud.failNext=true;
        try{sync.run();throw new AssertionError("lost response simulated");}catch(java.io.IOException expected){}
        JSONObject frozen=store.state("workspace:note",note.optString("id")).optJSONObject("operation");String receipt=frozen.optString("id");
        local=store.get("note",note.optString("id"));Json.put(local,"title","Edited while offline");WorkspaceRecords.save(store,"note",local);
        store.close();store=new PlannerStore(context,workspace);sync=new WorkspaceSync(store,cloud);sync.run();
        check(cloud.retried.contains(receipt),"same operation id and payload replayed after restart");check(store.get("note",note.optString("id")).optString("title").equals("Edited while offline"),"acknowledgment never overwrites a newer local edit");check(sync.pending()==1,"newer edit remains queued");sync.run();check(sync.pending()==0,"newer edit eventually synchronized");
        JSONObject remote=cloud.records.get("note").get(note.optString("id"));Json.put(remote,"title","Remote concurrent edit");Json.put(remote,"version",remote.optInt("version")+1);
        local=store.get("note",note.optString("id"));Json.put(local,"title","Local concurrent edit");WorkspaceRecords.save(store,"note",local);sync.run();
        check(store.conflicts().length()==1,"conflict recorded");check(store.all("note").stream().anyMatch(n->n.optString("title").contains("Local concurrent edit")),"local note conflict copy recoverable");sync.run();
        JSONObject originalTask=store.get("todo",task.optString("id"));WorkspaceRecords.status(store,originalTask,"completed");sync.run();check(store.get("todo",task.optString("id")).optBoolean("completed"),"completion persists");
        check(JotdayWidget.lines(store,LocalDate.now(CalendarProjector.ZONE)).stream().anyMatch(s->s.contains("✓")&&s.contains("Synthetic task")),"widget reflects completed local task");
        Json.put(originalTask,"deleted_at",Instant.now().toString());WorkspaceRecords.save(store,"todo",originalTask);sync.run();check(!WorkspaceRecords.alive(store.get("todo",task.optString("id"))),"tombstone sync");
        check(JotdayWidget.lines(store,LocalDate.now(CalendarProjector.ZONE)).stream().noneMatch(s->s.contains("Synthetic task")),"widget excludes deleted tasks");
        PlannerStore adopted=new PlannerStore(context,UUID.randomUUID().toString());adopted.adoptFrom(store);check(adopted.all("note").size()==store.all("note").size(),"local adoption includes all notes");check(adopted.all("todo").get(0).optString("workspace_id").equals(adopted.workspace),"adopted todo has destination scope");adopted.close();store.close();
        test.runOnMainSync(()->{
            JSONObject doc=Json.obj("type","doc","content",new JSONArray().put(Json.obj("type","heading","attrs",Json.obj("level",2),"content",new JSONArray().put(Json.obj("type","text","text","Rich note","marks",new JSONArray().put(Json.obj("type","bold")))))).put(Json.obj("type","taskList","content",new JSONArray().put(Json.obj("type","taskItem","attrs",Json.obj("checked",true),"content",new JSONArray().put(Json.obj("type","paragraph","content",new JSONArray().put(Json.obj("type","text","text","Nested task")))))))));
            NativeRichEditor editor=new NativeRichEditor(context,doc,"");check(Json.same(doc,editor.snapshot()),"native editor round-trips heading, mark and checklist structure");check(NativeRichEditor.body(editor.snapshot()).contains("Nested task"),"rich document plain text retained");
            android.widget.RemoteViews rv=JotdayWidget.views(context,123,160);View rendered=rv.apply(context,new LinearLayout(context));check(rendered.findViewById(R.id.widget_note)!=null,"widget RemoteViews inflate with quick entry");
        });
    }
    private static final class Fake implements WorkspaceSync.Transport{
        final String workspace;final Map<String,Map<String,JSONObject>> records=new HashMap<>();final Map<String,JSONObject> receipts=new HashMap<>(),operations=new HashMap<>();final Set<String> retried=new HashSet<>();final List<String> order=new ArrayList<>();boolean failNext;
        Fake(String id){workspace=id;for(String kind:WorkspaceRecords.KINDS)records.put(kind,new TreeMap<>());}
        public void capabilities(){}
        public JSONArray pull(String kind,String after){JSONArray result=new JSONArray();for(JSONObject row:records.get(kind).values())if(row.optString("id").compareTo(after)>0)result.put(Json.copy(row));return result;}
        public JSONObject mutate(JSONObject op)throws Exception{
            String receipt=op.optString("id"),kind=op.optString("entity"),id=op.optString("entityId");order.add(kind);
            if(receipts.containsKey(receipt)){check(Json.same(operations.get(receipt),op),"retry payload frozen");retried.add(receipt);return Json.copy(receipts.get(receipt));}
            operations.put(receipt,Json.copy(op));JSONObject existing=records.get(kind).get(id);JSONObject response;
            if(existing!=null&&existing.optInt("version")!=op.optInt("baseVersion"))response=Json.obj("status","conflict","record",Json.copy(existing),"todoPlanningVersion",1);
            else {JSONObject p=op.optJSONObject("payload"),row=Json.obj("id",id,"version",op.optInt("baseVersion")+1,"updated_at",Instant.now().toString(),"deleted_at",p.opt("deletedAt"),"rank",p.opt("rank"));
                if(!kind.equals("note"))Json.put(row,"workspace_id",p.optString("workspaceId"));
                if(kind.equals("notebook"))Json.put(row,"name",p.optString("name"));
                else if(kind.equals("todo")){Json.put(row,"text",p.optString("text"));Json.put(row,"completed",p.optBoolean("completed"));if(p.has("planning"))Json.put(row,"planning",p.opt("planning"));}
                else{for(String key:new String[]{"title","body","color","kind"})Json.put(row,key,p.opt(key));Json.put(row,"notebook_id",p.opt("notebookId"));Json.put(row,"content_json",p.opt("contentJson"));Json.put(row,"conflict_of",p.opt("conflictOf"));}
                records.get(kind).put(id,row);response=Json.obj("status","applied","record",row,"todoPlanningVersion",1);
            }
            receipts.put(receipt,Json.copy(response));if(failNext&&kind.equals("note")){failNext=false;throw new java.io.IOException("Synthetic lost response");}return Json.copy(response);
        }
    }
}
