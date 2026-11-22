package app.jotday.calendar;

import android.content.Context;
import org.json.*;
import java.time.*;
import java.util.*;

/** Opt-in real service check: isolated synthetic workspace, never the user's workspace. */
final class CloudChecks {
    static String run(Context context)throws Exception{
        if(context.getSharedPreferences("calendar",0).getBoolean("paired",false))throw new IllegalStateException("Cloud checks require an unpaired synthetic emulator");
        String workspace=UUID.randomUUID().toString();CloudClient cloud=new CloudClient(context);cloud.rpc("enroll_local_workspace",Json.obj("p_workspace_id",workspace));
        PlannerStore a=new PlannerStore(context,workspace,"test-cloud-a-"+workspace+".db"),b=new PlannerStore(context,workspace,"test-cloud-b-"+workspace+".db");WorkspaceSync first=new WorkspaceSync(a,cloud),second=new WorkspaceSync(b,new CloudClient(context));
        PlannerSync plannerA=new PlannerSync(a,cloud),plannerB=new PlannerSync(b,new CloudClient(context));String outcome="";
        try{
            JSONObject book=WorkspaceRecords.create("notebook",workspace);Json.put(book,"name","Jotday synthetic APK verification");WorkspaceRecords.save(a,"notebook",book);
            JSONObject note=WorkspaceRecords.create("note",workspace);Json.put(note,"notebook_id",book.optString("id"));Json.put(note,"title","Synthetic Android note");Json.put(note,"body","Native rich document");Json.put(note,"content_json",NativeRichEditor.plain("Native rich document"));WorkspaceRecords.save(a,"note",note);
            JSONObject todo=WorkspaceRecords.task(a,"Synthetic Android todo",LocalDate.now(CalendarProjector.ZONE),"Synthetic test only");WorkspaceRecords.save(a,"todo",todo);
            JSONObject event=Json.obj("id",UUID.randomUUID().toString(),"workspaceId",workspace,"title","Synthetic Android calendar event","start",LocalDate.now(CalendarProjector.ZONE)+"T09:00","end",LocalDate.now(CalendarProjector.ZONE)+"T10:00","allDay",false,"timeZone","Asia/Hong_Kong","color","purple","notes","","location","","url","","exceptions",Json.obj(),"deletedAt",null,"updatedAt",Instant.now().toString());a.put("event",event);
            first.run();plannerA.run();second.run();plannerB.run();
            if(b.get("note",note.optString("id"))==null||b.get("todo",todo.optString("id"))==null||b.get("event",event.optString("id"))==null)throw new AssertionError("server round trip missing content");
            JSONObject remoteNote=b.get("note",note.optString("id"));Json.put(remoteNote,"title","Synthetic second client edit");WorkspaceRecords.save(b,"note",remoteNote);WorkspaceRecords.status(b,b.get("todo",todo.optString("id")),"completed");
            JSONObject remoteEvent=b.get("event",event.optString("id"));Json.put(remoteEvent,"title","Synthetic second client calendar edit");b.put("event",remoteEvent);second.run();plannerB.run();first.run();plannerA.run();
            if(!a.get("note",note.optString("id")).optString("title").equals("Synthetic second client edit")||!a.get("todo",todo.optString("id")).optBoolean("completed")||!a.get("event",event.optString("id")).optString("title").contains("second client"))throw new AssertionError("bidirectional updates missing");
            outcome="PASS: real service notebook/note/todo/calendar create, independent cache pull, reverse edit and completion";
        }finally{
            try{for(String kind:WorkspaceRecords.KINDS)for(JSONObject row:a.all(kind)){Json.put(row,"deleted_at",Instant.now().toString());WorkspaceRecords.save(a,kind,row);}for(JSONObject event:a.all("event")){Json.put(event,"deletedAt",Instant.now().toString());a.put("event",event);}first.run();plannerA.run();second.run();plannerB.run();for(JSONObject row:b.all("note"))if(WorkspaceRecords.alive(row))throw new AssertionError("deleted note revived");outcome+="; synthetic rows soft-deleted and deletion verified";}finally{a.close();b.close();}
        }return outcome;
    }
}
